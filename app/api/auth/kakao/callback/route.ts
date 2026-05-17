/**
 * [DEPRECATED] 카카오 OAuth 콜백 — Firebase Custom Token 흐름.
 *
 * Supabase Auth 마이그레이션으로 카카오 OAuth 는 Supabase 가 직접 처리.
 * 새 흐름: 클라이언트 → supabase.auth.signInWithOAuth({ provider: "kakao" })
 *        → Supabase 가 카카오로 리다이렉트 → 콜백은 /auth/callback 으로 통일.
 *
 * 본 라우트는 검색엔진·외부 링크 호환을 위해 유지하되 /auth/callback 로 forward.
 */

import { NextRequest, NextResponse } from "next/server";

export function GET(req: NextRequest): NextResponse {
  const url = new URL(req.url);
  const target = new URL("/auth/callback", url.origin);
  url.searchParams.forEach((v, k) => target.searchParams.set(k, v));
  return NextResponse.redirect(target);
}
