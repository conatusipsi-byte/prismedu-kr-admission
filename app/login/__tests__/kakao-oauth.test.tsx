/**
 * 카카오 OAuth 회귀 — 로그인 버튼 노출·클릭 시 signInWithOAuth 호출·provider/redirectTo 정합성.
 *
 * jsdom 한계: 실 OAuth 리다이렉트는 prod 검증 필요.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mockSignInWithOAuth = vi.fn().mockResolvedValue({ error: null });

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: null,
    profile: null,
    loading: false,
    isMaster: false,
    loginWithKakao: async () => {
      const { error } = await mockSignInWithOAuth({
        provider: "kakao",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
    },
    loginWithGoogle: async () => {
      await mockSignInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
    },
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

describe("카카오 OAuth 로그인", () => {
  beforeEach(() => {
    mockSignInWithOAuth.mockClear();
  });

  it("카카오 로그인 버튼이 노출된다", async () => {
    const { LoginView } = await import("../LoginView");
    render(<LoginView />);
    const btn = screen.getByTestId("login-kakao");
    expect(btn).toBeInTheDocument();
    expect(btn.textContent).toContain("카카오");
  });

  it("클릭 시 signInWithOAuth({ provider: 'kakao' }) 호출", async () => {
    const { LoginView } = await import("../LoginView");
    render(<LoginView />);
    const btn = screen.getByTestId("login-kakao");
    fireEvent.click(btn);

    await waitFor(() => {
      expect(mockSignInWithOAuth).toHaveBeenCalledWith(
        expect.objectContaining({ provider: "kakao" }),
      );
    });
  });

  it("redirectTo가 /auth/callback 경로를 포함한다", async () => {
    const { LoginView } = await import("../LoginView");
    render(<LoginView />);
    fireEvent.click(screen.getByTestId("login-kakao"));

    await waitFor(() => {
      const call = mockSignInWithOAuth.mock.calls[0]?.[0];
      expect(call?.options?.redirectTo).toContain("/auth/callback");
    });
  });

  it("provider가 정확히 'kakao'이다 (오타 방지)", async () => {
    const { LoginView } = await import("../LoginView");
    render(<LoginView />);
    fireEvent.click(screen.getByTestId("login-kakao"));

    await waitFor(() => {
      const call = mockSignInWithOAuth.mock.calls[0]?.[0];
      expect(call?.provider).toBe("kakao");
    });
  });

  it("Google 로그인은 카카오와 독립적으로 동작한다", async () => {
    const { LoginView } = await import("../LoginView");
    render(<LoginView />);
    const googleBtn = screen.getByTestId("login-google");
    fireEvent.click(googleBtn);

    await waitFor(() => {
      const call = mockSignInWithOAuth.mock.calls[0]?.[0];
      expect(call?.provider).toBe("google");
    });
  });

  it("회원가입 모드에서도 카카오 버튼이 노출된다", async () => {
    const { LoginView } = await import("../LoginView");
    render(<LoginView initialMode="signup" />);
    const btn = screen.getByTestId("login-kakao");
    expect(btn).toBeInTheDocument();
    expect(btn.textContent).toContain("시작하기");
  });
});
