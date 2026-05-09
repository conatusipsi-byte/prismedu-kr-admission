/**
 * 분석 폼 정책 회귀
 *
 * 회귀 게이트 — 본 테스트가 깨지면 P-013 또는 자소서 정책 위반:
 *   1. P-013: 외국 고교 = '예' 답변 → /admissions/jaeoegukmin redirect
 *   2. 자소서 폐지(24학번~): 분석 폼 어디에도 자소서 입력 필드·키워드 없음
 *   3. P-002: 정직성 안내(참고용·모집요강 확인) 노출
 *   4. P-002: "확정 합격" 표현 차단 (단, 부정 문맥은 허용)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

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
import { BasicInfoStep, EMPTY_BASIC_INFO } from "../BasicInfoStep";
import { ExtraActivityStep, EMPTY_EXTRA_ACTIVITY_STEP } from "../ExtraActivityStep";

beforeEach(() => {
  pushMock.mockReset();
});

afterEach(() => {
  // jsdom DOM 정리는 RTL이 자동.
});

/* ═══════════════════════════════════════════════════════════════════════
   1. P-013 — 외국 고교 = '예' 시 jaeoegukmin redirect
   ═══════════════════════════════════════════════════════════════════════ */

describe("P-013 — 분석 폼 외국 고교 답변 redirect", () => {
  it("BasicInfoStep에서 '외국 고교 = 예' 선택 → /admissions/jaeoegukmin push", () => {
    function Wrapper() {
      const [v, setV] = (
        require("react") as typeof import("react")
      ).useState(EMPTY_BASIC_INFO);
      return <BasicInfoStep value={v} onChange={setV} />;
    }
    render(<Wrapper />);

    // '예' 라디오 클릭
    const yesRadio = screen.getByLabelText(/예 \(외국 고교 졸업/);
    fireEvent.click(yesRadio);

    expect(pushMock).toHaveBeenCalledWith("/admissions/jaeoegukmin");
  });

  it("'아니요' 선택 시 redirect 미발생", () => {
    function Wrapper() {
      const [v, setV] = (
        require("react") as typeof import("react")
      ).useState(EMPTY_BASIC_INFO);
      return <BasicInfoStep value={v} onChange={setV} />;
    }
    render(<Wrapper />);

    const noRadio = screen.getByLabelText(/아니요 \(한국 고교/);
    fireEvent.click(noRadio);

    expect(pushMock).not.toHaveBeenCalled();
  });

  it("redirect 안내 노티스 노출 (즉시 push 전 사용자 인식)", () => {
    function Wrapper() {
      const [v, setV] = (
        require("react") as typeof import("react")
      ).useState(EMPTY_BASIC_INFO);
      return <BasicInfoStep value={v} onChange={setV} />;
    }
    render(<Wrapper />);

    fireEvent.click(screen.getByLabelText(/예 \(외국 고교/));

    expect(screen.getByTestId("jaeoegukmin-redirect-notice")).toBeInTheDocument();
    expect(screen.getByTestId("jaeoegukmin-redirect-notice").textContent).toMatch(
      /재외국민|외국인|12년/,
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   2. 자소서 영역 부재 (24학번~ 자소서 폐지)
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
   3. P-002 — 정직성 안내 노출 + "확정 합격" 표현 차단
   ═══════════════════════════════════════════════════════════════════════ */

describe("P-002 — 정직성 안내 (참고용 / 모집요강 / 확정 차단)", () => {
  it("AnalysisFormWizard에 '참고용' 또는 '모집요강' 안내 노출", () => {
    const { container } = render(<AnalysisFormWizard />);
    const text = container.textContent ?? "";
    // 두 키워드 중 적어도 하나
    expect(text).toMatch(/참고용|모집요강/);
  });

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
