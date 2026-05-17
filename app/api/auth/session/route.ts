/**
 * 세션 정보 — Supabase Auth 기반.
 *
 * GET — 클라이언트 부팅·로그인 직후 호출:
 *   1. Supabase 세션 검증 (cookie 또는 Authorization Bearer)
 *   2. master 여부 단일 판정 (admins 테이블 lookup)
 *   3. `{ isMaster }` 반환
 *
 * Supabase 가 쿠키를 자동 관리하므로 Firebase 처럼 manual 쿠키 발급 불필요.
 *
 * DELETE — 로그아웃은 클라이언트가 supabase.auth.signOut() 으로 처리.
 *   본 엔드포인트는 호환을 위해 200 만 반환.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireMasterAuth } from "@/lib/api-auth";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireMasterAuth(req);

  // 미인증 — 그대로 401 반환
  if (!auth.ok) {
    if (auth.reason === "not_master") {
      // 인증은 됐으나 master 아님 — 정상 사용자
      return NextResponse.json({ isMaster: false });
    }
    return auth.response;
  }

  return NextResponse.json({ isMaster: auth.isMaster ?? false });
}

export async function DELETE(): Promise<NextResponse> {
  // Supabase 클라이언트가 signOut 직접 호출. 본 엔드포인트는 호환만.
  return NextResponse.json({ ok: true });
}
