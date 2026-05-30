#!/usr/bin/env node
/**
 * Broadcast 머저 — "전 모집단위" pseudo-dept 의 공통 track 을 실제 학과에 복제 (2026-05-30).
 *
 *   npx tsx scripts/etl/pdf-vision/broadcast.ts \
 *     --in=scripts/etl/pdf-vision/output/snu-full.json \
 *     --out=scripts/etl/pdf-vision/output/snu-merged.json
 *
 * 문제 구조:
 *   - 한국 대학 모집요강은 "반영비율은 전 모집단위 공통, 모집인원은 학과별" 형식.
 *   - Vision 이 두 entry 로 분리 추출 → 실제 학과에는 quotaInitial 만, "전 모집단위"
 *     pseudo-dept 에 reflectionStages 만 들어 있음.
 *
 * 해결:
 *   - pseudo-dept 분류:
 *     · pseudo-univ: "전 모집단위" / "전 모집단위(A, B 제외)" — 전체 broadcast.
 *     · pseudo-list: "성악과, 작곡과, ..." — comma list 학과들에 broadcast.
 *     · override-single: 단일 학과·단과대명 — 그 학과만 broadcast.
 *   - 우선순위:
 *     1. pseudo-list / override-single (구체적) 먼저 적용.
 *     2. pseudo-univ (catch-all) 마지막에, 제외 단과대 학과는 skip.
 *   - 머저 규칙:
 *     · 실제 학과의 기존 필드 값 우선 (quotaInitial 보존).
 *     · 빈 필드 (reflectionStages, csatMinimumRawText 등) 만 pseudo 값으로 채움.
 *     · sourcePages 는 합집합 (출처 추적성 유지).
 *   - 후처리: broadcast 완료 후 pseudo-dept entries 제거.
 *
 * 정직성 (P-002):
 *   - 가짜 데이터 생성 X — PDF 에 명시된 공통 정보를 복제만.
 *   - 제외 규칙 정확 (단과대 매핑 기반).
 *   - 매칭 실패 시 warnings 누적.
 */

import fs from "node:fs/promises";
import path from "node:path";

import type { RawDepartment, RawTrack } from "./types";

/* ───────────────────────────────────────────────────────────────────────
   학과 ↔ 단과대 매핑 (SNU 2027 수시 모집요강 추출 학과 기준)
   ─────────────────────────────────────────────────────────────────────── */

const SNU_FACULTY_OF: Record<string, string> = {
  // 음악대학
  "성악과": "음악대학",
  "작곡과": "음악대학",
  "피아노과": "음악대학",
  "관현악과": "음악대학",
  "국악과": "음악대학",
  // 미술대학
  "디자인과": "미술대학",
  "동양화과": "미술대학",
  "서양화과": "미술대학",
  "조소과": "미술대학",
  "공예과": "미술대학",
  // 의·치·수의·약학
  "의학과": "의과대학",
  "치의학과": "치의과대학",
  "수의예과": "수의과대학",
  "약학계열": "약학대학",
  // 생활과학대학
  "소비자아동학부 소비자학전공": "생활과학대학",
  "소비자아동학부 아동가족학전공": "생활과학대학",
  "식품영양학과": "생활과학대학",
  "의류학과": "생활과학대학",
  // 광역
  "첨단융합학부": "첨단융합학부",
  // 단과대 자체 entry (broadcast 대상 X — 자체 row)
  "농업생명과학대학": "농업생명과학대학",
};

/* ───────────────────────────────────────────────────────────────────────
   분류
   ─────────────────────────────────────────────────────────────────────── */

type DeptCategory = "real" | "pseudo-univ" | "pseudo-list" | "override-single";

function classifyDept(dep: RawDepartment): DeptCategory {
  if (dep.totalQuotaHint != null) return "real";
  if (dep.departmentName.startsWith("전 모집단위")) return "pseudo-univ";
  if (dep.departmentName.includes(",")) return "pseudo-list";
  return "override-single";
}

/* ───────────────────────────────────────────────────────────────────────
   제외 단과대 파싱
   "전 모집단위(미술대학, 사범대학, 음악대학 제외)" → ["미술대학", "사범대학", "음악대학"]
   ─────────────────────────────────────────────────────────────────────── */

function parseExcludedFaculties(pseudoUnivName: string): string[] {
  const m = pseudoUnivName.match(/\(([^)]+)\s*제외\s*\)/);
  if (!m) return [];
  return m[1].split(/[,，]\s*/).map((s) => s.trim().replace(/\s*제외\s*$/, ""));
}

/* ───────────────────────────────────────────────────────────────────────
   전형명 alias — Vision 이 같은 전형을 다르게 기재할 가능성 대응
   "학생부종합전형(지역균형전형)" === "지역균형전형"
   "학생부종합전형(일반전형)"     === "일반전형"
   ─────────────────────────────────────────────────────────────────────── */

function normalizeTrackName(name: string): string {
  // 학생부종합전형(X) → X
  const m = name.match(/^학생부종합전형\((.+)\)$/);
  if (m) return m[1].trim();
  // 실기위주전형(X) → 실기위주전형 (X 제거하고 카테고리만 — 예: "실기위주전형(일반전형)" → "실기위주전형")
  // 단 단순 매칭이라면 원본도 유지해야 함. 정규화는 양쪽 비교용.
  return name.trim();
}

function tracksMatch(a: string, b: string): boolean {
  if (a === b) return true;
  return normalizeTrackName(a) === normalizeTrackName(b);
}

/* ───────────────────────────────────────────────────────────────────────
   track 머저 — 빈 필드만 채움 + sourcePages 누적
   ─────────────────────────────────────────────────────────────────────── */

function mergeTrackInto(existing: RawTrack, incoming: RawTrack, warnings: string[]): void {
  // 기존 비어있던 필드만 채움 (기존 명시값 보존)
  if (existing.quotaInitial == null && incoming.quotaInitial != null) {
    existing.quotaInitial = incoming.quotaInitial;
  }
  if ((existing.reflectionStages == null || existing.reflectionStages.length === 0) && incoming.reflectionStages != null) {
    existing.reflectionStages = structuredClone(incoming.reflectionStages);
  }
  if (existing.csatMinimumRawText == null && incoming.csatMinimumRawText != null) {
    existing.csatMinimumRawText = incoming.csatMinimumRawText;
    existing.csatMinimumExempt = incoming.csatMinimumExempt;
  } else if (existing.csatMinimumExempt == null && incoming.csatMinimumExempt != null) {
    existing.csatMinimumExempt = incoming.csatMinimumExempt;
  }
  if (existing.csatRequiredAreasRawText == null && incoming.csatRequiredAreasRawText != null) {
    existing.csatRequiredAreasRawText = incoming.csatRequiredAreasRawText;
  }
  if (existing.specialTypeKeyword == null && incoming.specialTypeKeyword != null) {
    existing.specialTypeKeyword = incoming.specialTypeKeyword;
  }
  if (existing.applicationQualification == null && incoming.applicationQualification != null) {
    existing.applicationQualification = incoming.applicationQualification;
  }
  if (existing.prevYearResult == null && incoming.prevYearResult != null) {
    existing.prevYearResult = incoming.prevYearResult;
  }
  // 충돌 검출 (둘 다 reflectionStages 가 있고 값이 다름 — broadcast 모순 표시)
  if (existing.reflectionStages != null && incoming.reflectionStages != null) {
    const e = JSON.stringify(existing.reflectionStages);
    const i = JSON.stringify(incoming.reflectionStages);
    if (e !== i) {
      warnings.push(`reflection 충돌: 기존값 우선 유지. existing=${e.slice(0, 80)}... incoming=${i.slice(0, 80)}...`);
    }
  }
  // sourcePages 합집합
  const allPages = new Set([...existing.sourcePages, ...incoming.sourcePages]);
  existing.sourcePages = Array.from(allPages).sort((a, b) => a - b);
}

/* ───────────────────────────────────────────────────────────────────────
   기존/신규 track 적용 — real dept 에 매칭 track 있으면 머저, 없으면 추가
   ─────────────────────────────────────────────────────────────────────── */

function applyTrackToRealDept(
  realDept: RawDepartment,
  pseudoTrack: RawTrack,
  warnings: string[],
): "merged" | "added" {
  const existing = realDept.tracks.find((t) => tracksMatch(t.trackName, pseudoTrack.trackName));
  if (existing) {
    mergeTrackInto(existing, pseudoTrack, warnings);
    return "merged";
  }
  realDept.tracks.push(structuredClone(pseudoTrack));
  return "added";
}

/* ───────────────────────────────────────────────────────────────────────
   메인 broadcast
   ─────────────────────────────────────────────────────────────────────── */

interface BroadcastReport {
  realDeptCount: number;
  pseudoUnivCount: number;
  pseudoListCount: number;
  overrideSingleCount: number;
  broadcastEvents: Array<{
    source: string;
    sourceCategory: DeptCategory;
    trackName: string;
    appliedTo: string[];
    excluded: string[];
    reason?: string;
  }>;
  warnings: string[];
}

function broadcast(allDepts: RawDepartment[]): { merged: RawDepartment[]; report: BroadcastReport } {
  const real = allDepts.filter((d) => classifyDept(d) === "real");
  const pseudoUniv = allDepts.filter((d) => classifyDept(d) === "pseudo-univ");
  const pseudoList = allDepts.filter((d) => classifyDept(d) === "pseudo-list");
  const overrides = allDepts.filter((d) => classifyDept(d) === "override-single");

  const report: BroadcastReport = {
    realDeptCount: real.length,
    pseudoUnivCount: pseudoUniv.length,
    pseudoListCount: pseudoList.length,
    overrideSingleCount: overrides.length,
    broadcastEvents: [],
    warnings: [],
  };

  // 1단계: pseudo-list 적용 (구체적 학과 명시)
  for (const pseudo of pseudoList) {
    const targets = pseudo.departmentName.split(/[,，]\s*/).map((s) => s.trim());
    for (const pTrack of pseudo.tracks) {
      const applied: string[] = [];
      const notFound: string[] = [];
      for (const target of targets) {
        const rd = real.find((d) => d.departmentName === target);
        if (!rd) {
          notFound.push(target);
          continue;
        }
        applyTrackToRealDept(rd, pTrack, report.warnings);
        applied.push(target);
      }
      report.broadcastEvents.push({
        source: pseudo.departmentName,
        sourceCategory: "pseudo-list",
        trackName: pTrack.trackName,
        appliedTo: applied,
        excluded: notFound.length > 0 ? [`(not in real depts: ${notFound.join(", ")})`] : [],
      });
    }
  }

  // 2단계: override-single 적용 (단일 학과 명시)
  for (const ov of overrides) {
    for (const pTrack of ov.tracks) {
      // dept 명 매칭: 정확 또는 endswith (예: "미술대학 디자인과" → "디자인과")
      const rd = real.find(
        (d) =>
          d.departmentName === ov.departmentName ||
          ov.departmentName.endsWith(d.departmentName) ||
          (SNU_FACULTY_OF[d.departmentName] && ov.departmentName.startsWith(SNU_FACULTY_OF[d.departmentName])),
      );
      if (!rd) {
        report.broadcastEvents.push({
          source: ov.departmentName,
          sourceCategory: "override-single",
          trackName: pTrack.trackName,
          appliedTo: [],
          excluded: [],
          reason: "매칭 real dept 없음 (단과대명만 있고 학과 entry 없음)",
        });
        continue;
      }
      applyTrackToRealDept(rd, pTrack, report.warnings);
      report.broadcastEvents.push({
        source: ov.departmentName,
        sourceCategory: "override-single",
        trackName: pTrack.trackName,
        appliedTo: [rd.departmentName],
        excluded: [],
      });
    }
  }

  // 3단계: pseudo-univ 적용 (catch-all, 제외 단과대 학과는 skip)
  //
  // 음대 지역균형 제외 정책 (2026-05-30 추가):
  //   서울대 p11-12 모집인원 표 확인 결과 — 음대 5개 학과 (성악·작곡·피아노·관현·국악) 의
  //   지역균형전형 인원이 0 (entry 자체 없음). 음대는 자체 실기위주 / 학생부종합(일반) 만 운영.
  //   pseudo entry 명에 명시적 제외 없어도 음대를 지역균형 broadcast 에서 추가 제외.
  const MUSIC_FACULTY_SET = new Set(["음악대학"]);
  const isJiyokTrack = (name: string): boolean => /지역균형/.test(name);

  for (const pseudo of pseudoUniv) {
    const excludedFaculties = parseExcludedFaculties(pseudo.departmentName);
    for (const pTrack of pseudo.tracks) {
      const applied: string[] = [];
      const excluded: string[] = [];
      const enforceMusicExclude = isJiyokTrack(pTrack.trackName);
      for (const rd of real) {
        const faculty = SNU_FACULTY_OF[rd.departmentName];
        if (faculty && excludedFaculties.includes(faculty)) {
          excluded.push(`${rd.departmentName}(${faculty})`);
          continue;
        }
        if (enforceMusicExclude && faculty && MUSIC_FACULTY_SET.has(faculty)) {
          excluded.push(`${rd.departmentName}(${faculty}, 지역균형 모집인원 0)`);
          continue;
        }
        applyTrackToRealDept(rd, pTrack, report.warnings);
        applied.push(rd.departmentName);
      }
      report.broadcastEvents.push({
        source: pseudo.departmentName,
        sourceCategory: "pseudo-univ",
        trackName: pTrack.trackName,
        appliedTo: applied,
        excluded,
      });
    }
  }

  return { merged: real, report };
}

/* ───────────────────────────────────────────────────────────────────────
   CLI
   ─────────────────────────────────────────────────────────────────────── */

async function main(): Promise<void> {
  const arg = (k: string): string | undefined => {
    const m = process.argv.find((a) => a.startsWith(`--${k}=`));
    return m?.slice(k.length + 3);
  };
  const inPath = arg("in");
  const outPath = arg("out");
  if (!inPath || !outPath) {
    console.error("필수: --in=<snu-full.json> --out=<snu-merged.json>");
    process.exit(1);
  }

  const raw = JSON.parse(await fs.readFile(path.resolve(inPath), "utf8"));
  const meta = raw.meta;
  const allDepts: RawDepartment[] = raw.result?.departments ?? [];
  const baseWarnings: string[] = raw.result?.warnings ?? [];

  console.log(`== Broadcast 머저 ==`);
  console.log(`입력: ${inPath} (학과 ${allDepts.length}, 전형 ${allDepts.reduce((s, d) => s + d.tracks.length, 0)})`);

  const { merged, report } = broadcast(allDepts);

  console.log(`\n분류:`);
  console.log(`  real: ${report.realDeptCount}`);
  console.log(`  pseudo-univ: ${report.pseudoUnivCount}`);
  console.log(`  pseudo-list: ${report.pseudoListCount}`);
  console.log(`  override-single: ${report.overrideSingleCount}`);

  console.log(`\nBroadcast 이벤트: ${report.broadcastEvents.length}`);
  for (const ev of report.broadcastEvents) {
    console.log(`  [${ev.sourceCategory}] "${ev.source}" 전형="${ev.trackName}"`);
    console.log(`    → 적용 (${ev.appliedTo.length}): ${ev.appliedTo.slice(0, 5).join(", ")}${ev.appliedTo.length > 5 ? " ..." : ""}`);
    if (ev.excluded.length > 0) {
      console.log(`    제외 (${ev.excluded.length}): ${ev.excluded.slice(0, 5).join(", ")}${ev.excluded.length > 5 ? " ..." : ""}`);
    }
    if (ev.reason) console.log(`    이유: ${ev.reason}`);
  }

  // 통계
  const totalT = merged.reduce((s, d) => s + d.tracks.length, 0);
  const filled = {
    quotaInitial: 0,
    reflectionStages: 0,
    csatMinimumRawText: 0,
    csatMinimumExempt: 0,
    csatRequiredAreasRawText: 0,
    specialTypeKeyword: 0,
  };
  for (const d of merged) {
    for (const t of d.tracks) {
      if (t.quotaInitial != null) filled.quotaInitial++;
      if (t.reflectionStages != null && t.reflectionStages.length > 0) filled.reflectionStages++;
      if (t.csatMinimumRawText != null) filled.csatMinimumRawText++;
      if (t.csatMinimumExempt === true) filled.csatMinimumExempt++;
      if (t.csatRequiredAreasRawText != null) filled.csatRequiredAreasRawText++;
      if (t.specialTypeKeyword != null) filled.specialTypeKeyword++;
    }
  }

  console.log(`\n== Broadcast 후 채워짐 비율 (${totalT}전형) ==`);
  for (const [k, c] of Object.entries(filled)) {
    console.log(`  ${k}: ${c}/${totalT} (${Math.round((100 * c) / totalT)}%)`);
  }

  // 완전 레코드 정의: quotaInitial + reflectionStages 둘 다 채워진 전형
  let complete = 0;
  for (const d of merged) {
    for (const t of d.tracks) {
      if (t.quotaInitial != null && t.reflectionStages != null && t.reflectionStages.length > 0) complete++;
    }
  }
  console.log(`\n완전 레코드 (모집인원 + 반영비율 둘 다): ${complete}/${totalT} (${Math.round((100 * complete) / totalT)}%)`);

  // 출력 저장
  const fullOut = {
    meta: {
      ...meta,
      broadcastedAt: new Date().toISOString(),
      broadcastReport: report,
      filledRatio: filled,
      completeRecords: complete,
      totalTracks: totalT,
    },
    result: {
      departments: merged,
      warnings: [...baseWarnings, ...report.warnings.map((w) => `[broadcast] ${w}`)],
    },
  };

  await fs.writeFile(path.resolve(outPath), JSON.stringify(fullOut, null, 2));
  console.log(`\n💾 ${outPath} 저장`);
}

void main();
