/**
 * 정원외/그룹 단위 전형 식별 — 학과별 합격률 오도 방지 (P-005 정직성)
 *
 * 문제:
 *   정원외 전형(농어촌·재직자·특성화고·장애인·기회균형 등)은 모집인원이 그룹 단위
 *   (예: 가톨릭 농어촌 = 인문사회계열 통합 31명)인데 ETL 이 앵커 학과에 부착함.
 *   이를 학과별 모집인원으로 보고 경쟁률·합격률을 산출하면 학생을 오도한다.
 *
 * 결정 (2026-06):
 *   - 정원외/그룹 단위 전형은 학과별 합격률 계산 비대상 → category="quota_external".
 *   - 가짜 숫자 대신 "정원외 (그룹 모집)" 라벨 + 지원자격 강조.
 *   - 정원내 일반·교과·종합·논술·지역균형 등은 영향 없음 (department scope).
 *
 * 식별 우선순위:
 *   1. track.quotaScope 명시값 (ETL 백필) — 최우선.
 *   2. specialType ≠ general — 농어촌(agricultural)·기회균형/장애(low_income)·재외국민(overseas)·
 *      특성화고(etc) 는 detectSpecialType 이 이미 분류.
 *   3. 전형명/notes 의 정원외 키워드 — 재직자처럼 specialType=general 로 분류되는 케이스 보강.
 *   4. notes 에 명시적 "정원외" 문구 (ETL 이 applicationQualification 을 notes 로 이전).
 */

import type { AdmissionProbability, AdmissionTrack } from "@/types/admission";

export type QuotaScope = "department" | "group" | "university";

/**
 * 정원외/특별전형 키워드 — specialType 만으로 못 잡는 케이스 보강.
 * 주의: 정원내 일반전형명(일반·지역균형·지역인재·교과·종합·논술)과 겹치지 않도록 선별.
 *   - 재직자: detectSpecialType 이 general 로 분류 → 키워드 필수.
 *   - 고른기회/만학도/서해5도/성인학습자: 마찬가지로 general 분류 가능 → 키워드 보강.
 */
export const QUOTA_EXTERNAL_KEYWORDS = [
  "농어촌", "농어업", "재직자", "특성화고", "마이스터",
  "장애", "기회균형", "기회균등", "고른기회", "사회배려", "사회기여",
  "국가보훈", "보훈", "기초생활", "차상위", "저소득", "기초연금",
  "서해5도", "만학도", "성인학습자", "특수교육대상", "특수교육",
  "북한이탈", "새터민", "탈북", "자립지원", "자립",
] as const;

const KEYWORD_RE = new RegExp(QUOTA_EXTERNAL_KEYWORDS.join("|"));

/**
 * 전형의 모집인원 단위(scope) 도출. group/university 면 학과별 합격률 산출 비대상.
 */
export function classifyQuotaScope(track: AdmissionTrack): QuotaScope {
  // 1. 명시값 최우선 (ETL 백필 / 수동 교정)
  if (track.quotaScope) return track.quotaScope;

  // 2. specialType 정원외 분류 (general 외 전부 특별전형)
  if (track.specialType && track.specialType !== "general") return "group";

  // 3. 전형명/notes 키워드 (재직자 등 specialType=general 보강)
  const haystack = `${track.name} ${track.notes ?? ""}`;
  if (KEYWORD_RE.test(haystack)) return "group";

  // 4. notes 에 명시적 "정원외" (ETL applicationQualification 이전분)
  if ((track.notes ?? "").includes("정원외")) return "group";

  return "department";
}

/** 학과별 합격률·경쟁률 산출 비대상 여부 (group/university). */
export function isQuotaExternal(track: AdmissionTrack): boolean {
  return classifyQuotaScope(track) !== "department";
}

/** UI 배지 라벨 — group/university 구분. */
export function quotaScopeLabel(scope: QuotaScope): string {
  switch (scope) {
    case "group":
      return "정원외 (그룹 모집)";
    case "university":
      return "정원외 (대학 단위 선발)";
    case "department":
      return "";
  }
}

/** 정원외 전형 안내 문구 (합격률 미산출 사유). */
export function quotaExternalMessage(): { headline: string; detail: string } {
  return {
    headline: "정원외 (그룹 모집) — 합격률 산출 안 함",
    detail:
      "이 전형은 모집인원이 학과가 아닌 그룹·대학 단위라 학과별 경쟁률·합격률과 다릅니다. " +
      "정확하지 않은 숫자로 오도하지 않기 위해 합격률을 표시하지 않아요. " +
      "지원자격(농어촌·재직자·특성화고·장애 등) 충족 여부가 핵심이니 자격 조건을 꼭 확인하세요.",
  };
}

/**
 * 정원외 전형 합격 확률 폴백 — category="quota_external", probability=null.
 * matchSingle 에서 표본 검사 전에 호출 (그룹 단위라 표본·확률 무의미).
 */
export function buildQuotaExternalProbability(): AdmissionProbability {
  return {
    category: "quota_external",
    probability: null,
    low: null,
    high: null,
    sampleSufficient: false,
    sampleN: 0,
    weightedSampleN: 0,
  };
}
