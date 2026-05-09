/**
 * 수능최저학력기준 — 자동판정 가능/불가 분류기 + 충족 판정
 *
 * 결정 (2026-05): 단순 케이스(합·평균)만 자동 판정, 복잡 조건은 텍스트 표시.
 *
 * 사용처:
 *   - ETL 파이프라인: 모집요강 파싱 직후 classifyMinReq() 로 complexity·autoEvaluable 채움
 *   - 합격 추정 API: evaluateMinReq() 로 자동 판정. unknown이면 페널티 미적용 (불확실).
 *   - UI: minReqDisplayText() 로 사용자 문구 생성. unknown이면 "수동 확인 필요" 배지.
 *
 * 비고:
 *   본 파일은 도메인 지식 없는 개발자도 읽을 수 있도록 한국 입시 전문용어를
 *   주석으로 풀어 설명합니다.
 */

import type {
  CsatArea,
  CsatMinimum,
  CsatMinimumComplexity,
  CsatRequiredAreas,
  CsatScore,
  Grade,
} from "@/types/admission";

/* ═══════════════════════════════════════════════════════════════════════
   분류 — 모집요강 텍스트로부터 complexity 결정
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * "포함", "또는", "단", "이상" 등 자동판정 불가 키워드.
 * 이 중 하나라도 originalText 또는 additionalRules에 포함되면 with_required/custom.
 */
const COMPLEX_KEYWORDS = [
  "포함",       // "수학·탐구 포함"
  "단,",        // "단, 수학을 반드시 포함"
  "단 ",
  "또는",       // "수학 또는 탐구"
  " 및 ",       // "국·수 및 영어"
  "반드시",
  "필수",
  "다만",
  "별도",
  "차등",       // "계열별 차등"
  "계열별",
  "전공별",
  "한해",       // "의예과에 한해"
  "한정",
] as const;

/** 1과목 합산이 아닌 "두 과목 모두" 등 — with_required 가까움 */
const TWO_EACH_KEYWORDS = ["두 과목 모두", "각 과목", "각각", "2과목 각"] as const;

/**
 * 한국 모집요강에서 등장하는 ○○계열 어휘.
 *
 * 매년 ETL 시즌 시작 시 trackPattern-coverage.test.ts 통과 여부로 어휘 부족 검출.
 * 신규 계열명 발견 시 본 배열에 추가 후 회귀 테스트 케이스도 함께 추가
 * (operations.md §6.4 ETL 분류기 어휘 점검 체크리스트 참조).
 *
 * 주의: 어휘 추가 시 false positive (학과 분류 표시에 단일 등장하는 경우) 검토.
 *       본 어휘는 "둘 이상 등장 시 conditional" 판정에 쓰이므로 단독 등장은
 *       conditional로 빠지지 않는다.
 */
export const TRACK_PATTERN_VOCAB = [
  "인문", "자연", "예체능", "공학",
  "의약", "상경", "어문", "사회",
] as const;

/**
 * ○○계열 매칭용 정규식 — TRACK_PATTERN_VOCAB과 함께 갱신.
 *
 * 주의: lookahead `(?![가-힣])` 미사용. "인문계열로/인문계열의" 같이 한국어 조사·어미가
 *       따라오는 케이스를 차단하지 않기 위함. 합성어 "계열별·계열적" 등은 별도
 *       conditionalKeywords (계열별/전공별/차등...) 가 우선 매치하므로 영향 없음.
 */
export const TRACK_PATTERN = new RegExp(
  `(${TRACK_PATTERN_VOCAB.join("|")})계열`,
  "g",
);

/**
 * 모집요강 원문(originalText)과 부분 정형 데이터를 함께 보고 complexity 결정.
 *
 * 분류 우선순위 (위에서 아래로 매칭):
 *   1. originalText에 계열별/전공별 차등 키워드 → conditional (가장 큰 분기 단위)
 *   2. originalText에 "X계열...Y계열" 둘 이상 등장 → conditional
 *   3. investigationRule="two_each" 또는 "두 과목 모두" → with_required
 *   4. "포함"/"또는"/"반드시" 등 강제 조건 키워드 → with_required
 *   5. additionalRules가 30자 초과 자유 텍스트 → custom
 *   6. requiredCount === candidateAreas.length → simple_avg
 *   7. 그 외 → simple_sum
 *
 * 안전 원칙: 의심되면 보수적으로 conditional/with_required/custom 으로 빠뜨려
 *           운영자 검수에 맡긴다 (operations.md §8.2 인시던트 방지).
 */
export function classifyMinReq(
  partial: Omit<CsatMinimum, "complexity" | "autoEvaluable">,
): CsatMinimumComplexity {
  const text = `${partial.originalText ?? ""} ${partial.additionalRules ?? ""}`;

  // 1. 계열별·전공별 차등 명시 키워드 — conditional은 도큐먼트 분할 권장.
  const conditionalKeywords = ["계열별", "전공별", "차등", "한해", "한정"] as const;
  if (conditionalKeywords.some((k) => text.includes(k))) {
    return "conditional";
  }

  // 2. "X계열 ... Y계열" 둘 이상 등장 — 한 텍스트에 계열 분기가 표현된 패턴.
  //    한 계열만 등장(e.g., 학과 소개에 "공학계열")은 보수적으로 simple로 빠뜨리지 않고
  //    그대로 진행 — 단일 계열 명칭은 다음 키워드 단계에서 다시 평가.
  //    어휘는 TRACK_PATTERN_VOCAB 으로 export — 매년 ETL 시즌 전 커버리지 점검 필수.
  // RegExp 객체는 g 플래그 시 lastIndex가 누적되므로 매 호출마다 0으로 리셋.
  TRACK_PATTERN.lastIndex = 0;
  const trackMatches = text.match(TRACK_PATTERN);
  if (trackMatches && trackMatches.length >= 2) {
    return "conditional";
  }

  // 3. "두 과목 모두" / "각 과목" — 탐구 두 과목 동시 충족 등
  if (
    partial.investigationRule === "two_each" ||
    TWO_EACH_KEYWORDS.some((k) => text.includes(k))
  ) {
    return "with_required";
  }

  // 4. "포함"/"또는"/"반드시" 등 — 가장 흔한 자동판정 불가 케이스
  const requiredInclusionKeywords = ["포함", "단,", "단 ", "또는", "반드시", "필수"];
  if (requiredInclusionKeywords.some((k) => text.includes(k))) {
    return "with_required";
  }

  // 5. additionalRules가 본격 자유 텍스트 (한 줄 주석 이상) → custom
  if ((partial.additionalRules?.length ?? 0) > 30) {
    return "custom";
  }

  // 6. 정형 케이스 — requiredCount가 candidateAreas 전체이면 simple_avg, 일부면 simple_sum
  if (partial.requiredCount === partial.candidateAreas.length) {
    return "simple_avg";
  }
  return "simple_sum";
}

/** complexity → autoEvaluable 매핑 (분류와 별개로 명시화) */
export function isAutoEvaluable(complexity: CsatMinimumComplexity): boolean {
  return complexity === "simple_sum" || complexity === "simple_avg";
}

/**
 * ETL 파이프라인에서 사용 — partial 데이터에 complexity·autoEvaluable 채워 완성.
 */
export function finalizeMinReq(
  partial: Omit<CsatMinimum, "complexity" | "autoEvaluable">,
): CsatMinimum {
  const complexity = classifyMinReq(partial);
  return {
    ...partial,
    complexity,
    autoEvaluable: isAutoEvaluable(complexity),
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   충족 판정 — autoEvaluable=true 케이스만 판정
   ═══════════════════════════════════════════════════════════════════════ */

export type MinReqEvalResult =
  | {
      evaluable: true;
      met: boolean;
      /** 충족 시: 합산에 사용된 영역과 각 등급 (UI 표시용) */
      detail: { area: CsatArea; grade: Grade }[];
      /** 합산 등급 (선택된 N개의 합) */
      sumGrade: number;
    }
  | {
      evaluable: false;
      reason: "complex_rule" | "missing_score" | "no_csat";
      /** UI에 그대로 노출할 원문 */
      originalText: string;
    };

/**
 * 자동판정 가능한 케이스만 충족 여부 판정.
 *
 * 알고리즘:
 *   1. autoEvaluable=false → evaluable=false 즉시 반환 (UI는 originalText 표시)
 *   2. csat 없으면 evaluable=false (수능 미응시 — 모의로는 판정 X)
 *   3. candidateAreas 각 영역의 등급 추출 (탐구는 investigationRule 적용)
 *   4. 등급 오름차순 정렬 후 상위 N개(=requiredCount) 선택 → 합산
 *   5. sumGradeMax 이하면 충족 + 영어/한국사 자격 기준 추가 검증
 */
export function evaluateMinReq(
  min: CsatMinimum,
  csat: CsatScore | undefined,
): MinReqEvalResult {
  if (!min.autoEvaluable) {
    return { evaluable: false, reason: "complex_rule", originalText: min.originalText };
  }
  if (!csat) {
    return { evaluable: false, reason: "no_csat", originalText: min.originalText };
  }

  // 후보 영역별 등급 수집
  const candidates: { area: CsatArea; grade: Grade }[] = [];
  for (const area of min.candidateAreas) {
    const grade = pickAreaGrade(csat, area, min.investigationRule);
    if (grade == null) {
      return { evaluable: false, reason: "missing_score", originalText: min.originalText };
    }
    candidates.push({ area, grade });
  }

  // 영어/한국사 자격 기준 — 별도 영역. 후보에 없어도 검사.
  if (min.englishGradeMax != null && csat.english.grade > min.englishGradeMax) {
    return {
      evaluable: true,
      met: false,
      detail: [{ area: "english", grade: csat.english.grade }],
      sumGrade: 0,
    };
  }
  if (min.historyGradeMax != null && csat.history.grade > min.historyGradeMax) {
    return {
      evaluable: true,
      met: false,
      detail: [{ area: "history", grade: csat.history.grade }],
      sumGrade: 0,
    };
  }

  // 합산: 등급 오름차순 (낮은 등급 = 우수) 상위 requiredCount개
  candidates.sort((a, b) => a.grade - b.grade);
  const picked = candidates.slice(0, min.requiredCount);
  const sumGrade = picked.reduce((s, x) => s + x.grade, 0);

  // simple_avg 케이스 — sumGradeMax는 평균 등급이 아닌 합으로 변환되어 저장 가정.
  // (ETL이 simple_avg일 때 sumGradeMax = avgMax × requiredCount 로 정규화)
  return {
    evaluable: true,
    met: sumGrade <= min.sumGradeMax,
    detail: picked,
    sumGrade,
  };
}

/**
 * 영역별 등급 추출. 탐구는 investigationRule에 따라 다르게 합산.
 */
function pickAreaGrade(
  csat: CsatScore,
  area: CsatArea,
  rule: CsatMinimum["investigationRule"],
): Grade | null {
  switch (area) {
    case "korean":
      return csat.korean.grade;
    case "math":
      return csat.math.grade;
    case "english":
      return csat.english.grade;
    case "history":
      return csat.history.grade;
    case "second_lang":
      return csat.secondLang?.grade ?? null;
    case "investigation": {
      if (csat.investigation.length === 0) return null;
      if (rule === "one") {
        // 두 과목 중 더 좋은 등급(낮은 숫자)
        return Math.min(...csat.investigation.map((i) => i.grade)) as Grade;
      }
      if (rule === "two_avg") {
        // 두 과목 평균 — 단, Grade는 정수. 반올림 결정 필요.
        // 여기서는 합 기반으로 보정: 합산 시 평균 등급이 그대로 비교 가능하도록 floor 사용
        // (보수적: 평균이 2.5면 3등급으로 처리)
        const avg = csat.investigation.reduce((s, i) => s + i.grade, 0) / csat.investigation.length;
        return Math.ceil(avg) as Grade;
      }
      // two_each는 분류 단계에서 with_required로 빠지므로 여기 도달 X
      return Math.min(...csat.investigation.map((i) => i.grade)) as Grade;
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   응시영역 자격 사전 체크 (B1, P0)
   ───────────────────────────────────────────────────────────────────────
   `CsatMinimum`(최저학력) 과 다른 차원. 응시영역 미충족 = 지원 자격 미달.
   따라서 매칭 알고리즘은 evaluateRequiredAreas() 를 먼저 호출해 자격을
   확인한 뒤, 통과한 경우에만 evaluateMinReq() 로 최저학력을 평가한다.
   ═══════════════════════════════════════════════════════════════════════ */

export type RequiredAreasResult =
  | { evaluable: true; qualified: true }
  | { evaluable: true; qualified: false; reasons: RequiredAreasReason[] }
  | { evaluable: false; reason: "no_csat" };

export type RequiredAreasReason =
  | { area: "korean";       expected: string[]; actual?: string }
  | { area: "math";         expected: string[]; actual?: string }
  | { area: "english";      expected: "응시 필수"; actual: "미응시" }
  | { area: "history";      expected: "응시 필수"; actual: "미응시" }
  | { area: "investigation"; expected: { types: string[]; count: number }; actual: { types: string[]; count: number } };

/**
 * 응시영역 자격 평가.
 *
 * @param req  AdmissionTrack.requiredAreas
 * @param csat 사용자 수능 점수 (or 본 수능 모의로는 자격 평가 불가능 — actual=true 인 csat 권장)
 */
export function evaluateRequiredAreas(
  req: CsatRequiredAreas,
  csat: CsatScore | undefined,
): RequiredAreasResult {
  if (!csat) return { evaluable: false, reason: "no_csat" };

  const reasons: RequiredAreasReason[] = [];

  // 국어 응시 과목
  if (req.korean?.required) {
    const userCourse = csat.korean.course;
    if (userCourse && !req.korean.courses.includes(userCourse)) {
      reasons.push({ area: "korean", expected: req.korean.courses, actual: userCourse });
    }
  }

  // 수학 응시 과목
  if (req.math?.required) {
    const userCourse = csat.math.course;
    if (userCourse && !req.math.courses.includes(userCourse)) {
      reasons.push({ area: "math", expected: req.math.courses, actual: userCourse });
    }
  }

  // 영어 응시 (등급이 있으면 응시한 것으로 간주)
  if (req.english) {
    if (csat.english.grade == null) {
      reasons.push({ area: "english", expected: "응시 필수", actual: "미응시" });
    }
  }

  // 한국사 응시
  if (req.history) {
    if (csat.history.grade == null) {
      reasons.push({ area: "history", expected: "응시 필수", actual: "미응시" });
    }
  }

  // 탐구 — 인정 종류 + 응시 과목 수
  if (req.investigation) {
    const userInv = csat.investigation ?? [];
    const acceptedTypes = req.investigation.types;
    const userTypes = userInv.map((i) => i.type);
    const acceptedCount = userInv.filter((i) => acceptedTypes.includes(i.type)).length;

    if (acceptedCount < req.investigation.requiredCount) {
      reasons.push({
        area: "investigation",
        expected: { types: acceptedTypes, count: req.investigation.requiredCount },
        actual: { types: userTypes, count: acceptedCount },
      });
    }
  }

  if (reasons.length === 0) return { evaluable: true, qualified: true };
  return { evaluable: true, qualified: false, reasons };
}

/**
 * UI 표시용 — 자격 미달 사유 한국어 문구 변환
 */
export function requiredAreasReasonText(reason: RequiredAreasReason): string {
  switch (reason.area) {
    case "korean":
      return `국어: ${reason.expected.join("/")} 응시 필요 (현재: ${reason.actual ?? "미입력"})`;
    case "math":
      return `수학: ${reason.expected.join("/")} 응시 필요 (현재: ${reason.actual ?? "미입력"})`;
    case "english":
      return "영어 영역 응시 필수";
    case "history":
      return "한국사 영역 응시 필수";
    case "investigation":
      return `탐구: ${reason.expected.types.join("/")} 중 ${reason.expected.count}과목 필요 (현재: ${reason.actual.count}과목)`;
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   UI 표시 헬퍼
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * 사용자에게 보여줄 수능최저 문구 생성.
 *
 * - autoEvaluable=true: 평가 결과(met/sumGrade)를 정형 문장으로
 * - autoEvaluable=false: originalText 그대로 + "수동 확인 필요" 안내
 */
export function minReqDisplayText(
  min: CsatMinimum,
  result?: MinReqEvalResult,
): { headline: string; detail: string; manualCheckRequired: boolean } {
  if (!min.autoEvaluable) {
    return {
      headline: "수능최저 자동 판정 불가",
      detail: min.originalText,
      manualCheckRequired: true,
    };
  }
  if (!result || !result.evaluable) {
    return {
      headline: "수능 점수 입력 시 충족 여부 자동 판정",
      detail: min.originalText,
      manualCheckRequired: false,
    };
  }
  if (result.met) {
    const picked = result.detail.map((d) => areaLabel(d.area)).join("·");
    return {
      headline: `수능최저 충족 (${picked} 합 ${result.sumGrade}등급)`,
      detail: min.originalText,
      manualCheckRequired: false,
    };
  }
  return {
    headline: "수능최저 미충족",
    detail: min.originalText,
    manualCheckRequired: false,
  };
}

const AREA_LABELS: Record<CsatArea, string> = {
  korean: "국어",
  math: "수학",
  english: "영어",
  investigation: "탐구",
  history: "한국사",
  second_lang: "제2외국어",
};

function areaLabel(area: CsatArea): string {
  return AREA_LABELS[area];
}
