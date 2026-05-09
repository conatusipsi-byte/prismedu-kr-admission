/**
 * 한국 대학 입시 매칭 어댑터 (lib/matching.ts US 모델의 한국화)
 *
 * prismedu.kr의 matchSchools가 SCHOOLS 글로벌(미국 학교 데이터)을 직접 기반으로
 * 하므로 시그니처를 그대로 못 쓰며, **알고리즘 패턴(상수 + 단계 합산 + clamp +
 * margin + 분류 임계치)만 차용**해 한국 입시용으로 새로 작성.
 *
 * 차이점 4가지:
 *   1. polarity 반전 — 한국 등급 1=최우수 (US GPA는 4.0=최우수). 차이 계산 시
 *      `cutoffGrade - studentGrade`처럼 부호 정렬을 명시적으로 적용한다.
 *   2. B1 응시영역 자격 필터 — 충족 못 하면 매칭 호출 자체를 건너뛴다 (자격 미달).
 *   3. 표본 부족 분기 — sample-gate가 "insufficient_sample" 반환하면
 *      AdmissionProbability discriminated union으로 직행 (확률 null).
 *   4. 학종(susi_comprehensive) 분해 — HakjongProbability(stage1×stage2).
 *
 * ⚠️ 이 모듈의 계수는 휴리스틱이며 학술적 출처가 있는 모델이 아니다.
 * staging + 사용자 피드백으로 calibration 필요 (// TODO).
 *
 * 본 모듈은 서버·테스트 양쪽에서 import 되므로 server-only 미부착.
 * Firestore 접근은 라우트(/api/match)가 담당 — 본 모듈은 순수 함수만 export.
 */

import type {
  AdmissionProbability,
  AdmissionSampleStats,
  AdmissionTrack,
  AdmissionTrackKind,
  HakjongProbability,
  PrevYearResult,
  ProbabilityCategory,
} from "@/types/admission";
import type { KrSpecsInput } from "@/lib/schemas/api/match";
import {
  buildInsufficientHakjong,
  buildInsufficientSampleProbability,
  checkHakjongSampleSufficiency,
  checkSampleSufficiency,
  type SampleGateResult,
} from "@/lib/admission/sample-gate";

/* ═══════════════════════════════════════════════════════════════════════
   상수 — 휴리스틱 계수. 변경 시 lib/__tests__/matching-kr.test.ts 회귀 검증.
   ═══════════════════════════════════════════════════════════════════════ */

/** 합격 확률 최종 clamp */
const PROB_FLOOR = 1;
const PROB_CEILING = 95;

/** 4-tier 분류 — sample-gate가 insufficient_sample를 별도 카테고리로 처리하므로 본 임계치는 sufficient 학과에만 적용. */
const CAT_THRESHOLDS = {
  SAFETY: 80,
  TARGET: 40,
  HARD_TARGET: 15,
} as const;

/** 학업 점수(naesin·csat) — clamp 범위. */
const ACADEMIC_CLAMP = { MIN: -35, MAX: 35 } as const;

/** 한국 등급 1.0 차이당 점수. 등급 1.5 vs cutoff 2.5 = +20점 (cutoff보다 1.0 우수). */
const NAESIN_GRADE_DIFF_WEIGHT = 20;

/**
 * 수능 표준점수 평균 차이당 점수.
 * 표준점수 평균 1점 차이당 0.8점 (실제 표준점수는 영역별 분포 다름 — 정밀 calibration 필요).
 */
const CSAT_STD_DIFF_WEIGHT = 0.8;

/**
 * 수능 등급 합 fallback — 표준점수 미입력 시 등급 합으로 추정.
 * 한국 등급 합 1.0 차이당 5점 (3과목 합 6 vs cutoff 9 = +15점).
 */
const CSAT_GRADE_SUM_DIFF_WEIGHT = 5;

/** 비교과(학종 트랙) — 0~12점. */
const EXTRA_ACTIVITY = {
  CLUB_PERSISTENT_BONUS: 2,    // 동아리 3년 지속
  CAREER_ALIGNMENT_PER_LEVEL: 1, // 진로 일치도 1~5 점수당
  DETAILED_ABILITY_PER_LEVEL: 1, // 세특 자가평가 1~5 점수당
  BEHAVIORAL_PER_LEVEL: 0.6,
  CAP: 12,
} as const;

/**
 * 영어 등급 polarity (P-010) — 모집요강의 reflectionRatio.english.gradeMap이
 * 음수(감점)이면 그대로 차감, 양수(가산)이면 그대로 합산. 본 모듈은 가산/감점을
 * 직접 다루지 않고, 영어 등급 차이만 별도 가중치로 산출.
 */
const ENGLISH_GRADE_DIFF_WEIGHT = 3;

/**
 * 학종 분해 임계 — stage1 점수 컷 ±에서 통과 확률을 sigmoid 비슷하게 산출.
 * stage1Pass·stage2Pass는 0~1, combined는 곱.
 */
const HAKJONG = {
  STAGE1_BASE: 0.55,    // 1단계 통과 base
  STAGE1_PER_NAESIN_DIFF: 0.18, // 내신 1.0 차이당 ±0.18
  STAGE2_BASE: 0.4,     // 면접 통과 base
  STAGE2_PER_EXTRA_LEVEL: 0.05, // 비교과 1점당
  CLAMP_MIN: 0.02,
  CLAMP_MAX: 0.95,
} as const;

/**
 * 신뢰 구간 margin — 표본 N이 작을수록 넓게.
 * (US 모델은 selectivity로 결정 — 한국은 표본 N이 더 직접적 신호.)
 */
const RANGE_MARGIN = {
  HIGH_N: { nMin: 30, margin: 5 },
  MID_N: { nMin: 10, margin: 7 },
  LOW_N: { margin: 10 },
} as const;

/* ═══════════════════════════════════════════════════════════════════════
   학생 academic 정규화 — 한국 등급/표준점수 → 매칭 입력
   ═══════════════════════════════════════════════════════════════════════ */

export interface NormalizedStudent {
  /** 내신 가중평균 등급 (단위수 가중). null = 미입력. */
  naesinGpa: number | null;
  /** 수능 표준점수 평균 (국·수·탐 평균). null = 미입력. */
  csatStdAvg: number | null;
  /** 수능 등급 합 (국·수·영·탐 + 한국사 미포함). 표준점수 fallback용. null = 미입력. */
  csatGradeSum: number | null;
  /** 영어 등급 (절대평가). null = 미입력. */
  englishGrade: number | null;
  /** 응시영역 메타 — B1 자격 검사용. */
  csatMeta: {
    mathCourse: "calculus" | "probability_statistics" | "geometry" | null;
    investigationTypes: Array<"social" | "science" | "vocational">;
    investigationCount: number;
  };
  /** 비교과 합산 점수 (0~12). null = 미입력 (학종에서 페널티 X). */
  extraScore: number | null;
}

export function normalizeKrSpecs(specs: KrSpecsInput): NormalizedStudent {
  return {
    naesinGpa: computeNaesinGpa(specs.score.naesin),
    csatStdAvg: computeCsatStdAvg(specs.score.csat),
    csatGradeSum: computeCsatGradeSum(specs.score.csat),
    englishGrade: specs.score.csat.english.grade,
    csatMeta: {
      mathCourse: specs.score.csat.math.course,
      investigationTypes: specs.score.csat.investigation
        .filter((e) => e.grade != null)
        .map((e) => e.type),
      investigationCount: specs.score.csat.investigation.filter((e) => e.grade != null).length,
    },
    extraScore: computeExtraScore(specs.extra),
  };
}

function computeNaesinGpa(naesin: KrSpecsInput["score"]["naesin"]): number | null {
  let weightedSum = 0;
  let totalUnits = 0;
  for (const t of naesin) {
    if (t.relativeGpa == null || t.totalUnits == null || t.totalUnits === 0) continue;
    weightedSum += t.relativeGpa * t.totalUnits;
    totalUnits += t.totalUnits;
  }
  if (totalUnits === 0) return null;
  return weightedSum / totalUnits;
}

function computeCsatStdAvg(csat: KrSpecsInput["score"]["csat"]): number | null {
  const parts: number[] = [];
  if (csat.korean.standard != null) parts.push(csat.korean.standard);
  if (csat.math.standard != null) parts.push(csat.math.standard);
  // 탐구 평균
  const invStds = csat.investigation
    .map((e) => e.standard)
    .filter((s): s is number => s != null);
  if (invStds.length > 0) {
    parts.push(invStds.reduce((a, b) => a + b, 0) / invStds.length);
  }
  if (parts.length === 0) return null;
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

function computeCsatGradeSum(csat: KrSpecsInput["score"]["csat"]): number | null {
  const parts: number[] = [];
  if (csat.korean.grade != null) parts.push(csat.korean.grade);
  if (csat.math.grade != null) parts.push(csat.math.grade);
  const invGrades = csat.investigation.map((e) => e.grade).filter((g): g is number => g != null);
  if (invGrades.length > 0) {
    parts.push(invGrades.reduce((a, b) => a + b, 0) / invGrades.length);
  }
  if (parts.length === 0) return null;
  return parts.reduce((a, b) => a + b, 0);
}

function computeExtraScore(extra: KrSpecsInput["extra"]): number | null {
  const has =
    extra.club.yearsPersistent != null ||
    extra.career.majorAlignment != null ||
    extra.detailedAbility.qualityScore != null ||
    extra.behavioralCharacteristics.qualityScore != null;
  if (!has) return null;

  let score = 0;
  if ((extra.club.yearsPersistent ?? 0) >= 3) score += EXTRA_ACTIVITY.CLUB_PERSISTENT_BONUS;
  if (extra.career.majorAlignment != null) {
    score += extra.career.majorAlignment * EXTRA_ACTIVITY.CAREER_ALIGNMENT_PER_LEVEL;
  }
  if (extra.detailedAbility.qualityScore != null) {
    score += extra.detailedAbility.qualityScore * EXTRA_ACTIVITY.DETAILED_ABILITY_PER_LEVEL;
  }
  if (extra.behavioralCharacteristics.qualityScore != null) {
    score += extra.behavioralCharacteristics.qualityScore * EXTRA_ACTIVITY.BEHAVIORAL_PER_LEVEL;
  }
  return Math.min(score, EXTRA_ACTIVITY.CAP);
}

/* ═══════════════════════════════════════════════════════════════════════
   B1 응시영역 자격 (학과별)
   ═══════════════════════════════════════════════════════════════════════ */

export interface RequiredAreasOutcome {
  /** 자격 충족 여부 — false면 매칭에서 즉시 자격 미달. */
  eligible: boolean;
  /** 미달 사유 (UI 표시용). */
  reasons: string[];
}

/**
 * 학과 트랙의 requiredAreas와 학생 응시영역을 비교해 자격 여부 산출.
 *
 * 학과에 requiredAreas가 없으면 항상 충족 (제약 없음). 있으면 각 영역별 검사.
 */
export function evaluateRequiredAreasForTrack(
  student: NormalizedStudent,
  track: AdmissionTrack,
): RequiredAreasOutcome {
  const ra = track.requiredAreas;
  if (!ra) return { eligible: true, reasons: [] };
  const reasons: string[] = [];

  // 수학
  if (ra.math?.required) {
    const ok =
      student.csatMeta.mathCourse != null && ra.math.courses.includes(student.csatMeta.mathCourse);
    if (!ok) {
      reasons.push(`수학 응시 영역 미충족 (요구: ${ra.math.courses.join("/")})`);
    }
  }
  // 영어
  if (ra.english && student.englishGrade == null) {
    reasons.push("영어 응시 필수 (미응시)");
  }
  // 한국사 — student 객체엔 별도 필드 없음. 응시 메타에 따로 추적 안 함 (입력 폼은 등급만 받음).
  //         보수적으로 historyGrade가 csat에서 직접 검사되어야 하나, NormalizedStudent에 추가하지 않음.
  //         현 단계에선 history는 자격 검사 생략 (대부분 한국 학생 응시 — false negative 위험 회피).

  // 탐구
  if (ra.investigation) {
    const allowed = ra.investigation.types;
    const matched = student.csatMeta.investigationTypes.filter((t) => allowed.includes(t));
    if (matched.length < ra.investigation.requiredCount) {
      reasons.push(
        `탐구 ${allowed.join("/")} ${ra.investigation.requiredCount}과목 응시 미충족 (현재 ${matched.length}과목)`,
      );
    }
  }

  return { eligible: reasons.length === 0, reasons };
}

/* ═══════════════════════════════════════════════════════════════════════
   학과 단일 매칭 — AdmissionProbability 산출
   ═══════════════════════════════════════════════════════════════════════ */

export interface MatchCandidate {
  universityId: string;
  universityName: string;
  departmentId: string;
  departmentName: string;
  trackKind: AdmissionTrackKind;
  trackName: string;
  track: AdmissionTrack;
  prevYearResult?: PrevYearResult;
  sampleStats?: AdmissionSampleStats;
}

export interface CandidateProbability {
  candidate: MatchCandidate;
  probability: AdmissionProbability;
  /** 학과·트랙별 정직성 caveat (preliminary 변환표·자격 미달·표본 부족 등). */
  caveats: string[];
}

export function matchSingle(
  student: NormalizedStudent,
  candidate: MatchCandidate,
): CandidateProbability {
  const { track, sampleStats } = candidate;
  const caveats: string[] = [];

  // 1. B1 응시영역 자격 검사 (사전 필터)
  const required = evaluateRequiredAreasForTrack(student, track);
  if (!required.eligible) {
    caveats.push(...required.reasons.map((r) => `자격 미달: ${r}`));
    // 자격 미달 학과는 0% 확률 + reach 카테고리. 표본 검사 자체 건너뜀.
    return {
      candidate,
      probability: {
        category: "reach",
        probability: PROB_FLOOR,
        low: PROB_FLOOR,
        high: PROB_FLOOR,
        sampleSufficient: true, // 자격 미달이지 표본 부족이 아님
        sampleN: sampleStats?.acceptedCount ?? 0,
        weightedSampleN: sampleStats?.weightedCount ?? 0,
      },
      caveats,
    };
  }

  // 2. 표본 충족 검사 (P-001)
  const sample = checkSampleSufficiency(sampleStats);
  if (!sample.sufficient) {
    return {
      candidate,
      probability: buildInsufficientSampleProbability(sample),
      caveats: [], // 표본 부족 자체 메시지는 별도 sample-gate 안내가 처리
    };
  }

  // 3. 정시 변환표 preliminary 안내 (P-012)
  if (
    isJeongsiKind(candidate.trackKind) &&
    track.conversionTable?.status === "preliminary"
  ) {
    caveats.push("정시 변환표 후공지 — 수능 후 변환표 발표 시 결과가 갱신됩니다 (P-012).");
  }

  // 4. 학종(susi_comprehensive)은 stage 분해 별도 산출
  if (candidate.trackKind === "susi_comprehensive") {
    return {
      candidate,
      probability: matchHakjong(student, candidate, sample),
      caveats,
    };
  }

  // 5. 일반 트랙 — academic + base + clamp
  const probability = matchGeneralTrack(student, candidate, sample);
  return { candidate, probability, caveats };
}

function matchGeneralTrack(
  student: NormalizedStudent,
  candidate: MatchCandidate,
  sample: SampleGateResult & { sufficient: true },
): AdmissionProbability {
  const { prevYearResult } = candidate;

  // base = 1/competitionRate * 100 (대략 — 실 합격률은 모집인원·이월 후 변동).
  const base = baseProbabilityFromCompetition(prevYearResult?.competitionRate);

  let academic = 0;

  // 5-1. 내신 차이 (학종 외 트랙도 학생부 반영하는 경우 다수)
  const naesinCutoff =
    prevYearResult?.gradeCutoffAvg ?? prevYearResult?.gradeCutoff70 ?? null;
  if (student.naesinGpa != null && naesinCutoff != null) {
    academic += (naesinCutoff - student.naesinGpa) * NAESIN_GRADE_DIFF_WEIGHT;
  }

  // 5-2. 정시(또는 논술 — 수능최저 충족 가정)는 수능 표준점수 비교
  if (isJeongsiKind(candidate.trackKind) || candidate.trackKind === "susi_essay") {
    const csatCutoff =
      prevYearResult?.cutoffAvg ?? prevYearResult?.cutoff70 ?? null;
    if (student.csatStdAvg != null && csatCutoff != null) {
      // cutoffAvg는 변환점수 또는 표준점수 — 출처가 다양하므로 상수 가중치는 약하게.
      // 학생 평균이 cutoff 이상이면 양수.
      academic += (student.csatStdAvg - csatCutoff / 3) * CSAT_STD_DIFF_WEIGHT;
    } else if (student.csatGradeSum != null) {
      // 표준점수 미입력 fallback: 등급 합으로 비교 (cutoff 정보 없으면 baseline 6 가정).
      const baselineSum = 6;
      academic += (baselineSum - student.csatGradeSum) * CSAT_GRADE_SUM_DIFF_WEIGHT;
    }
  }

  // 5-3. 영어 등급 — 절대평가, baseline 2등급
  if (student.englishGrade != null) {
    const baseline = 2;
    academic += (baseline - student.englishGrade) * ENGLISH_GRADE_DIFF_WEIGHT;
  }

  academic = clamp(academic, ACADEMIC_CLAMP.MIN, ACADEMIC_CLAMP.MAX);

  // 5-4. 비교과 보너스 (학종 외 트랙도 일부 반영 — 다만 학종보다 약함)
  let extraBonus = 0;
  if (candidate.trackKind === "susi_subject" && student.extraScore != null) {
    extraBonus = student.extraScore * 0.3; // 교과는 비교과 영향 제한적
  }

  let prob = base + academic + extraBonus;
  prob = Math.round(clamp(prob, PROB_FLOOR, PROB_CEILING));

  const margin = marginFromSample(sample.acceptedN);
  const low = clamp(prob - margin, PROB_FLOOR, PROB_CEILING);
  const high = clamp(prob + margin, PROB_FLOOR, PROB_CEILING);

  return {
    category: classifyCategory(prob),
    probability: prob,
    low,
    high,
    sampleSufficient: true,
    sampleN: sample.acceptedN,
    weightedSampleN: sample.weightedN,
  };
}

function matchHakjong(
  student: NormalizedStudent,
  candidate: MatchCandidate,
  sample: SampleGateResult & { sufficient: true },
): AdmissionProbability {
  const { prevYearResult, sampleStats } = candidate;

  // 학종 분해는 sample-gate가 stage1·stage2 양쪽 표본을 별도 검사.
  const hakjongSample = checkHakjongSampleSufficiency(sampleStats);

  let hakjong: HakjongProbability;
  if (!hakjongSample.sufficient) {
    hakjong = buildInsufficientHakjong(hakjongSample.stage1N, hakjongSample.finalN);
  } else {
    // stage1Pass — 내신 컷 기준
    // 명시적 `: number` — HAKJONG의 `as const`가 리터럴로 좁혀 재할당 불가가 되는 문제 회피.
    let stage1: number = HAKJONG.STAGE1_BASE;
    const stage1Cutoff =
      prevYearResult?.stage1GradeCutoff ?? prevYearResult?.gradeCutoffAvg ?? null;
    if (student.naesinGpa != null && stage1Cutoff != null) {
      stage1 += (stage1Cutoff - student.naesinGpa) * HAKJONG.STAGE1_PER_NAESIN_DIFF;
    }
    stage1 = clamp(stage1, HAKJONG.CLAMP_MIN, HAKJONG.CLAMP_MAX);

    // stage2Pass — 면접 베이스 + 비교과
    let stage2: number = HAKJONG.STAGE2_BASE;
    if (student.extraScore != null) {
      stage2 += student.extraScore * HAKJONG.STAGE2_PER_EXTRA_LEVEL;
    }
    // 전년도 stage2PassRate 있으면 prior로 가중.
    if (prevYearResult?.stage2PassRate != null) {
      stage2 = (stage2 + prevYearResult.stage2PassRate) / 2;
    }
    stage2 = clamp(stage2, HAKJONG.CLAMP_MIN, HAKJONG.CLAMP_MAX);

    const combined = stage1 * stage2;
    const margin = 0.07;

    hakjong = {
      stage1Pass: stage1,
      stage2Pass: stage2,
      combined,
      combinedLow: clamp(combined - margin, HAKJONG.CLAMP_MIN, HAKJONG.CLAMP_MAX),
      combinedHigh: clamp(combined + margin, HAKJONG.CLAMP_MIN, HAKJONG.CLAMP_MAX),
      stage1SampleN: hakjongSample.stage1N,
      finalSampleN: hakjongSample.finalN,
      sampleSufficient: true,
    };
  }

  // 학종 일반 probability — combined × 100. 분해 표본 부족 시 일반 sample 가지고
  // fallback 산출 (HakjongProbability.combined=null이지만 sampleSufficient는 true).
  const probValue =
    hakjong.combined != null
      ? Math.round(clamp(hakjong.combined * 100, PROB_FLOOR, PROB_CEILING))
      : Math.round(
          clamp(
            // fallback: 일반 트랙처럼 baseline 50 + naesin 차이.
            50 +
              (prevYearResult?.gradeCutoffAvg != null && student.naesinGpa != null
                ? (prevYearResult.gradeCutoffAvg - student.naesinGpa) * NAESIN_GRADE_DIFF_WEIGHT
                : 0),
            PROB_FLOOR,
            PROB_CEILING,
          ),
        );

  const margin = marginFromSample(sample.acceptedN);
  const low = clamp(probValue - margin, PROB_FLOOR, PROB_CEILING);
  const high = clamp(probValue + margin, PROB_FLOOR, PROB_CEILING);

  return {
    category: classifyCategory(probValue),
    probability: probValue,
    low,
    high,
    sampleSufficient: true,
    sampleN: sample.acceptedN,
    weightedSampleN: sample.weightedN,
    hakjong,
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   메인 진입점 — 후보 학과 배열 → 학과별 확률
   ═══════════════════════════════════════════════════════════════════════ */

export interface MatchKrInput {
  specs: KrSpecsInput;
  candidates: MatchCandidate[];
}

export interface MatchKrOutput {
  results: CandidateProbability[];
  /** 응답 단위 caveat (preliminary 학과 비율 등) — 라우트가 응답에 첨부. */
  globalCaveats: string[];
}

export function matchKrAdmissions(input: MatchKrInput): MatchKrOutput {
  const student = normalizeKrSpecs(input.specs);

  // 1. P-013 — 외국 고교 답변이 'no'가 아닌 입력은 스키마에서 차단되지만,
  //    잘못된 데이터가 흘러들어와도 안전하게 거부.
  if (input.specs.basic.abroadHighSchool !== "no") {
    return { results: [], globalCaveats: ["외국 고교 출신은 재외국민·외국인 트랙(/admissions/jaeoegukmin)에서 분석합니다."] };
  }

  const results = input.candidates.map((c) => matchSingle(student, c));

  // 결과 정렬: 확률 desc, null(insufficient_sample)은 끝.
  results.sort((a, b) => {
    const pa = a.probability.probability ?? -1;
    const pb = b.probability.probability ?? -1;
    return pb - pa;
  });

  // 글로벌 caveat — preliminary 학과 비율
  const preliminaryCount = input.candidates.filter(
    (c) =>
      isJeongsiKind(c.trackKind) && c.track.conversionTable?.status === "preliminary",
  ).length;
  const globalCaveats: string[] = [];
  if (preliminaryCount > 0) {
    globalCaveats.push(
      `정시 ${preliminaryCount}개 학과의 변환표가 후공지 상태입니다. 수능 후 변환표 발표 시점에 결과가 갱신됩니다 (P-012).`,
    );
  }
  const insufficientCount = results.filter(
    (r) => r.probability.category === "insufficient_sample",
  ).length;
  if (insufficientCount > 0 && results.length > 0) {
    globalCaveats.push(
      `${insufficientCount}/${results.length}개 학과는 합격 사례 표본이 부족해 확률을 표시하지 않습니다 (P-001).`,
    );
  }

  return { results, globalCaveats };
}

/* ═══════════════════════════════════════════════════════════════════════
   유틸
   ═══════════════════════════════════════════════════════════════════════ */

export function isJeongsiKind(kind: AdmissionTrackKind): boolean {
  return kind === "jeongsi_ga" || kind === "jeongsi_na" || kind === "jeongsi_da";
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function classifyCategory(prob: number): ProbabilityCategory {
  if (prob >= CAT_THRESHOLDS.SAFETY) return "safety";
  if (prob >= CAT_THRESHOLDS.TARGET) return "target";
  if (prob >= CAT_THRESHOLDS.HARD_TARGET) return "hard_target";
  return "reach";
}

function baseProbabilityFromCompetition(rate?: number): number {
  if (rate == null || rate <= 0) return 30; // 정보 없으면 보수적 baseline
  // competitionRate=10 → base=10, rate=5 → base=20, rate=2 → base=50
  return clamp((1 / rate) * 100, 1, 70);
}

function marginFromSample(acceptedN: number): number {
  if (acceptedN >= RANGE_MARGIN.HIGH_N.nMin) return RANGE_MARGIN.HIGH_N.margin;
  if (acceptedN >= RANGE_MARGIN.MID_N.nMin) return RANGE_MARGIN.MID_N.margin;
  return RANGE_MARGIN.LOW_N.margin;
}

/** 한국 등급 1.0~9.0 → US GPA 4.0 scale 변환 (polarity 반전). 외부 모듈 호환·테스트용. */
export function kraGradeToUsGpa(grade: number): number {
  // 등급 1.0=4.5, 2.0=4.0, 3.0=3.5, ..., 9.0=0.5 — 5.0=2.5 baseline
  return clamp(5.0 - grade * 0.5, 0, 4.5);
}

/** 수능 표준점수 평균 → SAT scale (400~1600) 변환. */
export function kraStandardScoreToSat(stdAvg: number): number {
  // 표준점수 평균 ~70~150 → SAT 400~1600
  // 표준 100 → 1000, 표준 130 → 1300, 표준 150 → 1500
  return clamp(400 + (stdAvg - 50) * 12, 400, 1600);
}
