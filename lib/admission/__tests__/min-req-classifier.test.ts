/**
 * classifyMinReq — 수능최저 분류기 회귀 테스트
 *
 * 5개 카테고리 × 5케이스 이상.
 *
 * 핵심 안전 보장:
 *   - with_required 케이스는 절대 simple_sum / simple_avg 로 분류되면 안 된다.
 *     (자동판정으로 빠지면 사용자가 "충족" 안내를 받는데 실제 모집요강은
 *      추가 조건 강제 → 사용자 영향 발생, operations.md §8.2 인시던트)
 *   - conditional 케이스도 마찬가지.
 *   - autoEvaluable 매핑: simple_* 만 true, 그 외 모두 false.
 *
 * 테스트 데이터는 실제 한국 대학 모집요강 표현 패턴을 참고했지만,
 * 특정 학교의 실제 기준이 아닌 합성 케이스이다.
 */

import { describe, it, expect } from "vitest";
import {
  classifyMinReq,
  isAutoEvaluable,
  finalizeMinReq,
  evaluateRequiredAreas,
} from "../min-req-classifier";
import type {
  CsatArea,
  CsatMinimum,
  CsatRequiredAreas,
  CsatScore,
} from "@/types/admission";

type PartialMinReq = Omit<CsatMinimum, "complexity" | "autoEvaluable">;

/**
 * 기본값을 주입하는 빌더 — 테스트가 originalText·investigationRule 등
 * 분류 결정 요소만 명시하면 되도록 단순화.
 */
function build(overrides: Partial<PartialMinReq>): PartialMinReq {
  return {
    candidateAreas: ["korean", "math", "english", "investigation"] as CsatArea[],
    requiredCount: 3,
    sumGradeMax: 5,
    originalText: "",
    ...overrides,
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   simple_sum — "후보 영역 중 N개 합 X 이내" (requiredCount < candidateAreas.length)
   ═══════════════════════════════════════════════════════════════════════ */

describe("classifyMinReq — simple_sum", () => {
  it("[1/5] '국·수·영·탐 중 3개 합 5등급 이내'", () => {
    const min = build({
      originalText: "국·수·영·탐 중 3개 합 5등급 이내",
      requiredCount: 3,
    });
    expect(classifyMinReq(min)).toBe("simple_sum");
  });

  it("[2/5] '국·수·영·탐 중 2개 합 4등급'", () => {
    const min = build({
      originalText: "국·수·영·탐 중 2개 합 4등급",
      requiredCount: 2,
      sumGradeMax: 4,
    });
    expect(classifyMinReq(min)).toBe("simple_sum");
  });

  it("[3/5] '국어·수학·영어 중 2개 합 4 (탐구 미반영)'", () => {
    const min = build({
      candidateAreas: ["korean", "math", "english"],
      originalText: "국어·수학·영어 중 2개 합 4",
      requiredCount: 2,
      sumGradeMax: 4,
    });
    expect(classifyMinReq(min)).toBe("simple_sum");
  });

  it("[4/5] '국·수·영·탐 중 3개 합 7, 한국사 4등급 이내'", () => {
    const min = build({
      originalText: "국·수·영·탐 중 3개 합 7, 한국사 4등급 이내",
      requiredCount: 3,
      sumGradeMax: 7,
      historyGradeMax: 4,
    });
    expect(classifyMinReq(min)).toBe("simple_sum");
  });

  it("[5/5] '국·수·영·탐 중 2개 합 6 (탐구 1과목 반영)'", () => {
    const min = build({
      originalText: "국·수·영·탐 중 2개 합 6",
      requiredCount: 2,
      sumGradeMax: 6,
      investigationRule: "one",
    });
    expect(classifyMinReq(min)).toBe("simple_sum");
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   simple_avg — 모든 후보 영역 합산 (requiredCount === candidateAreas.length)
   ═══════════════════════════════════════════════════════════════════════ */

describe("classifyMinReq — simple_avg", () => {
  it("[1/5] '국·수·영·탐 평균 2등급'", () => {
    const min = build({
      originalText: "국·수·영·탐 평균 2등급",
      requiredCount: 4, // == candidateAreas.length
      sumGradeMax: 8, // 평균 2 = 4 영역 합 8
    });
    expect(classifyMinReq(min)).toBe("simple_avg");
  });

  it("[2/5] '국어·수학 평균 2등급'", () => {
    const min = build({
      candidateAreas: ["korean", "math"],
      originalText: "국어·수학 평균 2등급",
      requiredCount: 2,
      sumGradeMax: 4,
    });
    expect(classifyMinReq(min)).toBe("simple_avg");
  });

  it("[3/5] '국·수·영 평균 3등급'", () => {
    const min = build({
      candidateAreas: ["korean", "math", "english"],
      originalText: "국·수·영 평균 3등급",
      requiredCount: 3,
      sumGradeMax: 9,
    });
    expect(classifyMinReq(min)).toBe("simple_avg");
  });

  it("[4/5] '국·수·영·탐 4개 합 8 (평균 2등급)'", () => {
    const min = build({
      originalText: "국·수·영·탐 4개 합 8",
      requiredCount: 4,
      sumGradeMax: 8,
    });
    expect(classifyMinReq(min)).toBe("simple_avg");
  });

  it("[5/5] '국어·수학 2개 합 4'", () => {
    const min = build({
      candidateAreas: ["korean", "math"],
      originalText: "국어·수학 2개 합 4",
      requiredCount: 2,
      sumGradeMax: 4,
    });
    expect(classifyMinReq(min)).toBe("simple_avg");
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   with_required — "포함" 키워드 또는 investigationRule="two_each"
   ═══════════════════════════════════════════════════════════════════════ */

describe("classifyMinReq — with_required", () => {
  it("[1/5] '국·수·영·탐 중 3개 합 6, 수학 포함'", () => {
    const min = build({
      originalText: "국·수·영·탐 중 3개 합 6, 수학 포함",
      requiredCount: 3,
      sumGradeMax: 6,
    });
    expect(classifyMinReq(min)).toBe("with_required");
  });

  it("[2/5] 사용자 예시: '수학·탐구 포함 3개 합 6'", () => {
    const min = build({
      originalText: "국·수·영·탐 중 수학·탐구 포함 3개 합 6",
      requiredCount: 3,
      sumGradeMax: 6,
    });
    expect(classifyMinReq(min)).toBe("with_required");
  });

  it("[3/5] '수학 또는 탐구 영역에서 1등급'", () => {
    const min = build({
      originalText: "수학 또는 탐구 영역에서 1등급 이상",
      requiredCount: 1,
      sumGradeMax: 1,
    });
    expect(classifyMinReq(min)).toBe("with_required");
  });

  it("[4/5] 탐구 두 과목 모두 (investigationRule='two_each')", () => {
    const min = build({
      originalText: "탐구 두 과목 모두 2등급 이내",
      investigationRule: "two_each",
      requiredCount: 2,
      sumGradeMax: 4,
    });
    expect(classifyMinReq(min)).toBe("with_required");
  });

  it("[5/5] '국·수·영 합 6, 단 영어 1등급'", () => {
    const min = build({
      candidateAreas: ["korean", "math", "english"],
      originalText: "국·수·영 합 6, 단 영어 1등급 이상",
      requiredCount: 3,
      sumGradeMax: 6,
      englishGradeMax: 1,
    });
    expect(classifyMinReq(min)).toBe("with_required");
  });

  it("[6/5] '반드시 수학 포함 3개 합 5'", () => {
    const min = build({
      originalText: "반드시 수학을 포함하여 3개 합 5",
      requiredCount: 3,
      sumGradeMax: 5,
    });
    expect(classifyMinReq(min)).toBe("with_required");
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   conditional — 계열별·전공별 차등
   ═══════════════════════════════════════════════════════════════════════ */

describe("classifyMinReq — conditional", () => {
  it("[1/5] 사용자 예시: '인문계열 3개 합 5, 자연계열 수학 포함 3개 합 6'", () => {
    const min = build({
      originalText: "인문계열 3개 합 5, 자연계열 수학 포함 3개 합 6",
      requiredCount: 3,
      sumGradeMax: 5,
    });
    expect(classifyMinReq(min)).toBe("conditional");
  });

  it("[2/5] '인문은 국·수·영 중 2개 합 4, 자연은 수학·과학 합 5'", () => {
    const min = build({
      originalText: "인문은 국·수·영 중 2개 합 4, 자연은 수학·과학 합 5 (계열별 차등)",
      requiredCount: 2,
      sumGradeMax: 4,
    });
    expect(classifyMinReq(min)).toBe("conditional");
  });

  it("[3/5] '의예에 한해 4개 합 5'", () => {
    const min = build({
      originalText: "의예에 한해 4개 합 5",
      requiredCount: 4,
      sumGradeMax: 5,
    });
    expect(classifyMinReq(min)).toBe("conditional");
  });

  it("[4/5] '전공별 차등 적용'", () => {
    const min = build({
      originalText: "전공별 차등 적용 (모집요강 참조)",
    });
    expect(classifyMinReq(min)).toBe("conditional");
  });

  it("[5/5] '공학계열 한정으로 수학 1등급'", () => {
    const min = build({
      originalText: "공학계열 한정으로 수학 1등급 이상",
      requiredCount: 1,
      sumGradeMax: 1,
    });
    expect(classifyMinReq(min)).toBe("conditional");
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   custom — additionalRules 자유 텍스트가 30자 초과
   ═══════════════════════════════════════════════════════════════════════ */

describe("classifyMinReq — custom", () => {
  it("[1/5] additionalRules가 31자 이상의 자연어 (포함/계열 키워드 없음)", () => {
    const min = build({
      originalText: "수능 종합 기준",
      additionalRules:
        "수학은 미적분 또는 기하 응시자에 한해 표준점수 130 이상으로 환산하여 합산합니다.",
    });
    // additionalRules 길이 30 초과 → custom (단, "한해" 키워드는 conditional 우선 매칭됨에 유의)
    // 본 케이스는 "한해"로 conditional 분기 — 동일 우선순위 검증
    const result = classifyMinReq(min);
    expect(["custom", "conditional"]).toContain(result);
    // 단, simple_* 로는 절대 분류되면 안 됨
    expect(result).not.toBe("simple_sum");
    expect(result).not.toBe("simple_avg");
  });

  it("[2/5] additionalRules가 길고 키워드 없는 순수 자유 텍스트", () => {
    const min = build({
      originalText: "기본 기준",
      additionalRules:
        "본 모집요강 발표 이후 추가 공지 사항이 있을 경우 별첨 자료를 따르며 신중히 검토 바랍니다.",
    });
    // "별도" 키워드도 없고 "한해" 없음. 길이만으로 custom 판정.
    expect(classifyMinReq(min)).toBe("custom");
  });

  it("[3/5] '탐구 영역 변환표준점수 합 130 이상이고 한국사 3등급 이내'", () => {
    const min = build({
      originalText: "탐구 영역 변환표준점수 합 130 이상이고 한국사 3등급 이내일 것",
      additionalRules:
        "탐구 변환표준점수는 본교 변환표를 적용하며 수능 성적 발표 후 별도 공지합니다.",
      historyGradeMax: 3,
    });
    // "별도" 키워드로 custom 또는 길이로 custom
    const result = classifyMinReq(min);
    expect(result).toBe("custom");
  });

  it("[4/5] '응시 영역에 따라 합산 방식이 달라지는 자연어'", () => {
    const min = build({
      originalText: "수능 응시 영역에 따라 합산 방식이 달라지는 복합 기준",
      additionalRules:
        "국어 화법과작문 응시자는 표준점수에 0.95를 곱하고, 언어와매체 응시자는 그대로 반영하며 합산.",
    });
    expect(classifyMinReq(min)).toBe("custom");
  });

  it("[5/5] 모집요강 본문을 그대로 옮긴 긴 자유 텍스트", () => {
    const min = build({
      originalText: "복합 수능최저 기준",
      additionalRules:
        "수능 4개 영역의 표준점수를 기반으로 본교 환산점수가 750점 이상이며, 동시에 학생부 교과 평균이 2.5등급 이내일 것을 요구합니다. 자세한 환산식은 모집요강 부록 참조.",
    });
    expect(classifyMinReq(min)).toBe("custom");
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   안전 보장 — with_required / conditional 케이스가 simple_*로 분류되지 않음
   ═══════════════════════════════════════════════════════════════════════ */

describe("classifyMinReq — 안전 보장 (with_required/conditional은 simple_*로 가지 않는다)", () => {
  /**
   * 이 블록은 사용자 결정사항(operations.md §8.2)의 인시던트 방지가 핵심.
   * 자동판정 가능으로 잘못 분류되면 사용자가 "수능최저 충족" 잘못된 안내를 받음.
   */

  const withRequiredCases: PartialMinReq[] = [
    build({ originalText: "국·수·영·탐 중 3개 합 6, 수학 포함" }),
    build({ originalText: "수학·탐구 포함 3개 합 6" }),
    build({ originalText: "수학 또는 탐구에서 1등급" }),
    build({ originalText: "단, 영어를 반드시 포함하여 합산" }),
    build({ investigationRule: "two_each", originalText: "탐구 두 과목 모두 2등급" }),
    build({ originalText: "각 과목 2등급 이내" }),
  ];

  it.each(withRequiredCases)(
    "with_required 케이스는 simple_*로 분류되지 않음 — '%s'",
    (min) => {
      const result = classifyMinReq(min);
      expect(result).not.toBe("simple_sum");
      expect(result).not.toBe("simple_avg");
    },
  );

  const conditionalCases: PartialMinReq[] = [
    build({ originalText: "인문계열 3개 합 5, 자연계열 수학 포함 3개 합 6" }),
    build({ originalText: "전공별 차등 적용" }),
    build({ originalText: "의예에 한해 4개 합 5" }),
    build({ originalText: "공학계열 한정 수학 1등급" }),
    build({ originalText: "계열별 별도 기준 적용" }),
  ];

  it.each(conditionalCases)(
    "conditional 케이스는 simple_*로 분류되지 않음 — '%s'",
    (min) => {
      const result = classifyMinReq(min);
      expect(result).not.toBe("simple_sum");
      expect(result).not.toBe("simple_avg");
    },
  );
});

/* ═══════════════════════════════════════════════════════════════════════
   isAutoEvaluable 매핑 검증
   ═══════════════════════════════════════════════════════════════════════ */

describe("isAutoEvaluable", () => {
  it("simple_sum / simple_avg 만 true", () => {
    expect(isAutoEvaluable("simple_sum")).toBe(true);
    expect(isAutoEvaluable("simple_avg")).toBe(true);
  });

  it("with_required / conditional / custom 은 false", () => {
    expect(isAutoEvaluable("with_required")).toBe(false);
    expect(isAutoEvaluable("conditional")).toBe(false);
    expect(isAutoEvaluable("custom")).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   finalizeMinReq — 통합 ETL 함수 검증
   ═══════════════════════════════════════════════════════════════════════ */

describe("finalizeMinReq", () => {
  it("simple_sum 케이스에서 autoEvaluable=true, complexity=simple_sum 채움", () => {
    const partial = build({
      originalText: "국·수·영·탐 중 3개 합 5등급 이내",
      requiredCount: 3,
    });
    const final = finalizeMinReq(partial);
    expect(final.complexity).toBe("simple_sum");
    expect(final.autoEvaluable).toBe(true);
    expect(final.originalText).toBe(partial.originalText);
  });

  it("with_required 케이스에서 autoEvaluable=false 강제", () => {
    const partial = build({
      originalText: "국·수·영·탐 중 3개 합 6, 수학 포함",
      requiredCount: 3,
    });
    const final = finalizeMinReq(partial);
    expect(final.complexity).toBe("with_required");
    expect(final.autoEvaluable).toBe(false);
  });

  it("conditional 케이스에서 autoEvaluable=false 강제", () => {
    const partial = build({
      originalText: "인문계열 3개 합 5, 자연계열 수학 포함 3개 합 6",
      requiredCount: 3,
    });
    const final = finalizeMinReq(partial);
    expect(final.complexity).toBe("conditional");
    expect(final.autoEvaluable).toBe(false);
  });

  it("custom 케이스에서 autoEvaluable=false 강제", () => {
    const partial = build({
      originalText: "기본 기준",
      additionalRules:
        "본 모집요강 발표 이후 추가 공지 사항이 있을 경우 별첨 자료를 따르며 신중히 검토 바랍니다.",
    });
    const final = finalizeMinReq(partial);
    expect(final.complexity).toBe("custom");
    expect(final.autoEvaluable).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   분류 우선순위 검증 — 키워드가 겹칠 때
   ═══════════════════════════════════════════════════════════════════════ */

describe("classifyMinReq — 우선순위 (키워드 충돌)", () => {
  it("'계열별' + '포함' 동시 등장 시 conditional 우선 (계열 분리가 더 큰 분기 단위)", () => {
    const min = build({
      originalText: "계열별로 다름. 인문 3개 합 5, 자연 수학 포함 3개 합 6",
    });
    expect(classifyMinReq(min)).toBe("conditional");
  });

  it("'two_each' + '포함' 동시 등장 시 with_required (두 케이스 모두 with_required)", () => {
    const min = build({
      originalText: "탐구 두 과목 모두, 수학 포함 3개 합 6",
      investigationRule: "two_each",
    });
    expect(classifyMinReq(min)).toBe("with_required");
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   evaluateRequiredAreas — 응시영역 자격 사전 체크 (B1, P0)
   ═══════════════════════════════════════════════════════════════════════ */

function buildCsat(overrides: Partial<CsatScore>): CsatScore {
  return {
    actual: true,
    takenAt: "2026-11-13",
    korean: { grade: 2, course: "speech_writing" },
    math: { grade: 2, course: "calculus" },
    english: { grade: 2 },
    history: { grade: 3 },
    investigation: [
      { course: "물리학I", type: "science", grade: 2 },
      { course: "화학I", type: "science", grade: 2 },
    ],
    ...overrides,
  };
}

describe("evaluateRequiredAreas", () => {
  it("자연계 자격 (수학 미적분 + 과탐 2과목) — 자격 충족", () => {
    const req: CsatRequiredAreas = {
      math: { courses: ["calculus", "geometry"], required: true },
      english: true,
      history: true,
      investigation: { types: ["science"], requiredCount: 2 },
    };
    const csat = buildCsat({}); // 기본: 미적분 + 과탐 2과목
    const result = evaluateRequiredAreas(req, csat);
    expect(result.evaluable).toBe(true);
    if (result.evaluable) expect(result.qualified).toBe(true);
  });

  it("자연계 자격인데 사용자가 확률과통계 응시 — 자격 미달", () => {
    const req: CsatRequiredAreas = {
      math: { courses: ["calculus", "geometry"], required: true },
      english: true,
      history: true,
      investigation: { types: ["science"], requiredCount: 2 },
    };
    const csat = buildCsat({
      math: { grade: 2, course: "probability_statistics" },
    });
    const result = evaluateRequiredAreas(req, csat);
    expect(result.evaluable).toBe(true);
    expect(result.evaluable && result.qualified).toBe(false);
    if (result.evaluable && !result.qualified) {
      expect(result.reasons.some((r) => r.area === "math")).toBe(true);
    }
  });

  it("자연계 자격인데 탐구 1과목만 응시 — 자격 미달", () => {
    const req: CsatRequiredAreas = {
      english: true,
      history: true,
      investigation: { types: ["science"], requiredCount: 2 },
    };
    const csat = buildCsat({
      investigation: [{ course: "물리학I", type: "science", grade: 2 }],
    });
    const result = evaluateRequiredAreas(req, csat);
    expect(result.evaluable).toBe(true);
    expect(result.evaluable && result.qualified).toBe(false);
    if (result.evaluable && !result.qualified) {
      const invReason = result.reasons.find((r) => r.area === "investigation");
      expect(invReason).toBeDefined();
    }
  });

  it("인문계 자격 (사탐/과탐 모두 인정) — 사탐 2과목 응시 시 충족", () => {
    const req: CsatRequiredAreas = {
      english: true,
      history: true,
      investigation: { types: ["social", "science"], requiredCount: 2 },
    };
    const csat = buildCsat({
      investigation: [
        { course: "생활과윤리", type: "social", grade: 2 },
        { course: "사회문화", type: "social", grade: 3 },
      ],
    });
    const result = evaluateRequiredAreas(req, csat);
    expect(result.evaluable && result.qualified).toBe(true);
  });

  it("자연계 자격인데 사탐 응시 — 자격 미달 (탐구 종류 불일치)", () => {
    const req: CsatRequiredAreas = {
      english: true,
      history: true,
      investigation: { types: ["science"], requiredCount: 2 },
    };
    const csat = buildCsat({
      investigation: [
        { course: "생활과윤리", type: "social", grade: 2 },
        { course: "사회문화", type: "social", grade: 3 },
      ],
    });
    const result = evaluateRequiredAreas(req, csat);
    expect(result.evaluable && result.qualified).toBe(false);
  });

  it("csat 미입력 → evaluable: false", () => {
    const req: CsatRequiredAreas = { english: true, history: true };
    const result = evaluateRequiredAreas(req, undefined);
    expect(result.evaluable).toBe(false);
    if (!result.evaluable) expect(result.reason).toBe("no_csat");
  });
});
