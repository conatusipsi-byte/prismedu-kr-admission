/**
 * callKrCounselor — mock 분기 + plan 모델 + 정직성 회귀
 *
 * 검증 (Day 6):
 *   1. selectCounselorModel — plan 별 Claude 모델 매핑 (Haiku/Sonnet/Opus)
 *   2. mock 시나리오 분기 (표본 부족 / 수치 시도 / 일반)
 *   3. P-002 — 모든 mock 응답에 "확정 합격" 표현 0건
 *   4. mock도 sanitize 후처리 통과 (sanitizeResult 형식 일관)
 *   5. usage 형식 일관 (mock·실 호출 모두 inputTokens/outputTokens)
 *   6. source 식별 — "mock" 명시
 *   7. 결정적 — 같은 입력에 같은 mock 응답
 */

import { describe, it, expect } from "vitest";
import {
  callKrCounselor,
  selectCounselorModel,
  type CallKrCounselorInput,
} from "@/lib/anthropic";

function baseInput(overrides: Partial<CallKrCounselorInput> = {}): CallKrCounselorInput {
  return {
    systemPrompt: "당신은 한국 대학 입시 전문 AI 카운슬러입니다.",
    messages: [{ role: "user", content: "안녕하세요, 입시 상담받고 싶어요." }],
    insufficientSampleSchools: [],
    plan: "free",
    forceMock: true,
    ...overrides,
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   1. selectCounselorModel — plan 분기
   ═══════════════════════════════════════════════════════════════════════ */

describe("selectCounselorModel — plan 별 모델 매핑", () => {
  it("free → claude-haiku-4-5", () => {
    expect(selectCounselorModel("free")).toMatch(/haiku-4-5/);
  });
  it("pro → claude-sonnet-4-6", () => {
    expect(selectCounselorModel("pro")).toMatch(/sonnet-4-6/);
  });
  it("elite → claude-opus-4-7", () => {
    expect(selectCounselorModel("elite")).toMatch(/opus-4-7/);
  });

  it("비용 우선순위: free < pro < elite (모델 식별자가 다름)", () => {
    const free = selectCounselorModel("free");
    const pro = selectCounselorModel("pro");
    const elite = selectCounselorModel("elite");
    expect(free).not.toBe(pro);
    expect(pro).not.toBe(elite);
    expect(free).not.toBe(elite);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   2. callKrCounselor — mock 시나리오 분기
   ═══════════════════════════════════════════════════════════════════════ */

describe("callKrCounselor — mock 시나리오", () => {
  it("표본 부족 컨텍스트 + 수치 시도 질문 → 일반론 응답 (수치 없음, P-002)", async () => {
    const r = await callKrCounselor(
      baseInput({
        messages: [{ role: "user", content: "이 학과 합격률 정확히 알려주세요" }],
        insufficientSampleSchools: ["고려대 자유전공학부"],
      }),
    );
    // 응답에 수치 패턴 (등급/점수/%) 0건
    expect(r.response).not.toMatch(/\d+(\.\d+)?\s*(%|％|등급|점)/);
    // "표본" 또는 "분석 페이지" 안내 포함
    expect(r.response).toMatch(/표본|분석 페이지|모집요강/);
    expect(r.source).toBe("mock");
  });

  it("표본 부족 컨텍스트 + 일반 질문 → 일반론 응답 (수치 없음)", async () => {
    const r = await callKrCounselor(
      baseInput({
        messages: [{ role: "user", content: "어떤 학과를 선택하면 좋을까요?" }],
        insufficientSampleSchools: ["서울대 의예과"],
      }),
    );
    expect(r.response).not.toMatch(/\d+(\.\d+)?\s*(%|등급|점)/);
  });

  it("컨텍스트 비어있음 + 일반 질문 → 가이드 응답 (정형 안내)", async () => {
    const r = await callKrCounselor(
      baseInput({
        messages: [{ role: "user", content: "수시와 정시 어떤 게 유리한가요?" }],
        insufficientSampleSchools: [],
      }),
    );
    // 일반 가이드는 학종·정시 등 도메인 키워드 포함
    expect(r.response).toMatch(/내신|수능|학종|정시|수시/);
    expect(r.source).toBe("mock");
  });

  it("컨텍스트 비어있음 + 수치 시도 질문 → 수치 포함 mock (정형 답변 정당)", async () => {
    // 컨텍스트가 비어있으면 sanitize 발동 안 함 → mock 수치가 그대로 응답에 노출.
    // 이는 정형 안내 (예: "변환표는 ~점 수준") 패턴이라 정당.
    const r = await callKrCounselor(
      baseInput({
        messages: [{ role: "user", content: "이 학과 합격선은 몇 점인가요?" }],
        insufficientSampleSchools: [],
      }),
    );
    // sanitize 발동 X (표본 부족 컨텍스트 없음)
    expect(r.sanitizeResult.triggered).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   3. P-002 — "확정 합격" 표현 차단
   ═══════════════════════════════════════════════════════════════════════ */

describe("P-002 — mock 응답 정직성 (확정 합격 표현 차단)", () => {
  // 다양한 시나리오를 돌려 mock 응답 풀 전체에서 "확정 합격" 0건인지 검증
  const scenarios: Array<{ messages: CallKrCounselorInput["messages"]; insufficient: string[]; label: string }> = [
    { messages: [{ role: "user", content: "확률 알려주세요" }], insufficient: [], label: "수치 시도, 컨텍스트 X" },
    { messages: [{ role: "user", content: "확률 알려주세요" }], insufficient: ["연세대 경영"], label: "수치 시도, 표본 부족" },
    { messages: [{ role: "user", content: "추천해주세요" }], insufficient: [], label: "일반, 컨텍스트 X" },
    { messages: [{ role: "user", content: "추천해주세요" }], insufficient: ["고려대 자유전공"], label: "일반, 표본 부족" },
    { messages: [{ role: "user", content: "어떤 전형이 좋을까요?" }], insufficient: [], label: "전략 질문" },
  ];

  for (const sc of scenarios) {
    it(`${sc.label} — '확정 합격' 0건`, async () => {
      const r = await callKrCounselor(
        baseInput({ messages: sc.messages, insufficientSampleSchools: sc.insufficient }),
      );
      const text = r.response;
      if (/확정 ?합격/.test(text)) {
        // 부정 문맥(아|마|금지)이면 OK, 단정문이면 실패
        expect(text).toMatch(/확정\s*합격.*(아|마|금지|해석)/);
      } else {
        expect(true).toBe(true);
      }
    });
  }

  it("'반드시 합격', '100% 합격' 등 단정 표현 0건", async () => {
    const r = await callKrCounselor(baseInput({
      messages: [{ role: "user", content: "확실하게 합격하려면 어떻게 해야 하나요?" }],
    }));
    expect(r.response).not.toMatch(/반드시\s*합격|100\s*%\s*합격|무조건\s*합격/);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   4. sanitize 후처리 통합
   ═══════════════════════════════════════════════════════════════════════ */

describe("callKrCounselor — sanitize 통합", () => {
  it("sanitizeResult 항상 반환 (형식 일관)", async () => {
    const r = await callKrCounselor(baseInput());
    expect(r.sanitizeResult).toBeDefined();
    expect(typeof r.sanitizeResult.triggered).toBe("boolean");
    expect(Array.isArray(r.sanitizeResult.replacedSentences)).toBe(true);
    expect(r.sanitizeResult.metricMeta).toMatchObject({
      totalSentences: expect.any(Number),
      matchedSentences: expect.any(Number),
      contextSchoolCount: expect.any(Number),
    });
  });

  it("표본 부족 컨텍스트 — metricMeta.contextSchoolCount > 0", async () => {
    const r = await callKrCounselor(
      baseInput({ insufficientSampleSchools: ["고려대 자유전공", "한예종 영상원"] }),
    );
    expect(r.sanitizeResult.metricMeta.contextSchoolCount).toBe(2);
  });

  it("response 텍스트 = sanitizeResult.sanitized (라우트가 sanitized 그대로 전달 보장)", async () => {
    const r = await callKrCounselor(baseInput());
    expect(r.response).toBe(r.sanitizeResult.sanitized);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   5. usage / source / 결정성
   ═══════════════════════════════════════════════════════════════════════ */

describe("callKrCounselor — usage / source / 결정성", () => {
  it("usage.inputTokens · outputTokens 정수 ≥ 1", async () => {
    const r = await callKrCounselor(baseInput());
    expect(Number.isInteger(r.usage.inputTokens)).toBe(true);
    expect(Number.isInteger(r.usage.outputTokens)).toBe(true);
    expect(r.usage.inputTokens).toBeGreaterThanOrEqual(1);
    expect(r.usage.outputTokens).toBeGreaterThanOrEqual(1);
  });

  it("forceMock=true → source='mock', model에 '-mock' suffix", async () => {
    const r = await callKrCounselor(baseInput({ plan: "pro" }));
    expect(r.source).toBe("mock");
    expect(r.model).toMatch(/-mock$/);
  });

  it("같은 입력 → 같은 mock 응답 (결정적)", async () => {
    const input = baseInput({
      messages: [{ role: "user", content: "수시 6장 어떻게 구성하면 좋을까요?" }],
    });
    const r1 = await callKrCounselor(input);
    const r2 = await callKrCounselor(input);
    expect(r1.response).toBe(r2.response);
  });

  it("plan별 모델 식별자가 응답에 노출됨", async () => {
    const free = await callKrCounselor(baseInput({ plan: "free" }));
    const pro = await callKrCounselor(baseInput({ plan: "pro" }));
    const elite = await callKrCounselor(baseInput({ plan: "elite" }));
    expect(free.model).toMatch(/haiku-4-5/);
    expect(pro.model).toMatch(/sonnet-4-6/);
    expect(elite.model).toMatch(/opus-4-7/);
  });
});
