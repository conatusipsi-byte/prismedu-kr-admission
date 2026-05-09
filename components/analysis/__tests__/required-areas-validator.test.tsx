/**
 * RequiredAreasValidator — B1 응시영역 자격 검증 회귀
 *
 * 자연계 보수 기준:
 *   - 수학: 미적분 또는 기하 응시 필수
 *   - 탐구: 과학탐구 2과목 응시 필수
 *
 * 두 조건 모두 충족해야 naturalEligible=true. 인문계 응시영역(확률과통계 + 사탐)
 * 으로는 의예·서울권 자연 정시 자격 미충족 표시.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  RequiredAreasValidator,
  evaluateRequiredAreas,
} from "../RequiredAreasValidator";
import { EMPTY_CSAT } from "../ScoreInputStep";
import type { CsatScoreInputValue } from "../CsatScoreInput";

function csat(overrides: Partial<CsatScoreInputValue> = {}): CsatScoreInputValue {
  return {
    ...EMPTY_CSAT,
    ...overrides,
    korean: { ...EMPTY_CSAT.korean, ...(overrides.korean ?? {}) },
    math: { ...EMPTY_CSAT.math, ...(overrides.math ?? {}) },
    english: { ...EMPTY_CSAT.english, ...(overrides.english ?? {}) },
    history: { ...EMPTY_CSAT.history, ...(overrides.history ?? {}) },
    investigation: overrides.investigation ?? EMPTY_CSAT.investigation,
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   evaluateRequiredAreas — 보수 기준 산출
   ═══════════════════════════════════════════════════════════════════════ */

describe("evaluateRequiredAreas — 자연계 보수 기준", () => {
  it("미적분 + 과탐 2과목 → naturalEligible=true", () => {
    const r = evaluateRequiredAreas(
      csat({
        math: { course: "calculus", standard: 130, percentile: 95, grade: 2 },
        investigation: [
          { course: "물리학I", type: "science", standard: 65, percentile: 90, grade: 2 },
          { course: "화학I",   type: "science", standard: 67, percentile: 92, grade: 2 },
        ],
      }),
    );
    expect(r.naturalMathOk).toBe(true);
    expect(r.naturalSciOk).toBe(true);
    expect(r.naturalEligible).toBe(true);
  });

  it("기하 + 과탐 2과목 → naturalEligible=true (기하도 인정)", () => {
    const r = evaluateRequiredAreas(
      csat({
        math: { course: "geometry", standard: 128, percentile: 93, grade: 2 },
        investigation: [
          { course: "물리학II", type: "science", standard: 70, percentile: 95, grade: 1 },
          { course: "화학II",   type: "science", standard: 68, percentile: 93, grade: 2 },
        ],
      }),
    );
    expect(r.naturalEligible).toBe(true);
  });

  it("확률과통계 → naturalMathOk=false (자연계 자격 미달)", () => {
    const r = evaluateRequiredAreas(
      csat({
        math: { course: "probability_statistics", standard: 130, percentile: 95, grade: 2 },
        investigation: [
          { course: "물리학I", type: "science", standard: 65, percentile: 90, grade: 2 },
          { course: "화학I",   type: "science", standard: 67, percentile: 92, grade: 2 },
        ],
      }),
    );
    expect(r.naturalMathOk).toBe(false);
    expect(r.naturalEligible).toBe(false);
  });

  it("사탐 2과목 → naturalSciOk=false", () => {
    const r = evaluateRequiredAreas(
      csat({
        math: { course: "calculus", standard: 130, percentile: 95, grade: 2 },
        investigation: [
          { course: "생활과윤리", type: "social", standard: 67, percentile: 92, grade: 2 },
          { course: "사회문화",   type: "social", standard: 68, percentile: 93, grade: 2 },
        ],
      }),
    );
    expect(r.naturalSciOk).toBe(false);
    expect(r.naturalEligible).toBe(false);
  });

  it("과탐 1과목만 → naturalSciOk=false", () => {
    const r = evaluateRequiredAreas(
      csat({
        math: { course: "calculus", standard: 130, percentile: 95, grade: 2 },
        investigation: [
          { course: "물리학I", type: "science", standard: 65, percentile: 90, grade: 2 },
        ],
      }),
    );
    expect(r.naturalSciOk).toBe(false);
    expect(r.naturalEligible).toBe(false);
  });

  it("탐구 grade 입력 안 된 항목은 카운트 안 함", () => {
    const r = evaluateRequiredAreas(
      csat({
        math: { course: "calculus", standard: 130, percentile: 95, grade: 2 },
        investigation: [
          { course: "물리학I", type: "science", standard: 65, percentile: 90, grade: 2 },
          // grade null — 미입력 슬롯
          { course: "", type: "science", standard: null, percentile: null, grade: null },
        ],
      }),
    );
    expect(r.naturalSciOk).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   UI — 자격 미달 시 amber + AlertTriangle, 충족 시 zinc + CheckCircle
   ═══════════════════════════════════════════════════════════════════════ */

describe("RequiredAreasValidator — UI 시각 분기", () => {
  it("자연계 + 자격 미달 → data-natural-eligible='false' + amber 클래스", () => {
    const { container } = render(
      <RequiredAreasValidator
        csat={csat({
          math: { course: "probability_statistics", standard: 130, percentile: 95, grade: 2 },
          investigation: [
            { course: "생활과윤리", type: "social", standard: 67, percentile: 92, grade: 2 },
            { course: "사회문화",   type: "social", standard: 68, percentile: 93, grade: 2 },
          ],
        })}
        track="natural"
      />,
    );
    const root = container.querySelector('[data-component="required-areas-validator"]') as HTMLElement;
    expect(root.getAttribute("data-natural-eligible")).toBe("false");
    expect(/amber-/.test(root.className)).toBe(true);
  });

  it("자연계 + 자격 충족 → data-natural-eligible='true', amber 미사용", () => {
    const { container } = render(
      <RequiredAreasValidator
        csat={csat({
          math: { course: "calculus", standard: 130, percentile: 95, grade: 2 },
          investigation: [
            { course: "물리학I", type: "science", standard: 65, percentile: 90, grade: 2 },
            { course: "화학I",   type: "science", standard: 67, percentile: 92, grade: 2 },
          ],
        })}
        track="natural"
      />,
    );
    const root = container.querySelector('[data-component="required-areas-validator"]') as HTMLElement;
    expect(root.getAttribute("data-natural-eligible")).toBe("true");
    expect(/amber-/.test(root.className)).toBe(false);
  });

  it("자격 미달 메시지 노출 (사용자 인식)", () => {
    render(
      <RequiredAreasValidator
        csat={csat({
          math: { course: "probability_statistics", standard: 130, percentile: 95, grade: 2 },
        })}
        track="natural"
      />,
    );
    expect(screen.getByText(/일부 자연계 트랙 자격 미달 가능성/)).toBeInTheDocument();
  });

  it("정직성 안내 (학과별·전형별 다름) 노출 — 보수 기준 가이드 명시", () => {
    const { container } = render(
      <RequiredAreasValidator csat={csat()} track="natural" />,
    );
    const text = container.textContent ?? "";
    expect(text).toMatch(/학과.*전형.*다릅|보수 기준|결과 페이지/);
  });
});
