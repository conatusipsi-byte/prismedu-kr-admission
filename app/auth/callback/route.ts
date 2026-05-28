/**
 * Supabase 인증 callback (Route Handler) — OAuth code 교환·이메일 verifyOtp 처리.
 *
 *   A) OAuth (Google/Kakao/Apple) — `signInWithOAuth({ redirectTo: ".../auth/callback" })`
 *      → URL 에 `code` 쿼리. exchangeCodeForSession 으로 세션 발급.
 *
 *   B) 이메일 confirm / magiclink / recovery — Supabase 가 인증 메일 링크에 박는 형태
 *      → URL 에 `token_hash` + `type` 쿼리. verifyOtp 로 세션 발급.
 *
 *   C) provider 측 거절이 query 로 도착한 경우 — `error`/`error_description` 쿼리.
 *
 *   D) 위 셋 다 없음 — fragment(`#`) 폴백. 서버는 `#` 을 못 보므로
 *      `/auth/callback/fragment` 클라이언트 페이지로 위임. 30x redirect 시
 *      브라우저가 fragment 를 보존(RFC 7231 §7.1.2) → 클라이언트에서 hash 파싱.
 *
 * Route Handler 인 이유: Server Component 는 응답 cookie 쓰기 제한이라
 * exchangeCodeForSession / verifyOtp 가 세션 쿠키를 못 박음(silently 실패).
 * 미들웨어가 세션 부재로 인식해 /login 으로 되돌리는 회귀가 있었음 (2026-05-28).
 */

import { NextResponse, type NextRequest } from "next/server";
import { getRouteSupabase } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type SupabaseEmailOtpType =
  | "signup"
  | "magiclink"
  | "recovery"
  | "email_change"
  | "invite"
  | "email";

const VALID_TYPES: ReadonlySet<SupabaseEmailOtpType> = new Set<SupabaseEmailOtpType>([
  "signup", "magiclink", "recovery", "email_change", "invite", "email",
]);

function safeNextPath(raw: string | null): string {
  if (!raw) return "/dashboard";
  return raw.startsWith("/") && !raw.startsWith("//") ? raw : "/dashboard";
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const oauthError = searchParams.get("error");
  const oauthErrorDesc = searchParams.get("error_description");
  const nextRaw = searchParams.get("next") ?? searchParams.get("returnUrl");
  const safeNext = safeNextPath(nextRaw);

  // (1) provider 측 거절이 query 로 도착.
  if (oauthError) {
    const msg = oauthErrorDesc || oauthError;
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(msg)}`);
  }

  // (2) PKCE OAuth — code 교환.
  if (code) {
    const sb = await getRouteSupabase();
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
    }
    return NextResponse.redirect(`${origin}${safeNext}`);
  }

  // (3) 이메일 confirm / magiclink / recovery.
  if (tokenHash && type && VALID_TYPES.has(type as SupabaseEmailOtpType)) {
    const sb = await getRouteSupabase();
    const { error } = await sb.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as SupabaseEmailOtpType,
    });
    if (error) {
      return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
    }
    return NextResponse.redirect(`${origin}${safeNext}`);
  }

  // (4) query 에 아무것도 없음 → fragment fallback 페이지로 위임.
  const target = new URL(`${origin}/auth/callback/fragment`);
  target.searchParams.set("next", safeNext);
  return NextResponse.redirect(target);
}
