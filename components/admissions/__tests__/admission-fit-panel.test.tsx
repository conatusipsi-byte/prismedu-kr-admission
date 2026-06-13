/**
 * AdmissionFitPanel — 비용 안전 + 정직성 정책 회귀.
 *
 * 최우선 원칙(비용 폭증 방지):
 *   "검색/목록은 AI 호출 0. AI 적합도 분석은 학생이 버튼을 누른 1개 전형만 호출."
 *   → 본 테스트가 강제: AI 호출을 트리거하는 [data-action="analyze-fit"] 버튼은
 *     Pro/Elite 에게만 렌더된다. 비로그인·무료 사용자에겐 절대 노출되지 않는다.
 *     (= 무료/비로그인 경로에서는 호출 자체가 불가능 → 방준현 비용 0)
 *
 * 정직성(P-002):
 *   - 패널은 항상 "합격 확률이 아니라 전형 요구 대비 적합도" 고지를 노출한다.
 *
 * 미래에 누가 게이트를 풀어 무료/비로그인에게 분석 버튼을 노출하면 (1)·(2) 가 실패한다.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { AdmissionFitPanel, type FitTrackOption } from "../AdmissionFitPanel";

// per-test 가변 auth 상태 (vi.hoisted — TDZ 안전)
const h = vi.hoisted(() => ({
  state: { user: null as unknown, profile: null as { plan?: string } | null, loading: false },
}));

vi.mock("@/lib/auth-context", () => ({ useAuth: () => h.state }));
// api-client 가 supabase 클라이언트를 끌어오지 않도록 차단 (렌더만 검증, 클릭 없음)
vi.mock("@/lib/api-client", () => ({
  fetchWithAuth: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

const TRACKS: FitTrackOption[] = [
  { kind: "susi_subject", name: "학생부교과(지역균형)" },
  { kind: "susi_comprehensive", name: "학생부종합" },
];

function renderPanel(tracks: FitTrackOption[] = TRACKS) {
  return render(
    <AdmissionFitPanel universityId="snu" departmentId="cs" tracks={tracks} />,
  );
}

describe("AdmissionFitPanel (비용 안전 + 정직성)", () => {
  beforeEach(() => {
    h.state = { user: null, profile: null, loading: false };
  });

  it("(1) 비로그인 — AI 트리거 버튼 미노출 + 로그인 CTA", () => {
    h.state = { user: null, profile: null, loading: false };
    const { container } = renderPanel();
    expect(container.querySelector('[data-action="analyze-fit"]')).toBeNull();
    expect(container.querySelector('a[href^="/login"]')).not.toBeNull();
  });

  it("(2) 무료 플랜 — AI 트리거 버튼 미노출 + Pro 업셀(/pricing)", () => {
    h.state = { user: { id: "u1" }, profile: { plan: "free" }, loading: false };
    const { container } = renderPanel();
    expect(container.querySelector('[data-action="analyze-fit"]')).toBeNull();
    expect(container.querySelector('a[href="/pricing"]')).not.toBeNull();
  });

  it("(3) Pro 플랜 — AI 트리거 버튼 + 전형 선택 칩 노출", () => {
    h.state = { user: { id: "u1" }, profile: { plan: "pro" }, loading: false };
    const { container } = renderPanel();
    expect(container.querySelector('[data-action="analyze-fit"]')).not.toBeNull();
    // 전형 dedupe — kind 2개 → 칩 2개
    expect(container.querySelectorAll("[data-track-kind]").length).toBe(2);
  });

  it("(3b) Elite 플랜도 분석 버튼 노출", () => {
    h.state = { user: { id: "u1" }, profile: { plan: "elite" }, loading: false };
    const { container } = renderPanel();
    expect(container.querySelector('[data-action="analyze-fit"]')).not.toBeNull();
  });

  it("(4) 정직성 — '확률 아님 / 전형 요구 대비 적합도' 고지 항상 노출", () => {
    h.state = { user: { id: "u1" }, profile: { plan: "pro" }, loading: false };
    const { container } = renderPanel();
    const txt = container.textContent ?? "";
    expect(txt).toContain("전형 요구 대비 적합도");
    expect(txt).toContain("1개 전형");
  });

  it("(5) 전형 0개 — 안내 문구, 버튼 없음", () => {
    h.state = { user: { id: "u1" }, profile: { plan: "pro" }, loading: false };
    const { container, getByText } = renderPanel([]);
    expect(getByText("분석할 전형 정보가 없습니다.")).toBeInTheDocument();
    expect(container.querySelector('[data-action="analyze-fit"]')).toBeNull();
  });

  it("(6) 동일 kind 중복 전형 — dedupe 되어 칩 1개", () => {
    h.state = { user: { id: "u1" }, profile: { plan: "pro" }, loading: false };
    const { container } = renderPanel([
      { kind: "susi_subject", name: "교과A" },
      { kind: "susi_subject", name: "교과B" },
    ]);
    expect(container.querySelectorAll("[data-track-kind]").length).toBe(1);
  });
});
