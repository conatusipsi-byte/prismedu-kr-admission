/**
 * 세션 부트스트랩 라우트
 *
 * GET — 클라이언트 부팅 시 한 번 호출:
 *   1. Authorization Bearer (Firebase ID 토큰) 검증
 *   2. master 여부 단일 판정
 *   3. Firebase **session cookie** 발급 (HttpOnly + SameSite=Lax + 5일)
 *      → middleware (Edge)와 server component (`/admin/layout.tsx`)가 인증 신호로 사용.
 *
 * DELETE — 로그아웃 시 호출:
 *   세션 쿠키를 즉시 만료시켜 middleware redirect가 다시 동작하도록.
 *
 * 응답 본문은 기존과 동일 — `{ isMaster }`. 클라이언트는 이미 fetchWithAuth
 * 로 `Authorization: Bearer <ID 토큰>` 을 보내고 있어 변경 불필요.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase-admin";
import { requireMasterAuth, SESSION_COOKIE_NAME } from "@/lib/api-auth";

// 5 days — Firebase Auth가 허용하는 최대 14일 중 보수적 선택. 클라가 자주
// 재로그인하지 않아도 되면서, 토큰 탈취 시 노출 창은 짧게.
const SESSION_COOKIE_TTL_MS = 5 * 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  const auth = await requireMasterAuth(req);

  // 미인증 (헤더 없음 / 검증 실패) — 401 그대로 반환. 쿠키 미발급.
  if (!auth.ok) {
    if (auth.reason === "not_master") {
      // 인증은 됐으나 master 아님 — 정상 사용자. 쿠키는 발급해 SSR/middleware도 동작.
      return await respondWithCookie(req, false);
    }
    return auth.response;
  }

  return await respondWithCookie(req, auth.isMaster ?? false);
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    path: "/",
    maxAge: 0,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}

async function respondWithCookie(
  req: NextRequest,
  isMaster: boolean,
): Promise<NextResponse> {
  const idToken = extractIdToken(req);
  const res = NextResponse.json({ isMaster });

  if (!idToken) return res;

  try {
    const sessionCookie = await getAdminAuth().createSessionCookie(idToken, {
      expiresIn: SESSION_COOKIE_TTL_MS,
    });
    res.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: sessionCookie,
      path: "/",
      maxAge: Math.floor(SESSION_COOKIE_TTL_MS / 1000),
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  } catch {
    // 쿠키 발급 실패해도 응답 본문(`isMaster`)은 정상 제공 — UX 회귀 방지.
    // 다음 호출에서 재시도.
  }
  return res;
}

function extractIdToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice("Bearer ".length).trim();
  return null;
}
