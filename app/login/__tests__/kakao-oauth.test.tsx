/**
 * 카카오 OAuth 회귀 — KOE205 수정 + 비즈 앱 전환 scope 확장.
 *
 * 검증:
 *   - 로그인 버튼 노출·클릭 시 signInWithOAuth 호출
 *   - scopes: GoTrue 기본 scope 포함 (account_email, profile_image)
 *   - profile_nickname 포함
 *   - provider/redirectTo 정합성
 *
 * 배경:
 *   GoTrue Kakao provider는 account_email·profile_image를 기본 scope로 강제.
 *   클라이언트 scopes 옵션은 대체가 아닌 추가. 비즈 앱 전환 후 카카오 동의 항목
 *   활성화로 KOE205 해결.
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
        options: {
          scopes: "profile_nickname account_email profile_image",
          redirectTo: `${window.location.origin}/auth/callback`,
        },
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

/*
 * 모듈 로드는 테스트 본문이 아니라 **파일 import 단계**에서 1회만 수행한다.
 *   - 기존엔 각 it() 안에서 `await import(...)` 했는데, 첫 테스트가 모듈 그래프 전체의
 *     콜드 트랜스폼(측정 ~5.9s)을 떠안아 testTimeout 5000ms 를 넘겼다.
 *   - 더 나쁜 건 연쇄 오염: 타임아웃된 test 본문은 중단되지 않고 계속 실행돼
 *     cleanup 이후에 render() 가 뒤늦게 실행 → 다음 테스트에서 "Found multiple elements".
 *   - top-level await 로 옮기면 로드 비용이 testTimeout 대상에서 빠지고 고아 렌더도 사라진다.
 *   - vi.mock 은 트랜스폼 단계에서 이 위로 hoist 되므로 모킹은 그대로 적용된다.
 */
const { LoginView } = await import("../LoginView");

describe("카카오 OAuth 로그인", () => {
  beforeEach(() => {
    mockSignInWithOAuth.mockClear();
  });

  it("카카오 로그인 버튼이 노출된다", async () => {
    render(<LoginView />);
    const btn = screen.getByTestId("login-kakao");
    expect(btn).toBeInTheDocument();
    expect(btn.textContent).toContain("카카오");
  });

  it("클릭 시 signInWithOAuth({ provider: 'kakao' }) 호출", async () => {
    render(<LoginView />);
    fireEvent.click(screen.getByTestId("login-kakao"));

    await waitFor(() => {
      expect(mockSignInWithOAuth).toHaveBeenCalledWith(
        expect.objectContaining({ provider: "kakao" }),
      );
    });
  });

  it("scopes에 profile_nickname 포함", async () => {
    render(<LoginView />);
    fireEvent.click(screen.getByTestId("login-kakao"));

    await waitFor(() => {
      const scopes = mockSignInWithOAuth.mock.calls[0]?.[0]?.options?.scopes ?? "";
      expect(scopes).toContain("profile_nickname");
    });
  });

  it("scopes에 account_email 포함 — GoTrue 기본 + 비즈 앱 동의 항목", async () => {
    render(<LoginView />);
    fireEvent.click(screen.getByTestId("login-kakao"));

    await waitFor(() => {
      const scopes = mockSignInWithOAuth.mock.calls[0]?.[0]?.options?.scopes ?? "";
      expect(scopes).toContain("account_email");
    });
  });

  it("scopes에 profile_image 포함 — GoTrue 기본 scope", async () => {
    render(<LoginView />);
    fireEvent.click(screen.getByTestId("login-kakao"));

    await waitFor(() => {
      const scopes = mockSignInWithOAuth.mock.calls[0]?.[0]?.options?.scopes ?? "";
      expect(scopes).toContain("profile_image");
    });
  });

  it("redirectTo가 /auth/callback 경로를 포함한다", async () => {
    render(<LoginView />);
    fireEvent.click(screen.getByTestId("login-kakao"));

    await waitFor(() => {
      const call = mockSignInWithOAuth.mock.calls[0]?.[0];
      expect(call?.options?.redirectTo).toContain("/auth/callback");
    });
  });

  it("provider가 정확히 'kakao'이다", async () => {
    render(<LoginView />);
    fireEvent.click(screen.getByTestId("login-kakao"));

    await waitFor(() => {
      const call = mockSignInWithOAuth.mock.calls[0]?.[0];
      expect(call?.provider).toBe("kakao");
    });
  });

  it("Google 버튼은 노출되지 않는다 — Supabase provider 미설정이라 게이트 OFF", async () => {
    // 死버튼 재발 방지: 구글 OAuth(external_google_enabled)가 Supabase 에서 켜지고
    // LoginView 의 GOOGLE_OAUTH_ENABLED 가 true 가 되기 전까지, 누르면 실패하는
    // 구글 버튼은 렌더되지 않아야 한다. (회원가입·로그인 불능의 원인이었음)
    render(<LoginView />);
    expect(screen.queryByTestId("login-google")).toBeNull();
  });

  it("회원가입 모드에서도 카카오 버튼이 노출된다", async () => {
    render(<LoginView initialMode="signup" />);
    const btn = screen.getByTestId("login-kakao");
    expect(btn).toBeInTheDocument();
    expect(btn.textContent).toContain("시작하기");
  });
});
