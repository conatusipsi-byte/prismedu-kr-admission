/**
 * 분석 폼 정책 회귀
 *
 * 회귀 게이트 — 본 테스트가 깨지면 자소서/정직성 정책 위반:
 *   1. 자소서 폐지(24학번~): 분석 폼 어디에도 자소서 입력 필드·키워드 없음
 *   2. P-002: "확정 합격" 표현 차단 (단, 부정 문맥은 허용)
 *
 * 외국 고교 질문은 폼에서 제거됨(국내 일반고 기준). 재외국민 분리는 서버
 * (matching-kr) abroadHighSchool 가드가 담당. 참고용 정직성 안내는 결과
 * 페이지에 노출되며 result-page-policy.test.tsx 가 검증한다.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/analysis",
  useSearchParams: () => new URLSearchParams(),
}));

import { AnalysisFormWizard } from "../AnalysisFormWizard";
import { ExtraActivityStep, EMPTY_EXTRA_ACTIVITY_STEP } from "../ExtraActivityStep";

beforeEach(() => {
  pushMock.mockReset();
});

/* ═══════════════════════════════════════════════════════════════════════
   1. 자소서 영역 부재 (24학번~ 자소서 폐지)
   ═══════════════════════════════════════════════════════════════════════ */

describe("자소서 영역 부재 — 24학번부터 자소서 폐지", () => {
  it("ExtraActivityStep 어디에도 '자소서' 키워드 등장 0회", () => {
    function Wrapper() {
      const [v, setV] = (
        require("react") as typeof import("react")
      ).useState(EMPTY_EXTRA_ACTIVITY_STEP);
      return <ExtraActivityStep value={v} onChange={setV} />;
    }
    const { container } = render(<Wrapper />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/자소서/);
    expect(text).not.toMatch(/자기소개서/);
  });

  it("AnalysisFormWizard 전체에도 자소서 키워드 등장 0회 (모든 Step)", () => {
    const { container } = render(<AnalysisFormWizard />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/자소서/);
    expect(text).not.toMatch(/자기소개서/);
  });

  it("자소서 입력용 textarea 미존재", () => {
    function Wrapper() {
      const [v, setV] = (
        require("react") as typeof import("react")
      ).useState(EMPTY_EXTRA_ACTIVITY_STEP);
      return <ExtraActivityStep value={v} onChange={setV} />;
    }
    const { container } = render(<Wrapper />);
    const textareas = container.querySelectorAll("textarea");
    expect(textareas.length).toBe(0);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   2. P-002 — "확정 합격" 표현 차단 (참고용 안내는 결과 페이지 게이트)
   ═══════════════════════════════════════════════════════════════════════ */

describe("P-002 — '확정 합격' 표현 차단", () => {
  it("'확정 합격' 단어 자체 미사용 (또는 부정 문맥에서만)", () => {
    const { container } = render(<AnalysisFormWizard />);
    const text = container.textContent ?? "";
    // "확정 합격" 키워드가 등장하면 부정 문맥(아닙니다·해석 금지 등) 함께여야 함
    if (/확정 ?합격/.test(text)) {
      expect(text).toMatch(/확정\s*합격.*(아|마|금지|해석)/);
    } else {
      expect(true).toBe(true); // 미등장이면 통과
    }
  });
});
