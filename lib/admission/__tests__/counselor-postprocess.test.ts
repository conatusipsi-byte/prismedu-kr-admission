/**
 * sanitizeCounselorResponse — 가드 회귀 테스트
 *
 * 시나리오: 사용자가 표본 부족 학과에 대해 "대략이라도" 압박할 때 LLM이
 * 시스템 프롬프트 가드를 우회해 임의 수치를 응답하는 경우를 가정하고,
 * 후처리 sanitize가 100% 차단함을 검증한다.
 *
 * 통과 기준:
 *   - 모든 시나리오에서 result.triggered === true
 *   - sanitized 텍스트에 수치 패턴이 잔존하지 않음 (정규식 재검사)
 *   - false positive 시나리오는 trigger 안 됨
 */

import { describe, it, expect } from "vitest";
import {
  sanitizeCounselorResponse,
  __test__,
  type SanitizeContext,
} from "../counselor-postprocess";

const { NUMERIC_PATTERNS, REPLACEMENT } = __test__;

const ctx: SanitizeContext = {
  insufficientSampleSchools: ["연세대 컴퓨터과학과"],
  uid: "test-uid",
  conversationId: "test-conv",
};

/** 응답 텍스트에 수치 패턴이 잔존하지 않는지 확인 */
function hasAnyNumericPattern(text: string): boolean {
  return NUMERIC_PATTERNS.some((p) => p.regex.test(text));
}

describe("sanitizeCounselorResponse — 표본 부족 컨텍스트", () => {
  it("[1/5] 퍼센트 추정: '약 15% 정도 합격 가능성이 있습니다'", () => {
    const input =
      "사용자께서 물어보신 연세대 컴퓨터과학과는 약 15% 정도 합격 가능성이 있습니다. 추가로 준비할 점을 알려드릴게요.";
    const result = sanitizeCounselorResponse(input, ctx);

    expect(result.triggered).toBe(true);
    expect(result.replacedSentences.length).toBeGreaterThan(0);
    expect(result.replacedSentences[0].matchedPattern).toBe("percent");
    expect(result.sanitized).toContain(REPLACEMENT);
    expect(hasAnyNumericPattern(result.sanitized)).toBe(false);
  });

  it("[2/5] 등급 추정: '보통 1등급대가 합격합니다'", () => {
    const input =
      "연세대 컴퓨터과학과는 보통 1등급대가 합격합니다. 내신 관리에 신경 쓰세요.";
    const result = sanitizeCounselorResponse(input, ctx);

    expect(result.triggered).toBe(true);
    expect(result.replacedSentences.some((r) => r.matchedPattern === "grade")).toBe(true);
    expect(hasAnyNumericPattern(result.sanitized)).toBe(false);
  });

  it("[3/5] 환산점수 추정: '환산점수 750점 정도 필요합니다'", () => {
    const input =
      "정시로 가려면 환산점수 750점 정도 필요합니다. 수능 대비 계획을 세워보세요.";
    const result = sanitizeCounselorResponse(input, ctx);

    expect(result.triggered).toBe(true);
    expect(
      result.replacedSentences.some(
        (r) => r.matchedPattern === "cutoff_phrase" || r.matchedPattern === "score",
      ),
    ).toBe(true);
    expect(hasAnyNumericPattern(result.sanitized)).toBe(false);
  });

  it("[4/5] 백분위 추정: '최소 백분위 95 이상 받아야 합니다'", () => {
    const input =
      "합격하려면 최소 백분위 95 이상 받아야 합니다. 모의고사로 점검하세요.";
    const result = sanitizeCounselorResponse(input, ctx);

    expect(result.triggered).toBe(true);
    expect(result.replacedSentences.some((r) => r.matchedPattern === "percentile")).toBe(true);
    expect(hasAnyNumericPattern(result.sanitized)).toBe(false);
  });

  it("[5/5] 사용자 압박 후 hedge + 수치: '대략 80퍼센트는 안정권입니다'", () => {
    const input =
      "정확히 알려드릴 수는 없지만 대략 80퍼센트는 안정권입니다. 그래도 다른 학과도 함께 고려해보세요.";
    const result = sanitizeCounselorResponse(input, ctx);

    expect(result.triggered).toBe(true);
    expect(result.replacedSentences.some((r) => r.matchedPattern === "percent")).toBe(true);
    expect(hasAnyNumericPattern(result.sanitized)).toBe(false);
  });

  it("[일괄] 5개 시나리오 모두 가드 통과율 100% — 잔존 수치 0건", () => {
    const cases = [
      "연세대 컴퓨터과학과는 약 15% 정도 합격 가능성이 있습니다.",
      "보통 1등급대가 합격합니다.",
      "환산점수 750점 정도 필요합니다.",
      "최소 백분위 95 이상 받아야 합니다.",
      "대략 80퍼센트는 안정권입니다.",
    ];

    let triggeredCount = 0;
    let residualNumeric = 0;

    for (const c of cases) {
      const r = sanitizeCounselorResponse(c, ctx);
      if (r.triggered) triggeredCount++;
      if (hasAnyNumericPattern(r.sanitized)) residualNumeric++;
    }

    expect(triggeredCount).toBe(5);
    expect(residualNumeric).toBe(0);
  });
});

describe("sanitizeCounselorResponse — false positive 방지", () => {
  it("[FP-1] 수치 없는 일반론 답변은 sanitize 발동 X", () => {
    const input =
      "연세대 컴퓨터과학과는 표본이 누적되면 분석 페이지에서 확률이 표시돼요. 우선 정보·SW 관련 세특이나 동아리 활동을 점검해보세요.";
    const result = sanitizeCounselorResponse(input, ctx);

    expect(result.triggered).toBe(false);
    expect(result.replacedSentences).toHaveLength(0);
    expect(result.sanitized).toBe(result.sanitized); // 응답 유지
  });

  it("[FP-2] 표본 부족 학과 컨텍스트 자체가 없으면 수치 있어도 sanitize 스킵", () => {
    const noCtx: SanitizeContext = {
      insufficientSampleSchools: [],
      uid: "test-uid",
    };
    const input = "전년도 정시 환산점수 750점이 70%컷이었어요.";
    const result = sanitizeCounselorResponse(input, noCtx);

    expect(result.triggered).toBe(false);
    expect(result.sanitized).toContain("750");
  });
});

describe("sanitizeCounselorResponse — 메트릭 메타", () => {
  it("totalSentences / matchedSentences / contextSchoolCount 정확히 채움", () => {
    const input = "연세대 컴퓨터과학과는 보통 1등급이 합격합니다. 추가로 세특을 점검하세요.";
    const result = sanitizeCounselorResponse(input, ctx);

    expect(result.metricMeta.totalSentences).toBe(2);
    expect(result.metricMeta.matchedSentences).toBe(1);
    expect(result.metricMeta.contextSchoolCount).toBe(1);
  });
});
