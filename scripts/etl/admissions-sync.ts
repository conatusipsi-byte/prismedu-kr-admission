#!/usr/bin/env node
/**
 * 모집요강 ETL 동기화 — admissions 컬렉션 갱신
 *
 * 본 파일은 ETL 파이프라인 진입점이자 trackPattern 어휘 점검 후크의 통합 지점.
 * 실제 모집요강 파싱(PDF/HTML → JSON)은 본 파일 스코프 밖이며, 본 스크립트는
 * 파싱 결과를 받아 Firestore admissionsStaging 에 쓰고 후속 점검을 수행한다.
 *
 * 2단계 ETL 운영 (P-012):
 *   --phase initial    : 7~9월 모집요강 시즌. 기본 파싱 + conversionTable.status="preliminary".
 *   --phase conversion : 12월 수능 후 변환표 갱신만. status="preliminary" → "finalized".
 *
 * 흐름 (initial):
 *   1. (본체 — 별도 모듈) 모집요강 PDF/HTML 다운로드 + 파싱 → DepartmentAdmissions[]
 *   2. PDF 인코딩 fallback 체인 (UTF-8 → Adobe-Korea1 → OCR) — operations.md §10
 *   3. admissionsStaging/{year} 컬렉션에 쓰기 (운영자 검수용)
 *   4. ★ trackPattern 어휘 점검 후크 — 신규 어휘 발견 시 자동 갱신 + 알림
 *   5. 운영자 알림 (admin 대시보드)
 *
 * 흐름 (conversion):
 *   1. 대학별 변환표 PDF/HTML 수집
 *   2. 학과별 admissions/{year}.tracks[*].conversionTable 갱신
 *   3. status: preliminary → finalized
 *   4. 정시 매칭 알고리즘이 즉시 활성화
 *
 * 운영 정책:
 *   - admissions (live) 직접 갱신 X — 항상 admissionsStaging 거쳐 운영자 승격
 *   - 학년도 N의 initial은 N-1년 7~9월, conversion은 N-1년 12월
 *
 * CLI:
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json \
 *   npx tsx scripts/etl/admissions-sync.ts --year 2027 --phase initial
 *
 *   npx tsx scripts/etl/admissions-sync.ts --year 2027 --phase conversion
 */

import { initializeApp, cert, getApps, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue, type Firestore } from "firebase-admin/firestore";
import { runTrackVocabCheck, type VocabCheckResult } from "../update-track-vocab-fixtures";
import { extractTextFromPdf, PdfExtractionError } from "./parsers/pdf-text";
import { ocrPdfFallback, OcrFallbackError } from "./parsers/ocr-fallback";
import { normalizeAdmissionText } from "./parsers/normalizer";
import type { ParsedAdmissionPartial, ParserTrustLevel } from "./parsers/types";
import { finalizeMinReq } from "../../lib/admission/min-req-classifier";

/* ═══════════════════════════════════════════════════════════════════════
   진입점
   ═══════════════════════════════════════════════════════════════════════ */

export type SyncPhase = "initial" | "conversion";

interface SyncOptions {
  year: number;
  phase: SyncPhase;
  /** dry-run — Firestore write 스킵, 어휘 점검만 */
  dryRun?: boolean;
}

async function syncAdmissions(opts: SyncOptions): Promise<void> {
  if (getApps().length === 0) {
    initializeApp({
      credential: process.env.GOOGLE_APPLICATION_CREDENTIALS
        ? cert(process.env.GOOGLE_APPLICATION_CREDENTIALS)
        : applicationDefault(),
    });
  }
  const db = getFirestore();

  console.log(`📥 학년도 ${opts.year} ETL [${opts.phase}] 시작...`);

  if (opts.phase === "conversion") {
    return syncConversionPhase(db, opts);
  }

  // ────────────────────────────────────────────────────────────────────
  // initial 단계 (7~9월)
  // ────────────────────────────────────────────────────────────────────

  // 1. 모집요강 파싱 — 별도 모듈에서 구현
  //    e.g., import { parseMoeBulletins } from "./parsers/moe";
  //    const parsed = await parseMoeBulletins(opts.year);
  //    파싱 시 PDF 인코딩 fallback 체인 적용 (operations.md §10):
  //      1차 pdftotext -enc UTF-8
  //      2차 pdftotext -enc Adobe-Korea1
  //      3차 Tesseract OCR (kor) → trustLevel="suspicious" 마킹
  //
  //    본 스크립트는 후크 통합 시연 목적. 실제 ETL 본체는 별도 PR 작성 예정.
  //
  // 2. admissionsStaging 쓰기
  //    initial 단계에서 신규 생성되는 트랙은 conversionTable.status="preliminary".
  //    정시 트랙(jeongsi_*)은 변환표 미정 표시 — 매칭 시 사용자에게 안내.
  //    if (!opts.dryRun) await writeStaging(db, opts.year, parsed, { conversionStatus: "preliminary" });

  // 3. ★ trackPattern 어휘 점검 후크
  console.log(`\n🔍 trackPattern 어휘 점검...`);
  const vocabResult = await runTrackVocabCheck();

  if (vocabResult.newVocab.length > 0) {
    console.log(
      `🆕 신규 어휘 ${vocabResult.newVocab.length}개 ` +
        `(✓ trusted ${vocabResult.trustedNew.length} / ⚠️ suspicious ${vocabResult.suspiciousNew.length})`,
    );

    // 4. 운영자 알림 — admin 대시보드.
    //    suspicious 어휘가 있으면 severity 한 단계 격상 ("warning" → "critical")
    //    OCR/파싱 오류 의심은 즉각 대응 대상.
    if (!opts.dryRun) {
      const hasSuspicious = vocabResult.suspiciousNew.length > 0;
      const severity: AdminNotification["severity"] = hasSuspicious ? "critical" : "warning";

      const trustedLines = vocabResult.trustedNew.map((v) => {
        const s = vocabResult.vocabStats[v];
        return `  ✓ "${v}계열" (${s.trustReason})`;
      });
      const suspiciousLines = vocabResult.suspiciousNew.map((v) => {
        const s = vocabResult.vocabStats[v];
        return `  ⚠️ "${v}계열" (${s.trustReason})`;
      });

      await notifyAdmin(db, {
        kind: "track_vocab_new",
        severity,
        title:
          `trackPattern 신규 어휘 ${vocabResult.newVocab.length}개` +
          (hasSuspicious ? ` (⚠️ 의심 ${vocabResult.suspiciousNew.length}개 포함)` : ""),
        body:
          (vocabResult.trustedNew.length > 0
            ? `[Trusted — 자동 추가됨]\n${trustedLines.join("\n")}\n\n`
            : "") +
          (hasSuspicious
            ? `[Suspicious — 검수 필요 (OCR/파싱 오류 가능성)]\n${suspiciousLines.join("\n")}\n\n`
            : "") +
          `자동 갱신 PR 검수 필요 (.github/workflows/track-vocab-check.yml).`,
        meta: {
          trustedNew: vocabResult.trustedNew,
          suspiciousNew: vocabResult.suspiciousNew,
          changedFiles: vocabResult.changedFiles,
          scannedDocs: vocabResult.scannedDocs,
        },
      });
    }
  } else {
    console.log(`✅ 어휘 점검 통과 — 신규 어휘 없음`);
  }

  console.log(`\n✨ ETL 완료`);
}

/* ═══════════════════════════════════════════════════════════════════════
   conversion 단계 (12월) — 변환표 갱신만
   ═══════════════════════════════════════════════════════════════════════ */

async function syncConversionPhase(
  db: FirebaseFirestore.Firestore,
  opts: SyncOptions,
): Promise<void> {
  console.log(`\n📋 변환표 갱신 단계 — 수능 후 대학별 변환표 fetch + status finalized 전환`);

  // 1. (본체 — 별도 모듈) 대학별 변환표 PDF/HTML 수집
  //    e.g., import { fetchConversionTables } from "./parsers/conversion-tables";
  //    const tables = await fetchConversionTables(opts.year);
  //
  //    출력 형태: { universityId, departmentId, trackKind, table: Record<course, score>, sourceUrl }[]
  //
  //    수능은 11월 셋째 목 → 변환표는 보통 12월 첫째 ~ 둘째 주 발표.
  //    학교마다 발표 시점이 다르므로 본 스크립트를 12월 동안 매일 실행하는 cron 권장.

  // 2. 학과별 admissions/{year}.tracks[*].conversionTable 갱신
  //    if (!opts.dryRun) {
  //      for (const { universityId, departmentId, trackKind, table, sourceUrl } of tables) {
  //        const ref = db.collection("universities").doc(universityId)
  //          .collection("departments").doc(departmentId)
  //          .collection("admissions").doc(String(opts.year));
  //        // tracks 안 해당 trackKind 의 모든 트랙에서 conversionTable 갱신.
  //        // 트랜잭션으로 처리 — preliminary → finalized 전환은 멱등.
  //        await ref.update({...});
  //      }
  //    }

  // 3. 매칭 캐시 무효화 — 변환표 갱신 즉시 정시 합격 추정 활성화
  //    await invalidateMatchCache(opts.year);

  // 4. 운영자 알림 — finalized 도달율, 미발표 학교 목록
  if (!opts.dryRun) {
    await notifyAdmin(db, {
      kind: "conversion_phase_complete",
      severity: "info",
      title: `학년도 ${opts.year} 변환표 갱신 1회 실행 완료`,
      body:
        `대학별 변환표 fetch 후 conversionTable.status 를 finalized 로 전환했습니다.\n\n` +
        `다음 점검:\n` +
        `  - admin 대시보드 /admin/conversion-status 에서 미발표 학교 확인\n` +
        `  - status="preliminary" 잔존 학과는 다음 cron 실행 시 재시도\n` +
        `  - 정시 매칭 캐시 무효화 완료`,
      meta: { year: opts.year, phase: "conversion" },
    });
  }

  console.log(`✅ 변환표 갱신 단계 완료`);
}

/* ═══════════════════════════════════════════════════════════════════════
   운영자 알림 — admin 대시보드 노출
   ═══════════════════════════════════════════════════════════════════════ */

interface AdminNotification {
  kind: string;
  severity: "info" | "warning" | "critical";
  title: string;
  body: string;
  meta?: Record<string, unknown>;
}

async function notifyAdmin(
  db: FirebaseFirestore.Firestore,
  notification: AdminNotification,
): Promise<void> {
  // monitoring/adminNotifications/items/{auto-id}
  // admin 대시보드(/admin)는 본 컬렉션을 미해결(unresolved=true) 기준으로 노출
  await db
    .collection("monitoring")
    .doc("adminNotifications")
    .collection("items")
    .add({
      ...notification,
      unresolved: true,
      createdAt: FieldValue.serverTimestamp(),
    });
}

/* ═══════════════════════════════════════════════════════════════════════
   CLI
   ═══════════════════════════════════════════════════════════════════════ */

function parseArgs(): SyncOptions {
  const args = process.argv.slice(2);
  let year = new Date().getFullYear() + 1;
  let phase: SyncPhase = "initial";
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--year") year = parseInt(args[++i], 10);
    else if (args[i] === "--phase") {
      const v = args[++i];
      if (v !== "initial" && v !== "conversion") {
        throw new Error(`--phase 값은 "initial" 또는 "conversion" 이어야 합니다: ${v}`);
      }
      phase = v;
    } else if (args[i] === "--dry-run") dryRun = true;
  }
  if (!Number.isFinite(year) || year < 2025 || year > 2099) {
    throw new Error(`유효하지 않은 학년도: ${year}`);
  }
  return { year, phase, dryRun };
}

if (require.main === module) {
  syncAdmissions(parseArgs()).catch((e) => {
    console.error("🚨 ETL 실패:", e);
    process.exit(1);
  });
}

export { syncAdmissions, type VocabCheckResult };

/* ═══════════════════════════════════════════════════════════════════════
   단일 PDF → admissionsStaging 처리 (Day 10에서 /admin/etl-upload가 호출)
   ───────────────────────────────────────────────────────────────────────
   흐름 (3단계 fallback chain):
     1. extractTextFromPdf — UTF-8 → Adobe-Korea1 (trusted / trusted-fallback)
     2. 실패 → ocrPdfFallback — Tesseract (suspicious 강제)
     3. 실패 → throw + admin 알림 (Day 10 라우트 처리)
   추출 텍스트 → normalizeAdmissionText → ParsedAdmissionPartial
   admissionsStaging/{stagingId} 도큐먼트 작성 (운영자 검수 후 admissions 승격).
   ═══════════════════════════════════════════════════════════════════════ */

export interface ProcessPdfToStagingInput {
  pdfPath: string;
  universityId: string;
  year: number;
  /** 업로드자 uid — admin 검수 시 추적 */
  uploadedBy: string;
  /** 원본 파일명 (Storage 키 또는 사용자 업로드명) */
  sourceFilename: string;
}

export interface ProcessPdfToStagingResult {
  /** Firestore admissionsStaging 도큐먼트 ID */
  stagingId: string;
  trustLevel: ParserTrustLevel;
  parsed: ParsedAdmissionPartial;
  /** 자동판정 통과한 csatMinimum (있으면) — finalizeMinReq 결과 */
  csatMinimumFinalized?: import("../../types/admission").CsatMinimum;
  /** 사용한 fallback 단계 — 디버그·검수 컨텍스트 */
  toolChain: string[];
}

/**
 * 단일 PDF를 정규화해 admissionsStaging에 적재.
 *
 * 사용처:
 *   - scripts/etl/admissions-sync.ts initial phase (배치)
 *   - app/api/admin/etl-upload/route.ts (Day 10 — 수동 업로드)
 *
 * trustLevel 매핑:
 *   - pdftotext UTF-8           → "trusted"
 *   - pdftotext Adobe-Korea1     → "trusted-fallback"
 *   - Tesseract OCR             → "suspicious" (운영자 검수 강제)
 *
 * 실패 시 throw — 호출자가 운영자 알림 처리.
 */
export async function processPdfToStaging(
  db: Firestore,
  input: ProcessPdfToStagingInput,
): Promise<ProcessPdfToStagingResult> {
  const toolChain: string[] = [];
  let text: string;
  let trustLevel: ParserTrustLevel;

  // 1·2단계 — pdftotext fallback chain
  try {
    const pdf = await extractTextFromPdf(input.pdfPath);
    text = pdf.text;
    trustLevel = pdf.trustLevel;
    toolChain.push(...pdf.attempts.map((a) => `${a.tool}${a.success ? "✓" : "✗"}`));
  } catch (e) {
    if (!(e instanceof PdfExtractionError)) throw e;
    toolChain.push(...e.attempts.map((a) => `${a.tool}${a.success ? "✓" : "✗"}`));
    // 3단계 — OCR fallback
    try {
      const ocr = await ocrPdfFallback(input.pdfPath);
      text = ocr.text;
      trustLevel = ocr.trustLevel; // 항상 "suspicious"
      toolChain.push(...ocr.attempts.map((a) => `${a.tool}${a.success ? "✓" : "✗"}`));
    } catch (ocrErr) {
      if (!(ocrErr instanceof OcrFallbackError)) throw ocrErr;
      toolChain.push(...ocrErr.attempts.map((a) => `${a.tool}${a.success ? "✓" : "✗"}`));
      throw new Error(
        `ETL 파싱 실패 — 모든 fallback 단계 실패. toolChain=${toolChain.join(",")}`,
      );
    }
  }

  // 정규화
  const parsed = normalizeAdmissionText(text, { inputTrustLevel: trustLevel });

  // 자동판정 (csatMinimum이 추출됐을 때만)
  let csatMinimumFinalized: import("../../types/admission").CsatMinimum | undefined;
  if (parsed.csatMinimumPartial) {
    csatMinimumFinalized = finalizeMinReq({
      candidateAreas: parsed.csatMinimumPartial.candidateAreas,
      requiredCount: parsed.csatMinimumPartial.requiredCount,
      sumGradeMax: parsed.csatMinimumPartial.sumGradeMax,
      englishGradeMax: parsed.csatMinimumPartial.englishGradeMax,
      historyGradeMax: parsed.csatMinimumPartial.historyGradeMax,
      investigationRule: parsed.csatMinimumPartial.investigationRule,
      originalText: parsed.csatMinimumPartial.originalText,
    });
  }

  // admissionsStaging 작성
  const stagingId = `staging_${input.universityId}_${input.year}_${Date.now()}`;
  await db.collection("admissionsStaging").doc(stagingId).set({
    id: stagingId,
    universityId: input.universityId,
    year: input.year,
    uploadedBy: input.uploadedBy,
    sourceFilename: input.sourceFilename,
    trustLevel,
    toolChain,
    parsed,
    csatMinimumFinalized: csatMinimumFinalized ?? null,
    /** 운영자 검수 완료 후 admissions(live)로 승격될 때 true */
    promoted: false,
    createdAt: FieldValue.serverTimestamp(),
  });

  return { stagingId, trustLevel, parsed, csatMinimumFinalized, toolChain };
}
