/**
 * 회귀 가드 (진단 P1-1): spec-analysis 모델 출력이 무검증 통과되어 score>100·문자열
 * score·무효 area 가 UI 까지 새던 버그. parseModelOutput 이 범위·형식을 보장하고,
 * 결과가 SpecAnalysisResponseSchema 를 항상 만족하는지 검증한다.
 */
import { describe, it, expect } from "vitest";
import { parseModelOutput, SPEC_AREAS } from "../parse-model-output";
import { SpecAnalysisResponseSchema } from "@/lib/schemas/api/spec-analysis";

/** parsed(부분) → 스키마 검증 가능한 전체 응답으로 보강 */
function asResponse(parsed: NonNullable<ReturnType<typeof parseModelOutput>>) {
  return { ...parsed, source: "anthropic" as const, usage: { inputTokens: 1, outputTokens: 1 } };
}

describe("parseModelOutput (P1-1 검증)", () => {
  it("score>100 → 100 으로 clamp", () => {
    const r = parseModelOutput(JSON.stringify({ activities: [{ area: "autonomous", score: 150, comment: "좋음" }] }));
    expect(r).not.toBeNull();
    expect(r!.activities.find((a) => a.area === "autonomous")!.score).toBe(100);
  });

  it("음수 score → 0 으로 clamp", () => {
    const r = parseModelOutput(JSON.stringify({ activities: [{ area: "club", score: -20, comment: "x" }] }));
    expect(r!.activities.find((a) => a.area === "club")!.score).toBe(0);
  });

  it("실수 score → 반올림 정수", () => {
    const r = parseModelOutput(JSON.stringify({ activities: [{ area: "career", score: 73.6, comment: "x" }] }));
    expect(r!.activities.find((a) => a.area === "career")!.score).toBe(74);
  });

  it("문자열 score → null (NaN/오버플로 방지)", () => {
    const r = parseModelOutput(JSON.stringify({ activities: [{ area: "career", score: "85", comment: "x" }] }));
    expect(r!.activities.find((a) => a.area === "career")!.score).toBeNull();
  });

  it("무효 area 는 버리고, 누락 area 는 score=null + 정보부족 comment", () => {
    const r = parseModelOutput(JSON.stringify({ activities: [{ area: "INVALID_AREA", score: 50, comment: "x" }] }));
    // 5개 영역 전부 존재, 전부 null (입력 없음/무효)
    expect(r!.activities).toHaveLength(SPEC_AREAS.length);
    expect(r!.activities.every((a) => a.score === null)).toBe(true);
    expect(r!.activities[0].comment).toContain("정보 부족");
  });

  it("comment >400자 → 400자로 절단, 빈 comment → '정보 부족'", () => {
    const long = "가".repeat(500);
    const r = parseModelOutput(JSON.stringify({ activities: [
      { area: "autonomous", score: 50, comment: long },
      { area: "club", score: 50, comment: "   " },
    ] }));
    expect(r!.activities.find((a) => a.area === "autonomous")!.comment.length).toBe(400);
    expect(r!.activities.find((a) => a.area === "club")!.comment).toBe("정보 부족");
  });

  it("문자열 배열: 비문자/공백 제거 + 200자 절단 + 최대 5개", () => {
    const r = parseModelOutput(JSON.stringify({
      activities: [],
      strengths: ["a", 123, "  ", "나".repeat(300), "b", "c", "d", "e", "f"],
    }));
    expect(r!.strengths.length).toBeLessThanOrEqual(5);
    expect(r!.strengths.every((s) => typeof s === "string" && s.length >= 1 && s.length <= 200)).toBe(true);
  });

  it("caveats 비면 기본 caveat 추가", () => {
    const r = parseModelOutput(JSON.stringify({ activities: [] }));
    expect(r!.caveats.length).toBeGreaterThanOrEqual(1);
  });

  it("정상 응답 통과 + 스키마 적합", () => {
    const r = parseModelOutput(JSON.stringify({
      activities: SPEC_AREAS.map((area) => ({ area, score: 70, comment: "양호" })),
      strengths: ["강점1"], weaknesses: ["약점1"], recommendations: ["추천1"], caveats: ["참고"],
    }));
    expect(SpecAnalysisResponseSchema.safeParse(asResponse(r!)).success).toBe(true);
  });

  it("오염 응답(score>100·문자열·무효 area)도 정규화 후 스키마 적합", () => {
    const r = parseModelOutput(JSON.stringify({
      activities: [
        { area: "autonomous", score: 9999, comment: "ok" },
        { area: "club", score: "high", comment: "ok" },
        { area: "ZZZ", score: 50, comment: "ok" },
      ],
      strengths: [1, 2, 3], caveats: [],
    }));
    expect(SpecAnalysisResponseSchema.safeParse(asResponse(r!)).success).toBe(true);
  });

  it("JSON 아님 / 중괄호 없음 → null", () => {
    expect(parseModelOutput("죄송합니다, 분석할 수 없습니다.")).toBeNull();
    expect(parseModelOutput("")).toBeNull();
  });

  it("코드펜스로 감싼 JSON 도 파싱", () => {
    const r = parseModelOutput("```json\n{\"activities\":[],\"caveats\":[\"c\"]}\n```");
    expect(r).not.toBeNull();
    expect(r!.activities).toHaveLength(SPEC_AREAS.length);
  });
});
