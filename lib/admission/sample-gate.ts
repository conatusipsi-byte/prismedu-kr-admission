/**
 * 합격사례 표본 부족 판정 게이트
 *
 * 결정 (2026-05): 표본 < 5 학과는 합격 확률 비공개, "표본 부족" 메시지 노출.
 *
 * 사용처:
 *   - matching 알고리즘: 학과별 확률 산출 직전 checkSampleSufficiency() 로 가드.
 *     부족 시 AdmissionProbability.category = "insufficient_sample".
 *   - 학종 분해 표시: stage1/2 양쪽 표본 모두 충족해야 sampleSufficient=true.
 *   - UI: gateMessage() 로 사용자 노출 문구 생성.
 *
 * 표본 카운트 출처: admissionSampleStats/{universityId}_{departmentId}_{year}_{trackKind}
 *   (admissionResults trigger에서 갱신)
 */

import type {
  AdmissionSampleStats,
  AdmissionTrackKind,
  HakjongProbability,
} from "@/types/admission";

/* ═══════════════════════════════════════════════════════════════════════
   임계치
   ═══════════════════════════════════════════════════════════════════════ */

/** 단순 표본 N 임계치 — verifiedCount >= 5 필요 */
export const SAMPLE_THRESHOLD = 5;

/**
 * 가중 표본 임계치 — weightedCount >= 3.0
 * 자가보고(0.5)만 5개 있으면 weighted=2.5로 부족 처리. 공식 데이터 1개(1.0) + 자가 4개(2.0) = 3.0 충족.
 * 단순 N과 가중 N 둘 다 충족해야 통과.
 */
export const WEIGHTED_THRESHOLD = 3.0;

/**
 * 학종 분해 — 1단계 통과 표본·최종 합격 표본 각각 임계치.
 * 1단계 통과는 합격보다 표본이 많으므로 임계치 약간 높임.
 */
export const STAGE1_PASS_THRESHOLD = 7;
export const STAGE2_ACCEPTED_THRESHOLD = 5;

/* ═══════════════════════════════════════════════════════════════════════
   판정
   ═══════════════════════════════════════════════════════════════════════ */

export type SampleGateReason =
  | "no_data"            // 집계 도큐먼트 자체 없음
  | "below_threshold"    // verifiedCount 부족
  | "weighted_below"     // verifiedCount는 충족이나 weightedCount 부족 (자가보고만 있음)
  | "no_accepted";       // 합격 표본(acceptedCount) 0개

export type SampleGateResult =
  | {
      sufficient: true;
      acceptedN: number;
      weightedN: number;
    }
  | {
      sufficient: false;
      reason: SampleGateReason;
      acceptedN: number;
      weightedN: number;
    };

/**
 * 일반 전형(학종 외) 표본 충족 판정.
 *
 * 충족 조건 (모두 만족):
 *   1. acceptedCount >= SAMPLE_THRESHOLD
 *   2. weightedCount >= WEIGHTED_THRESHOLD
 *
 * stats가 undefined이면 no_data.
 */
export function checkSampleSufficiency(
  stats?: AdmissionSampleStats,
): SampleGateResult {
  if (!stats) {
    return { sufficient: false, reason: "no_data", acceptedN: 0, weightedN: 0 };
  }
  const acceptedN = stats.acceptedCount;
  const weightedN = stats.weightedCount;

  if (acceptedN === 0) {
    return { sufficient: false, reason: "no_accepted", acceptedN, weightedN };
  }
  if (acceptedN < SAMPLE_THRESHOLD) {
    return { sufficient: false, reason: "below_threshold", acceptedN, weightedN };
  }
  if (weightedN < WEIGHTED_THRESHOLD) {
    return { sufficient: false, reason: "weighted_below", acceptedN, weightedN };
  }
  return { sufficient: true, acceptedN, weightedN };
}

/**
 * 학종 1단계 × 2단계 분해 시 표본 충족 판정.
 *
 * 1단계: stage1PassedCount >= STAGE1_PASS_THRESHOLD
 * 2단계: stage2AcceptedCount >= STAGE2_ACCEPTED_THRESHOLD
 *
 * 둘 중 하나라도 부족하면 분해 표시 불가 → HakjongProbability.sampleSufficient=false.
 * 가중치는 분해 표시에선 적용 X (충분히 보수적인 임계치).
 */
export function checkHakjongSampleSufficiency(
  stats?: AdmissionSampleStats,
): { sufficient: boolean; stage1N: number; finalN: number; reason?: SampleGateReason } {
  const stage1N = stats?.stage1PassedCount ?? 0;
  const finalN = stats?.stage2AcceptedCount ?? stats?.acceptedCount ?? 0;

  if (!stats) return { sufficient: false, stage1N: 0, finalN: 0, reason: "no_data" };
  if (stage1N < STAGE1_PASS_THRESHOLD) {
    return { sufficient: false, stage1N, finalN, reason: "below_threshold" };
  }
  if (finalN < STAGE2_ACCEPTED_THRESHOLD) {
    return { sufficient: false, stage1N, finalN, reason: "below_threshold" };
  }
  return { sufficient: true, stage1N, finalN };
}

/* ═══════════════════════════════════════════════════════════════════════
   UI 표시
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * 표본 부족 사용자 노출 문구.
 *
 * 정직성 원칙 (CLAUDE.md): 정확한 데이터가 없으면 "예측 불가"를 명시한다.
 * 모호한 추정으로 사용자를 잘못 인도하지 않는다.
 */
export function gateMessage(
  result: SampleGateResult,
  trackKind: AdmissionTrackKind,
): { headline: string; detail: string } {
  if (result.sufficient) {
    return { headline: "", detail: "" };
  }
  const trackLabel = TRACK_LABELS[trackKind];
  switch (result.reason) {
    case "no_data":
      return {
        headline: "합격 사례 표본 없음",
        detail: `${trackLabel} 합격 사례가 아직 수집되지 않아 합격 확률을 표시하지 않습니다. 모집인원·전년도 입결 등 정형 데이터는 그대로 확인할 수 있어요.`,
      };
    case "no_accepted":
      return {
        headline: "합격자 표본 부족",
        detail: `${trackLabel} 합격자 사례가 0건이라 확률 추정이 불가합니다. 표본이 누적되면 자동으로 노출돼요.`,
      };
    case "below_threshold":
      return {
        headline: `합격 사례 ${result.acceptedN}건 — 표본 부족`,
        detail: `최소 ${SAMPLE_THRESHOLD}건이 필요합니다. 적은 표본으로 확률을 표시하면 한두 명의 자가보고로 판정이 왜곡될 수 있어 비공개합니다.`,
      };
    case "weighted_below":
      return {
        headline: "검증된 표본 부족",
        detail: `합격 사례 ${result.acceptedN}건 중 자가보고 비중이 높아 합격 확률 추정의 신뢰도가 낮습니다 (가중 표본 ${result.weightedN.toFixed(1)} / 임계 ${WEIGHTED_THRESHOLD}).`,
      };
  }
}

const TRACK_LABELS: Record<AdmissionTrackKind, string> = {
  susi_subject: "학생부교과",
  susi_comprehensive: "학생부종합",
  susi_essay: "논술",
  susi_practical: "실기",
  jeongsi_ga: "정시 가군",
  jeongsi_na: "정시 나군",
  jeongsi_da: "정시 다군",
  additional: "추가모집",
  jaeoegukmin: "재외국민·외국인",
};

/* ═══════════════════════════════════════════════════════════════════════
   매칭 알고리즘 통합 헬퍼
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * 표본 부족이면 AdmissionProbability를 insufficient_sample 카테고리로 폴백.
 * 매칭 알고리즘에서 학과별 확률 계산 직전에 호출.
 */
export function buildInsufficientSampleProbability(
  result: SampleGateResult & { sufficient: false },
): {
  category: "insufficient_sample";
  probability: null;
  low: null;
  high: null;
  sampleSufficient: false;
  sampleN: number;
  weightedSampleN: number;
} {
  return {
    category: "insufficient_sample",
    probability: null,
    low: null,
    high: null,
    sampleSufficient: false,
    sampleN: result.acceptedN,
    weightedSampleN: result.weightedN,
  };
}

/**
 * 학종 분해 표본 부족 폴백.
 */
export function buildInsufficientHakjong(
  stage1N: number,
  finalN: number,
): HakjongProbability {
  return {
    stage1Pass: null,
    stage2Pass: null,
    combined: null,
    combinedLow: null,
    combinedHigh: null,
    stage1SampleN: stage1N,
    finalSampleN: finalN,
    sampleSufficient: false,
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   락 정책 — 무료 사용자 컷 적용 여부 판정
   ═══════════════════════════════════════════════════════════════════════ */

export type Plan = "free" | "pro" | "elite";

export type LockDecision =
  | {
      lockable: true;
      reason: "free_plan_over_preview_quota";
    }
  | {
      lockable: false;
      reason:
        | "paid_plan"               // 유료 사용자 — 항상 공개
        | "insufficient_sample"     // 표본 부족 — 정형 정보 무료 공개, 분석은 "표본 부족" 메시지
        | "in_free_preview";        // 무료 사용자 free preview 컷 안에 포함됨
    };

/**
 * 학과 단위 락 적용 여부 판정.
 *
 * 결정 (2026-05):
 *   - 표본 부족 학과: 락 적용 X. 정형 정보(모집요강·일정)는 항상 무료 공개.
 *     분석 영역은 "표본 부족" 메시지로 폴백 — 어차피 확률 자체가 비공개라 락 불필요.
 *   - 표본 충족 학과: 무료 사용자는 free preview 20개 외 분석 락. 모집요강은 무료.
 *
 * 사용처:
 *   - /api/match: 결과 학과별 분석 마스킹 결정
 *   - 학과 상세 페이지: 분석 카드 vs 정형 카드 분기
 */
export function isLockable(
  ctx: { plan: Plan; isInFreePreview: boolean },
  sample: SampleGateResult,
): LockDecision {
  // 1. 유료 사용자는 모든 학과 분석 공개
  if (ctx.plan !== "free") {
    return { lockable: false, reason: "paid_plan" };
  }

  // 2. 표본 부족 학과는 무료 사용자에게도 락 적용 X (분석 자체가 비공개이므로 락 의미 없음)
  if (!sample.sufficient) {
    return { lockable: false, reason: "insufficient_sample" };
  }

  // 3. 무료 preview 20개 안에 포함된 학과 — 락 X
  if (ctx.isInFreePreview) {
    return { lockable: false, reason: "in_free_preview" };
  }

  // 4. 그 외 — 무료 사용자 + 표본 충족 + preview 밖 → 락
  return { lockable: true, reason: "free_plan_over_preview_quota" };
}
