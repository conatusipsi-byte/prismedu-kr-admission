/**
 * /auth/callback Route Handler 회귀.
 *
 *   query 기반 4가지 경로:
 *     - ?error → /login?error=...
 *     - ?code → exchangeCodeForSession → next or /login?error
 *     - ?token_hash + ?type → verifyOtp → next or /login?error
 *     - query 비어있음 → /auth/callback/fragment?next=... redirect
 *
 * Route Handler 인 이유: Server Component 는 응답 cookie 쓰기 제한 → 세션 미수립
 * 회귀 (2026-05-28, 카카오 로그인 후 /login 으로 되돌아가는 사고).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockExchange, mockVerifyOtp } = vi.hoisted(() => ({
  mockExchange: vi.fn(),
  mockVerifyOtp: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({
  getRouteSupabase: vi.fn().mockResolvedValue({
    auth: {
      exchangeCodeForSession: mockExchange,
      verifyOtp: mockVerifyOtp,
    },
  }),
}));

import { GET } from "../route";

const ORIGIN = "https://example.test";

function reqWith(query: Record<string, string>): NextRequest {
  const url = new URL(`${ORIGIN}/auth/callback`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

async function locationOf(query: Record<string, string>): Promise<string> {
  const res = await GET(reqWith(query));
  expect(res.status).toBeGreaterThanOrEqual(300);
  expect(res.status).toBeLessThan(400);
  const loc = res.headers.get("location");
  if (!loc) throw new Error("no Location header");
  // 절대 URL 도 상대 경로로 통일 (origin 일치 검증은 별도)
  return loc.startsWith(ORIGIN) ? loc.slice(ORIGIN.length) : loc;
}

describe("GET /auth/callback (Route Handler)", () => {
  beforeEach(() => {
    mockExchange.mockReset();
    mockVerifyOtp.mockReset();
  });

  it("?error=access_denied&error_description=... → /login?error=<desc>", async () => {
    const loc = await locationOf({
      error: "access_denied",
      error_description: "User denied access",
    });
    expect(loc).toBe(`/login?error=${encodeURIComponent("User denied access")}`);
    expect(mockExchange).not.toHaveBeenCalled();
  });

  it("?code=abc 성공 → /dashboard", async () => {
    mockExchange.mockResolvedValueOnce({ error: null });
    const loc = await locationOf({ code: "abc" });
    expect(loc).toBe("/dashboard");
    expect(mockExchange).toHaveBeenCalledWith("abc");
  });

  it("?code=abc + ?next=/profile → /profile", async () => {
    mockExchange.mockResolvedValueOnce({ error: null });
    const loc = await locationOf({ code: "abc", next: "/profile" });
    expect(loc).toBe("/profile");
  });

  it("?code 실패 → /login?error=<msg>", async () => {
    mockExchange.mockResolvedValueOnce({ error: { message: "PKCE missing" } });
    const loc = await locationOf({ code: "abc" });
    expect(loc).toBe(`/login?error=${encodeURIComponent("PKCE missing")}`);
  });

  it("?token_hash + ?type=signup 성공 → /dashboard", async () => {
    mockVerifyOtp.mockResolvedValueOnce({ error: null });
    const loc = await locationOf({ token_hash: "h", type: "signup" });
    expect(loc).toBe("/dashboard");
    expect(mockVerifyOtp).toHaveBeenCalledWith({ token_hash: "h", type: "signup" });
  });

  it("?next=//evil.com (open redirect) → /dashboard 폴백", async () => {
    mockExchange.mockResolvedValueOnce({ error: null });
    const loc = await locationOf({ code: "abc", next: "//evil.com" });
    expect(loc).toBe("/dashboard");
  });

  it("query 비어있음 → /auth/callback/fragment?next=/dashboard", async () => {
    const loc = await locationOf({});
    expect(loc).toBe("/auth/callback/fragment?next=%2Fdashboard");
    expect(mockExchange).not.toHaveBeenCalled();
    expect(mockVerifyOtp).not.toHaveBeenCalled();
  });

  it("query 비어있음 + ?next=/profile → fragment?next=/profile 보존", async () => {
    const loc = await locationOf({ next: "/profile" });
    expect(loc).toBe("/auth/callback/fragment?next=%2Fprofile");
  });
});
