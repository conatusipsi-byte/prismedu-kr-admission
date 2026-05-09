#!/usr/bin/env node
/**
 * trackPattern 어휘 + fixture 자동 갱신 스크립트
 *
 * 흐름:
 *   1. Firestore admissions collectionGroup 전체 순회
 *   2. csatMinimum.{originalText, additionalRules} 에서 ○○계열 추출
 *   3. 어휘별 통계 집계 (raw 등장 횟수 + unique 텍스트)
 *   4. 신뢰도 분류:
 *        - trusted    : rawCount ≥ 3 (OCR/파싱 일관성 확보)
 *        - suspicious : rawCount 1~2 (노이즈 가능성, 별도 섹션 + PR 경고)
 *   5. 신규 어휘 발견 시:
 *        a. lib/admission/min-req-classifier.ts → TRACK_PATTERN_VOCAB 갱신
 *        b. lib/admission/__tests__/fixtures/sample-min-reqs.ts → 카테고리별 분리 추가
 *           - trusted 동일 텍스트 다수 : fixture 에 1건만
 *           - trusted 다양 텍스트       : 최대 3건
 *           - suspicious                : "⚠️ 의심" 별도 섹션 + 실제 등장 텍스트만
 *   6. git diff 출력 + exit code (변경 1, 무변경 0, 실패 2)
 *
 * 노이즈 필터 결정 근거 (operations.md §6.4):
 *   OCR 오류·파싱 실패로 "예체른계열" 같은 잘못된 어휘가 1번만 잡혀도 자동
 *   머지되는 위험 차단. rawCount=1 어휘는 즉시 운영자가 식별할 수 있도록
 *   fixture 별도 섹션 + PR 본문 경고 + ⚠️ 마커.
 *
 * CLI 사용:
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json \
 *   npx tsx scripts/update-track-vocab-fixtures.ts
 *
 * 모듈 사용 (ETL 파이프라인 후크):
 *   import { runTrackVocabCheck } from "./scripts/update-track-vocab-fixtures";
 *   const result = await runTrackVocabCheck();
 *   if (result.suspiciousNew.length > 0) await notifyAdmin(...);
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { initializeApp, cert, getApps, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

/* ═══════════════════════════════════════════════════════════════════════
   설정
   ═══════════════════════════════════════════════════════════════════════ */

const PROJECT_ROOT = path.resolve(__dirname, "..");
const CLASSIFIER_PATH = path.join(PROJECT_ROOT, "lib/admission/min-req-classifier.ts");
const FIXTURES_PATH = path.join(PROJECT_ROOT, "lib/admission/__tests__/fixtures/sample-min-reqs.ts");

/** 한글 2~6자 + "계열" + 직후 한글 아님 (계열별·계열의 등 합성 어미 제외) */
const VOCAB_CAPTURE = /([가-힣]{2,6})계열(?![가-힣])/g;

/** 신뢰도 임계 — rawCount 이 이상이면 trusted */
const TRUST_RAW_COUNT_THRESHOLD = 3;

/** trusted 어휘 1개당 fixture 에 추가할 최대 샘플 수 */
const TRUSTED_SAMPLES_MAX = 3;

/* ═══════════════════════════════════════════════════════════════════════
   타입
   ═══════════════════════════════════════════════════════════════════════ */

export type TrustLevel = "trusted" | "suspicious";

export interface VocabStat {
  vocab: string;
  /** 어휘 등장 raw 횟수 (중복 텍스트 포함) */
  rawCount: number;
  /** 중복 제거된 등장 텍스트 */
  uniqueTexts: string[];
  /** 신뢰도 */
  trustLevel: TrustLevel;
  /** 신뢰도 판단 사유 (CLI/PR 본문에 노출) */
  trustReason: string;
}

export interface VocabCheckResult {
  /** 발견된 모든 어휘 (중복 제거) */
  found: string[];
  /** 기존 TRACK_PATTERN_VOCAB */
  existing: string[];
  /** 신규 어휘 전체 */
  newVocab: string[];
  /** 신뢰도 trusted 신규 어휘 */
  trustedNew: string[];
  /** 신뢰도 suspicious 신규 어휘 (PR 검수 핵심 대상) */
  suspiciousNew: string[];
  /** 갱신된 파일 절대경로 */
  changedFiles: string[];
  /** 신규 어휘별 통계 */
  vocabStats: Record<string, VocabStat>;
  /** 점검한 admissions 도큐먼트 수 */
  scannedDocs: number;
  /** 점검한 originalText·additionalRules 합계 */
  scannedTexts: number;
}

/* ═══════════════════════════════════════════════════════════════════════
   메인
   ═══════════════════════════════════════════════════════════════════════ */

export async function runTrackVocabCheck(): Promise<VocabCheckResult> {
  if (getApps().length === 0) {
    initializeApp({
      credential: process.env.GOOGLE_APPLICATION_CREDENTIALS
        ? cert(process.env.GOOGLE_APPLICATION_CREDENTIALS)
        : applicationDefault(),
    });
  }
  const db = getFirestore();

  const { allTexts, scannedDocs } = await collectAllTexts(db);

  // 어휘별 통계 집계
  const stats = new Map<string, VocabStat>();
  for (const text of allTexts) {
    for (const m of text.matchAll(VOCAB_CAPTURE)) {
      const vocab = m[1];
      let s = stats.get(vocab);
      if (!s) {
        s = {
          vocab, rawCount: 0, uniqueTexts: [],
          trustLevel: "suspicious", trustReason: "",
        };
        stats.set(vocab, s);
      }
      s.rawCount += 1;
      if (!s.uniqueTexts.includes(text)) s.uniqueTexts.push(text);
    }
  }

  // 신뢰도 결정
  for (const s of stats.values()) {
    if (s.rawCount >= TRUST_RAW_COUNT_THRESHOLD) {
      s.trustLevel = "trusted";
      s.trustReason =
        s.uniqueTexts.length === 1
          ? `rawCount=${s.rawCount} · 모두 동일 텍스트 (일관성 ↑)`
          : `rawCount=${s.rawCount} · uniqueTexts=${s.uniqueTexts.length}`;
    } else {
      s.trustLevel = "suspicious";
      s.trustReason = `rawCount=${s.rawCount} (< ${TRUST_RAW_COUNT_THRESHOLD}) — OCR/파싱 오류 가능성`;
    }
  }

  // 기존 어휘 비교
  const classifier = fs.readFileSync(CLASSIFIER_PATH, "utf8");
  const existing = parseExistingVocab(classifier);
  const newVocab = [...stats.keys()].filter((v) => !existing.includes(v)).sort();

  const trustedNew = newVocab.filter((v) => stats.get(v)!.trustLevel === "trusted");
  const suspiciousNew = newVocab.filter((v) => stats.get(v)!.trustLevel === "suspicious");

  const vocabStats: Record<string, VocabStat> = {};
  for (const v of newVocab) vocabStats[v] = stats.get(v)!;

  if (newVocab.length === 0) {
    return {
      found: [...stats.keys()].sort(),
      existing,
      newVocab: [],
      trustedNew: [],
      suspiciousNew: [],
      changedFiles: [],
      vocabStats: {},
      scannedDocs,
      scannedTexts: allTexts.length,
    };
  }

  // 코드 갱신 — TRACK_PATTERN_VOCAB 에는 trusted + suspicious 모두 추가.
  // suspicious 도 어휘 자체는 등재해야 분류기가 conditional 로 잡음. 단, fixture 분리로 검수 강제.
  const newClassifier = updateClassifierVocab(classifier, [...existing, ...newVocab]);
  fs.writeFileSync(CLASSIFIER_PATH, newClassifier, "utf8");

  // fixture 갱신 — trusted/suspicious 별도 섹션
  const fixtures = fs.readFileSync(FIXTURES_PATH, "utf8");
  const newFixtures = appendFixturesForNewVocab(fixtures, newVocab, vocabStats);
  fs.writeFileSync(FIXTURES_PATH, newFixtures, "utf8");

  return {
    found: [...stats.keys()].sort(),
    existing,
    newVocab,
    trustedNew,
    suspiciousNew,
    changedFiles: [CLASSIFIER_PATH, FIXTURES_PATH],
    vocabStats,
    scannedDocs,
    scannedTexts: allTexts.length,
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   Firestore 수집
   ═══════════════════════════════════════════════════════════════════════ */

async function collectAllTexts(
  db: FirebaseFirestore.Firestore,
): Promise<{ allTexts: string[]; scannedDocs: number }> {
  const snapshot = await db.collectionGroup("admissions").get();
  const texts: string[] = [];
  for (const doc of snapshot.docs) extractMinReqTexts(doc.data(), texts);
  return { allTexts: texts, scannedDocs: snapshot.size };
}

function extractMinReqTexts(data: unknown, out: string[]): void {
  const d = data as { tracks?: Record<string, unknown> };
  if (!d?.tracks) return;
  for (const trackKind of Object.keys(d.tracks)) {
    const arr = d.tracks[trackKind];
    if (!Array.isArray(arr)) continue;
    for (const t of arr) {
      const min = (t as { csatMinimum?: { originalText?: string; additionalRules?: string } })
        ?.csatMinimum;
      if (typeof min?.originalText === "string") out.push(min.originalText);
      if (typeof min?.additionalRules === "string") out.push(min.additionalRules);
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   코드 갱신
   ═══════════════════════════════════════════════════════════════════════ */

function parseExistingVocab(source: string): string[] {
  const m = source.match(/export const TRACK_PATTERN_VOCAB = \[([\s\S]*?)\] as const;/);
  if (!m) {
    throw new Error(
      "TRACK_PATTERN_VOCAB 배열을 찾을 수 없습니다. 분류기 코드 형식이 변경됐다면 본 스크립트도 갱신 필요.",
    );
  }
  return [...m[1].matchAll(/"([가-힣]+)"/g)].map((x) => x[1]);
}

function updateClassifierVocab(source: string, allVocab: string[]): string {
  const formatted = formatVocabArray(allVocab);
  return source.replace(
    /export const TRACK_PATTERN_VOCAB = \[[\s\S]*?\] as const;/,
    `export const TRACK_PATTERN_VOCAB = [\n${formatted}\n] as const;`,
  );
}

function formatVocabArray(vocab: string[]): string {
  const lines: string[] = [];
  for (let i = 0; i < vocab.length; i += 4) {
    const chunk = vocab.slice(i, i + 4);
    lines.push(`  ${chunk.map((v) => `"${v}"`).join(", ")},`);
  }
  return lines.join("\n");
}

function appendFixturesForNewVocab(
  source: string,
  newVocab: string[],
  stats: Record<string, VocabStat>,
): string {
  const trusted = newVocab.filter((v) => stats[v].trustLevel === "trusted");
  const suspicious = newVocab.filter((v) => stats[v].trustLevel === "suspicious");

  const idMatches = [...source.matchAll(/{ id: (\d+),/g)];
  const lastId = idMatches.length > 0 ? Math.max(...idMatches.map((m) => parseInt(m[1], 10))) : 0;

  let nextId = lastId + 1;
  const blocks: string[] = [];

  // ── Trusted 블록 ────────────────────────────────────────────
  for (const vocab of trusted) {
    const s = stats[vocab];
    // 동일 텍스트만 다수 등장한 어휘는 fixture에 1건만 추가 (중복 노이즈 방지)
    const sampleTexts =
      s.uniqueTexts.length === 1
        ? [s.uniqueTexts[0]]
        : s.uniqueTexts.slice(0, TRUSTED_SAMPLES_MAX);

    blocks.push(
      `\n  // ── ✓ ${vocab}계열 (자동 추가, ${s.trustReason}) ─────────────`,
    );
    for (const text of sampleTexts) {
      const escaped = escapeForLiteral(text);
      blocks.push(
        `  { id: ${nextId++}, text: "${escaped}", expectedTracks: ["${vocab}"] },`,
      );
    }
  }

  // ── Suspicious 블록 (별도 섹션 헤더) ────────────────────────
  if (suspicious.length > 0) {
    blocks.push("");
    blocks.push("  // ════════════════════════════════════════════════════════════");
    blocks.push("  // ⚠️  의심 어휘 — OCR/파싱 오류 가능성. 머지 전 반드시 검수.");
    blocks.push("  //                                                                ");
    blocks.push("  //  대응:");
    blocks.push("  //    - 정당한 계열명 → 그대로 머지 + min-req-classifier.test.ts 회귀 추가");
    blocks.push("  //    - OCR 오류     → TRACK_PATTERN_VOCAB 에서 제거 + 본 fixture 항목 삭제");
    blocks.push("  // ════════════════════════════════════════════════════════════");

    for (const vocab of suspicious) {
      const s = stats[vocab];
      blocks.push(`\n  // ── ⚠️ ${vocab}계열 (${s.trustReason}) ─────────────`);
      for (const text of s.uniqueTexts) {
        const escaped = escapeForLiteral(text);
        blocks.push(
          `  { id: ${nextId++}, text: "${escaped}", expectedTracks: ["${vocab}"] },`,
        );
      }
    }
  }

  if (blocks.length === 0) return source;
  return source.replace(/\n\];\s*\n*$/m, `\n${blocks.join("\n")}\n];\n`);
}

function escapeForLiteral(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/* ═══════════════════════════════════════════════════════════════════════
   CLI
   ═══════════════════════════════════════════════════════════════════════ */

async function main(): Promise<void> {
  console.log("🔍 trackPattern 어휘 점검 시작...\n");

  const result = await runTrackVocabCheck();

  console.log(`📊 점검 결과:`);
  console.log(`  - 스캔한 admissions 도큐먼트: ${result.scannedDocs}`);
  console.log(`  - 검사한 텍스트: ${result.scannedTexts}`);
  console.log(`  - 발견된 ○○계열 어휘: ${result.found.length}개`);
  console.log(`  - 기존 어휘: ${result.existing.length}개`);
  console.log(`  - 신규 어휘: ${result.newVocab.length}개`);
  if (result.newVocab.length > 0) {
    console.log(`      ✓ trusted    : ${result.trustedNew.length}개`);
    console.log(`      ⚠️  suspicious: ${result.suspiciousNew.length}개`);
  }
  console.log("");

  if (result.newVocab.length === 0) {
    console.log("✅ 어휘 변경 없음 — 모든 ○○계열 표현이 TRACK_PATTERN_VOCAB 으로 커버됨\n");
    process.exit(0);
  }

  if (result.trustedNew.length > 0) {
    console.log(`✓ Trusted 신규 어휘 ${result.trustedNew.length}개 (자동 추가):`);
    for (const v of result.trustedNew) {
      const s = result.vocabStats[v];
      console.log(`  - "${v}계열" — ${s.trustReason}`);
    }
    console.log("");
  }

  if (result.suspiciousNew.length > 0) {
    console.log(`⚠️  Suspicious 신규 어휘 ${result.suspiciousNew.length}개 (검수 필요):`);
    for (const v of result.suspiciousNew) {
      const s = result.vocabStats[v];
      console.log(`  - "${v}계열" — ${s.trustReason}`);
      for (const text of s.uniqueTexts) {
        console.log(`      · ${text.length > 70 ? text.slice(0, 70) + "…" : text}`);
      }
    }
    console.log("");
    console.log("  → fixture 별도 섹션(⚠️ 의심 어휘)에 추가됨. PR 검수 시 OCR 오류 vs 정당한 계열명 판정 필요.\n");
  }

  console.log(`📝 갱신된 파일:`);
  for (const f of result.changedFiles) {
    console.log(`  - ${path.relative(PROJECT_ROOT, f)}`);
  }

  console.log(`\n🔀 git diff:\n`);
  try {
    const diff = execSync("git diff --no-color -- lib/admission", {
      cwd: PROJECT_ROOT,
      encoding: "utf8",
    });
    console.log(diff || "(diff 출력 없음 — git 미초기화 환경일 수 있음)");
  } catch (e) {
    console.warn("⚠️ git diff 실행 실패 (CI 환경에서는 정상):", (e as Error).message);
  }

  console.log(
    `\n⚠️  PR 검수 가이드:\n` +
      `   1. ✓ trusted 어휘 — 패턴 일관성 확인됐으므로 fixture 텍스트만 빠르게 검토 후 머지\n` +
      `   2. ⚠️ suspicious 어휘 — 모집요강 원문 1~2건만 등장. 다음 중 판정:\n` +
      `        a) 정당한 신규 계열명 → 그대로 머지 + 회귀 케이스 1~2개 수동 추가\n` +
      `        b) OCR/파싱 오류 → TRACK_PATTERN_VOCAB 에서 제거 + fixture 항목 삭제\n` +
      `   3. npm run test 통과 후 Ready for review\n`,
  );

  process.exit(1);
}

if (require.main === module) {
  main().catch((e) => {
    console.error("🚨 스크립트 실행 실패:", e);
    process.exit(2);
  });
}
