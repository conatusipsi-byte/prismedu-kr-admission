/**
 * /auth/callback 라우트 회귀 — OAuth provider 에러 surface.
 *
 * 배경:
 *   2026-05-28: 카카오 OAuth 가입자가 "인증 링크가 만료됐거나 잘못됐어요" 라는
 *   잘못된 에러 메시지를 받음. Supabase 가 ?error=...&error_description=... 로
 *   돌려보내는데 라우트가 이를 무시하고 missing_code_or_token 으로 폴백했었음.
 *
 *   본 테스트는 provider 측 에러가 그대로 /login?error=... 으로 전달되는지 검증.
 */

import { describe, it, expect, vi } from "vitest";

// getRouteSupabase 모킹 — 본 테스트는 OAuth 에러 분기를 검증하므로
// supabase 클라이언트는 한 번도 호출되면 안 됨. vi.hoisted 로 hoist 안전 유지.
const { mockExchange, mockVerifyOtp } = vi.hoisted(() => ({
  mockExchange: vi.fn(),
  mockVerifyOtp: vi.fn(),
}));
vi.mock("@/lib/supabase-server", () => ({
  getRouteSupabase: vi.fn().mockResolvedValue({
    auth: { exchangeCodeForSession: mockExchange, verifyOtp: mockVerifyOtp },
  }),
}));

import { GET } from "@/app/auth/callback/route";
import { NextRequest } from "next/server";

function makeReq(query: string): NextRequest {
  return new NextRequest(`https://conatusipsi.com/auth/callback${query}`);
}

describe("/auth/callback OAuth 에러 surface", () => {
  it("?error=access_denied → /login?error=access_denied (description 우선)", async () => {
    const req = makeReq(
      "?error=access_denied&error_description=User+denied+access",
    );
    const res = await GET(req);
    expect(res.status).toBeGreaterThanOrEqual(300);
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("/login");
    expect(decodeURIComponent(loc)).toContain("User denied access");
    expect(mockExchange).not.toHaveBeenCalled();
  });

  it("?error=server_error&error_description=Error+getting+user+email+from+external+provider → 그대로 전달", async () => {
    const req = makeReq(
      "?error=server_error&error_description=Error+getting+user+email+from+external+provider",
    );
    const res = await GET(req);
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("/login");
    expect(decodeURIComponent(loc)).toContain(
      "Error getting user email from external provider",
    );
  });

  it("?error=만 있고 description 없으면 error 코드 그대로 전달", async () => {
    const req = makeReq("?error=server_error");
    const res = await GET(req);
    const loc = res.headers.get("location") ?? "";
    expect(decodeURIComponent(loc)).toContain("server_error");
  });

  it("code 도 token_hash 도 error 도 없으면 missing_code_or_token 으로 폴백", async () => {
    const req = makeReq("");
    const res = await GET(req);
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("/login");
    expect(loc).toContain("missing_code_or_token");
  });

  it("error 가 있으면 code 가 함께 있어도 error 우선 (provider 거절 보존)", async () => {
    // 일반적이지 않지만 일부 provider 는 error + code 를 동시에 보낼 수 있음.
    // 사용자가 거절했으면 거절 사유를 보이는 게 정직함.
    const req = makeReq("?error=access_denied&code=irrelevant");
    const res = await GET(req);
    const loc = res.headers.get("location") ?? "";
    expect(decodeURIComponent(loc)).toContain("access_denied");
    expect(mockExchange).not.toHaveBeenCalled();
  });
});
