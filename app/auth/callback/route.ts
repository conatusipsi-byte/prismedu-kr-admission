/**
 * Supabase 인증 callback — 두 경로 지원:
 *
 *   A) OAuth (Google/Kakao/Apple) — `signInWithOAuth({ redirectTo: ".../auth/callback" })`
 *      → URL 에 `code` 쿼리. exchangeCodeForSession 으로 세션 발급.
 *
 *   B) 이메일 confirm / magiclink / recovery — Supabase 가 인증 메일 링크에 박는 형태
 *      → URL 에 `token_hash` + `type` 쿼리. verifyOtp 로 세션 발급.
 *
 *      type 값: 'signup' | 'magiclink' | 'recovery' | 'email_change' | 'invite' | 'email'
 *
 * 둘 다 끝나면 `next` 또는 `returnUrl` 쿼리 경로로 redirect (없으면 /dashboard).
 *
 * 에러 시: /login?error=... 로 redirect — humanizeAuthError 가 한국어 친화 변환.
 */

import { NextRequest, NextResponse } from "next/server";
import { getRouteSupabase } from "@/lib/supabase-server";

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

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  // returnUrl / next 양쪽 호환 (Firebase 시기 LoginView 가 returnUrl 사용)
  const nextPath = url.searchParams.get("next") ?? url.searchParams.get("returnUrl") ?? "/dashboard";

  // 안전한 path 만 허용 — open redirect 차단
  const safeNext = nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/dashboard";

  try {
    const sb = await getRouteSupabase();

    if (code) {
      // OAuth 경로 — PKCE flow
      const { error } = await sb.auth.exchangeCodeForSession(code);
      if (error) {
        return NextResponse.redirect(
          new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin),
        );
      }
    } else if (tokenHash && type && VALID_TYPES.has(type as SupabaseEmailOtpType)) {
      // 이메일 confirm / magiclink / recovery 경로
      const { error } = await sb.auth.verifyOtp({
        token_hash: tokenHash,
        type: type as SupabaseEmailOtpType,
      });
      if (error) {
        return NextResponse.redirect(
          new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin),
        );
      }
    } else {
      // code/token_hash 둘 다 없음 — 비정상 진입
      return NextResponse.redirect(
        new URL(`/login?error=missing_code_or_token`, url.origin),
      );
    }
  } catch (e) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent((e as Error).message)}`, url.origin),
    );
  }

  return NextResponse.redirect(new URL(safeNext, url.origin));
}
