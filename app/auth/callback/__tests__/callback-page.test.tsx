/**
 * /auth/callback 서버 페이지 분기 회귀.
 *
 *   query 기반 4가지 경로:
 *     - ?error → /login?error=...
 *     - ?code → exchangeCodeForSession → next or /login?error
 *     - ?token_hash + ?type → verifyOtp → next or /login?error
 *     - query 비어있음 → CallbackFragmentHandler 렌더 (즉시 redirect 안 함)
 *
 * 배경:
 *   Supabase 가 카카오 OAuth 거절 시 fragment(`#`) 에 진짜 에러를 박아 보내고
 *   query 는 비어있음. 이전엔 missing_code_or_token 으로 즉시 폴백되어
 *   사용자에게 "인증 링크가 만료됐거나 잘못됐어요" 가 표시됐었음.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { mockExchange, mockVerifyOtp, mockRedirect } = vi.hoisted(() => ({
  mockExchange: vi.fn(),
  mockVerifyOtp: vi.fn(),
  mockRedirect: vi.fn((url: string) => {
    throw new Error(`__REDIRECT__${url}`);
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/lib/supabase-server", () => ({
  getRouteSupabase: vi.fn().mockResolvedValue({
    auth: {
      exchangeCodeForSession: mockExchange,
      verifyOtp: mockVerifyOtp,
    },
  }),
}));

vi.mock("../CallbackFragmentHandler", () => ({
  CallbackFragmentHandler: ({ nextPath }: { nextPath: string }) => (
    <div data-testid="fragment-fallback" data-next={nextPath}>
      fragment fallback
    </div>
  ),
}));

import AuthCallbackPage from "../page";

async function callAndCaptureRedirect(query: Record<string, string>): Promise<string | null> {
  try {
    await AuthCallbackPage({ searchParams: Promise.resolve(query) });
    return null;
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.startsWith("__REDIRECT__")) return msg.replace("__REDIRECT__", "");
    throw e;
  }
}

describe("AuthCallbackPage server logic", () => {
  beforeEach(() => {
    mockExchange.mockReset();
    mockVerifyOtp.mockReset();
    mockRedirect.mockClear();
  });

  it("?error=access_denied&error_description=... → /login?error=<desc>", async () => {
    const target = await callAndCaptureRedirect({
      error: "access_denied",
      error_description: "User denied access",
    });
    expect(target).toBe(`/login?error=${encodeURIComponent("User denied access")}`);
    expect(mockExchange).not.toHaveBeenCalled();
  });

  it("?code=abc 성공 → /dashboard", async () => {
    mockExchange.mockResolvedValueOnce({ error: null });
    const target = await callAndCaptureRedirect({ code: "abc" });
    expect(target).toBe("/dashboard");
    expect(mockExchange).toHaveBeenCalledWith("abc");
  });

  it("?code=abc + ?next=/profile → /profile", async () => {
    mockExchange.mockResolvedValueOnce({ error: null });
    const target = await callAndCaptureRedirect({ code: "abc", next: "/profile" });
    expect(target).toBe("/profile");
  });

  it("?code 실패 → /login?error=<msg>", async () => {
    mockExchange.mockResolvedValueOnce({ error: { message: "PKCE missing" } });
    const target = await callAndCaptureRedirect({ code: "abc" });
    expect(target).toBe(`/login?error=${encodeURIComponent("PKCE missing")}`);
  });

  it("?token_hash + ?type=signup 성공 → /dashboard", async () => {
    mockVerifyOtp.mockResolvedValueOnce({ error: null });
    const target = await callAndCaptureRedirect({ token_hash: "h", type: "signup" });
    expect(target).toBe("/dashboard");
    expect(mockVerifyOtp).toHaveBeenCalledWith({ token_hash: "h", type: "signup" });
  });

  it("?next=//evil.com (open redirect) → /dashboard 폴백", async () => {
    mockExchange.mockResolvedValueOnce({ error: null });
    const target = await callAndCaptureRedirect({ code: "abc", next: "//evil.com" });
    expect(target).toBe("/dashboard");
  });

  it("query 비어있음 → CallbackFragmentHandler 렌더 (즉시 redirect 안 함)", async () => {
    const ui = await AuthCallbackPage({ searchParams: Promise.resolve({}) });
    render(ui as React.ReactElement);
    expect(screen.getByTestId("fragment-fallback")).toBeInTheDocument();
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
