/**
 * Supabase OAuth callback — `signInWithOAuth({ redirectTo: ".../auth/callback" })`
 * 가 카카오·구글·애플 로그인 후 도달.
 *
 * 흐름:
 *   1. URL 의 `code` 쿼리에서 OAuth code 추출
 *   2. exchangeCodeForSession 으로 세션 쿠키 발급
 *   3. `next` 쿼리(또는 returnUrl)로 redirect, 없으면 /dashboard
 *
 * 에러 시: /login?error=... 로 redirect.
 */

import { NextRequest, NextResponse } from "next/server";
import { getRouteSupabase } from "@/lib/supabase-server";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  // returnUrl / next 양쪽 호환 (Firebase 시기에 LoginView 가 returnUrl 사용)
  const nextPath = url.searchParams.get("next") ?? url.searchParams.get("returnUrl") ?? "/dashboard";

  if (!code) {
    return NextResponse.redirect(new URL(`/login?error=missing_code`, url.origin));
  }

  try {
    const sb = await getRouteSupabase();
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin),
      );
    }
  } catch (e) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent((e as Error).message)}`, url.origin),
    );
  }

  // 안전한 path 만 허용 — open redirect 차단
  const safeNext = nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/dashboard";
  return NextResponse.redirect(new URL(safeNext, url.origin));
}
