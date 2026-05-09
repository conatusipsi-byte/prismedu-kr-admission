/**
 * 재외국민·외국인 전형 자격 자가진단 로직 (P-013)
 *
 * ⚠️ **1차 필터링 전용**:
 *   본 로직은 사용자 자가진단의 분류 가이드일 뿐, 실제 자격은 대학별 모집요강에서
 *   확정. 학교마다 거주 기간·국적 요건·예외 조항이 다양해 단일 룰셋으로 결정 불가.
 *
 *   사용자 노출 시 항상 "정확한 자격은 대학별 모집요강 확인" 안내 필수.
 *   본 분류 결과를 "확정적 합격 가능"으로 해석 금지 (P-002 정직성).
 */

import type { AdmissionTrackKind } from "@/types/admission";

/* ═══════════════════════════════════════════════════════════════════════
   입력
   ═══════════════════════════════════════════════════════════════════════ */

export interface JaeoegukminInput {
  /** 외국 고교 졸업(예정) 여부 */
  graduatedAbroad: boolean;
  /** 본인의 외국 거주 기간 (개월) — 학생 본인 기준 */
  studentMonthsAbroad: number;
  /** 부모(보호자)의 외국 거주 기간 (개월) — 동반 거주 검증 */
  parentMonthsAbroad: number;
  /** 한국 국적 보유 여부 */
  hasKoreanNationality: boolean;
  /** 외국 학교 졸업 학년 (한국 학년 환산. 예: 12년 — 일부 학교 별도 트랙) */
  foreignSchoolYears: number;
}

/* ═══════════════════════════════════════════════════════════════════════
   결과
   ═══════════════════════════════════════════════════════════════════════ */

export type EligibilityType = "jaeoegukmin" | "foreigner" | "both" | "not_eligible";

export interface JaeoegukminResult {
  type: EligibilityType;
  /** 자격이 매핑되는 트랙 — 현재는 "jaeoegukmin" 단일 (학교마다 세분화 가능) */
  qualifyingTracks: AdmissionTrackKind[];
  /** 자격 판정 근거 (사용자 노출용) */
  reason: string;
  /** 다음 안내 문구 — UI 의 result card 가 그대로 사용 */
  guidance: string;
  /** 위험 신호 — 예외 조항 가능성 */
  caveats: string[];
}

/* ═══════════════════════════════════════════════════════════════════════
   임계치 — 일반적 한국 대학 기준 (학교별 ±6개월 변동)
   ═══════════════════════════════════════════════════════════════════════ */

export const ELIGIBILITY_THRESHOLDS = {
  /** 재외국민 — 본인 외국 거주 최소 (개월). 일반 3년 = 36개월 */
  STUDENT_MIN_MONTHS_OVERSEAS: 36,
  /** 재외국민 — 부모 외국 거주 최소 (개월) */
  PARENT_MIN_MONTHS_OVERSEAS: 36,
  /** 12년 외국교육이수자 별도 트랙 */
  FOREIGN_EDUCATION_12YR: 12,
} as const;

/* ═══════════════════════════════════════════════════════════════════════
   분류 함수
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * 자가진단 입력 → 자격 분류.
 *
 * 알고리즘 (단순화):
 *   1. graduatedAbroad === false → not_eligible (일반 전형 안내)
 *   2. hasKoreanNationality && (student/parent 거주 충족) → jaeoegukmin
 *   3. !hasKoreanNationality → foreigner
 *   4. (1·2) AND (3) 동시 충족 X — 한국 국적 vs 외국 국적은 mutex
 *
 * "both" 케이스: 일부 학교가 재외국민·외국인을 통합 운영 + 사용자 입력이 경계선.
 * 본 함수는 단일 분류로 좁히되, 12년 외국교육 이수자는 추가 caveat 으로 안내.
 */
export function classifyEligibility(input: JaeoegukminInput): JaeoegukminResult {
  const {
    graduatedAbroad,
    studentMonthsAbroad,
    parentMonthsAbroad,
    hasKoreanNationality,
    foreignSchoolYears,
  } = input;

  const T = ELIGIBILITY_THRESHOLDS;
  const caveats: string[] = [];

  // 12년 외국교육 별도 안내 (학교별 트랙 다름)
  if (foreignSchoolYears >= T.FOREIGN_EDUCATION_12YR) {
    caveats.push(
      "초·중·고 12년 모두 외국에서 수학한 경우 별도 '12년 외국교육이수자' 트랙이 있는 학교가 있습니다.",
    );
  }

  // 1. 외국 고교 졸업 X — 일반 전형 안내
  if (!graduatedAbroad) {
    return {
      type: "not_eligible",
      qualifyingTracks: [],
      reason: "외국 고교 졸업(예정)이 아니어서 재외국민·외국인 전형 대상이 아닙니다.",
      guidance:
        "한국 일반 전형(수시·정시)으로 지원하세요. 학과 검색에서 모집요강을 확인할 수 있어요.",
      caveats,
    };
  }

  // 2. 외국 국적 — foreigner
  if (!hasKoreanNationality) {
    return {
      type: "foreigner",
      qualifyingTracks: ["jaeoegukmin"],
      reason: "외국 국적 + 외국 고교 졸업 → 외국인 전형 대상",
      guidance:
        "외국인 전형은 학교마다 별도 자격 요건(어학 시험·서류)이 있어요. 추천 대학 목록에서 모집요강을 확인하세요.",
      caveats: [
        ...caveats,
        "어학 시험(TOPIK·TOEFL 등) 점수 요건이 학교마다 다릅니다.",
      ],
    };
  }

  // 3. 한국 국적 + 거주 기간 충족 — jaeoegukmin
  const studentOk = studentMonthsAbroad >= T.STUDENT_MIN_MONTHS_OVERSEAS;
  const parentOk = parentMonthsAbroad >= T.PARENT_MIN_MONTHS_OVERSEAS;

  if (studentOk && parentOk) {
    return {
      type: "jaeoegukmin",
      qualifyingTracks: ["jaeoegukmin"],
      reason: `한국 국적 + 본인 ${Math.floor(studentMonthsAbroad / 12)}년·부모 ${Math.floor(parentMonthsAbroad / 12)}년 외국 거주 → 재외국민 전형 가능성`,
      guidance:
        "재외국민 전형은 학교별 거주 기간 산정 방식이 다릅니다. 모집요강에서 정확한 자격(연속 거주 vs 누적, 부모 동반 의무 등)을 확인하세요.",
      caveats: [
        ...caveats,
        "거주 기간 산정에 '연속' / '누적' 차이가 있어 학교별로 결과가 다를 수 있습니다.",
        "재외국민 전형은 모집인원이 적어 경쟁률이 높습니다.",
      ],
    };
  }

  // 4. 한국 국적 + 거주 부족 — not_eligible
  return {
    type: "not_eligible",
    qualifyingTracks: [],
    reason: studentOk
      ? `부모 외국 거주 ${Math.floor(parentMonthsAbroad / 12)}년으로 일반 학교 기준(${T.PARENT_MIN_MONTHS_OVERSEAS / 12}년) 미달`
      : `본인 외국 거주 ${Math.floor(studentMonthsAbroad / 12)}년으로 일반 학교 기준(${T.STUDENT_MIN_MONTHS_OVERSEAS / 12}년) 미달`,
    guidance:
      "본 자가진단 기준으로는 재외국민 전형 자격이 어려워 보입니다. 다만 학교마다 예외 조항(특수목적·종교 활동 등)이 있어 직접 모집요강 확인을 권합니다.",
    caveats,
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   라벨
   ═══════════════════════════════════════════════════════════════════════ */

export const ELIGIBILITY_TYPE_LABEL: Record<EligibilityType, string> = {
  jaeoegukmin: "재외국민 전형",
  foreigner: "외국인 전형",
  both: "재외국민 + 외국인 전형",
  not_eligible: "일반 전형",
};
