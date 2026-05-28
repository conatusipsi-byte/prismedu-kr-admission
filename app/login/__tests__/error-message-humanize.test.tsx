/**
 * LoginView 에러 메시지 한국어 변환 회귀.
 *
 * 배경:
 *   2026-05-28 카카오 OAuth 실패 시 "인증 링크가 만료됐거나 잘못됐어요" 라는
 *   엉뚱한 메시지가 노출되던 사건이 있었음. /auth/callback 라우트 수정으로
 *   provider 에러가 그대로 ?error= 로 전달되면서 humanizeAuthError 가 OAuth
 *   에러 패턴을 인식해야 함. 본 테스트는 URL ?error=... 가 의도한 한국어로
 *   변환되는지 검증.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

let currentSearch = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => currentSearch,
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: null,
    profile: null,
    loading: false,
    isMaster: false,
    loginWithKakao: vi.fn(),
    loginWithGoogle: vi.fn(),
    loginWithEmail: vi.fn(),
    signUpWithEmail: vi.fn(),
    resetPassword: vi.fn(),
    loginWithApple: vi.fn(),
    logout: vi.fn(),
    saveProfile: vi.fn(),
    snapshots: [],
    toggleFavorite: vi.fn(),
    isFavorite: () => false,
  }),
}));

vi.mock("@/lib/api-client", () => ({
  fetchWithAuth: vi.fn().mockResolvedValue({}),
}));

async function renderWithError(errorParam: string): Promise<string> {
  currentSearch = new URLSearchParams({ error: errorParam });
  const { LoginView } = await import("../LoginView");
  render(<LoginView />);
  await waitFor(() => {
    expect(screen.getByTestId("login-error")).toBeInTheDocument();
  });
  return screen.getByTestId("login-error").textContent ?? "";
}

describe("URL ?error= 한국어 변환", () => {
  beforeEach(() => {
    currentSearch = new URLSearchParams();
  });

  it("카카오/OAuth 가 이메일 미반환 → '이메일을 가져오지 못했어요' 안내", async () => {
    const text = await renderWithError(
      "Error getting user email from external provider",
    );
    expect(text).toContain("이메일을 가져오지 못했어요");
  });

  it("access_denied (사용자 동의 취소) → 친화 안내", async () => {
    const text = await renderWithError("access_denied");
    expect(text).toContain("동의를 취소");
  });

  it("server_error → 일시적 오류 안내", async () => {
    const text = await renderWithError("server_error");
    expect(text).toContain("일시적");
  });

  it("missing_code_or_token → 인증 링크 만료 안내 (이메일 confirm 경로 보존)", async () => {
    const text = await renderWithError("missing_code_or_token");
    expect(text).toContain("인증 링크");
  });
});
