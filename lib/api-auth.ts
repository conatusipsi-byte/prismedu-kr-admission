/**
 * API 라우트 인증 가드 — discriminated union 패턴
 *
 * 사용:
 *   const auth = await requireAuth(req);
 *   if (!auth.ok) return auth.response;
 *   // auth.uid, auth.email 사용 가능
 *
 * prismedu.kr 의 `instanceof NextResponse` 패턴과 다름. 신규 프로젝트는
 * 본 패턴으로 통일 (docs/dependencies.md §4.2).
 *
 * 의존:
 *   - firebase-admin/auth (서버 토큰 검증)
 *   - lib/firebase-admin (getAdminDb — admins 컬렉션 lookup)
 */

import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAdminAuth, getAdminDb } from "./firebase-admin";

/**
 * Firebase 세션 쿠키 이름. Firebase Hosting의 `__session` 컨벤션을 차용해
 * Cloud Run/Vercel에서도 동일 이름을 사용. middleware는 이 쿠키 존재만 보고
 * 빠른 redirect를 수행하며, 실제 검증은 본 모듈의 verifySessionCookie 호출이 담당.
 */
export const SESSION_COOKIE_NAME = "__session";

/* ═══════════════════════════════════════════════════════════════════════
   타입
   ═══════════════════════════════════════════════════════════════════════ */

export interface AuthSuccess {
  ok: true;
  uid: string;
  email?: string;
  /** isMaster 가드 통과 시에만 true */
  isMaster?: boolean;
}

export interface AuthFailure {
  ok: false;
  /** 라우트가 그대로 return 할 NextResponse */
  response: NextResponse;
  /** 로그·메트릭용 — 실패 사유 분류 */
  reason: AuthFailureReason;
}

export type AuthResult = AuthSuccess | AuthFailure;

export type AuthFailureReason =
  | "missing_token"
  | "invalid_token"
  | "expired_token"
  | "not_master"
  | "internal_error";

/* ═══════════════════════════════════════════════════════════════════════
   토큰 추출
   ═══════════════════════════════════════════════════════════════════════ */

function extractBearerToken(req: NextRequest): string | null {
  // 1. Authorization 헤더 — fetchWithAuth 클라가 매 요청 첨부 (Firebase ID 토큰).
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    return auth.slice("Bearer ".length).trim();
  }
  return null;
}

/**
 * 본 라우트가 받은 요청의 세션 쿠키 (Firebase session cookie). API 라우트에선
 * Authorization 헤더가 없을 때의 fallback로만 사용 — 정식 흐름은 헤더.
 */
function extractSessionCookieFromRequest(req: NextRequest): string | null {
  return req.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
}

/* ═══════════════════════════════════════════════════════════════════════
   requireAuth — 일반 사용자
   ═══════════════════════════════════════════════════════════════════════ */

export async function requireAuth(req: NextRequest): Promise<AuthResult> {
  const bearer = extractBearerToken(req);
  const cookie = extractSessionCookieFromRequest(req);
  return verifyTokenOrCookie(bearer, cookie);
}

/**
 * 토큰/쿠키 → uid 검증 공통 코어. API 라우트(헤더 우선)와 server component(쿠키만)에서
 * 모두 재사용. Firebase ID 토큰은 1시간 만료라 쿠키만 받는 server component 흐름은
 * `verifySessionCookie` 가 더 안전 — 두 검증을 차례로 시도.
 */
async function verifyTokenOrCookie(
  bearerToken: string | null,
  sessionCookie: string | null,
): Promise<AuthResult> {
  if (!bearerToken && !sessionCookie) {
    return {
      ok: false,
      reason: "missing_token",
      response: NextResponse.json(
        { error: "로그인이 필요합니다" },
        { status: 401 },
      ),
    };
  }

  // 1) Bearer (ID 토큰) 우선 — API 라우트의 표준 흐름.
  if (bearerToken) {
    try {
      const decoded = await getAdminAuth().verifyIdToken(bearerToken, true);
      return { ok: true, uid: decoded.uid, email: decoded.email };
    } catch (e: unknown) {
      // 헤더는 있지만 검증 실패. 쿠키도 있다면 그걸로 fallback.
      if (!sessionCookie) return mapVerifyError(e);
    }
  }

  // 2) 세션 쿠키 — server component / SSR 흐름.
  if (sessionCookie) {
    try {
      const decoded = await getAdminAuth().verifySessionCookie(sessionCookie, true);
      return { ok: true, uid: decoded.uid, email: decoded.email };
    } catch (e: unknown) {
      return mapVerifyError(e);
    }
  }

  return mapVerifyError(new Error("auth/unknown"));
}

function mapVerifyError(e: unknown): AuthFailure {
  const code = (e as { code?: string })?.code ?? "";
  const reason: AuthFailureReason =
    code === "auth/id-token-expired" || code === "auth/session-cookie-expired" ? "expired_token" :
    code === "auth/argument-error" || code === "auth/invalid-id-token" || code === "auth/session-cookie-revoked" ? "invalid_token" :
    "internal_error";

  return {
    ok: false,
    reason,
    response: NextResponse.json(
      {
        error:
          reason === "expired_token" ? "세션이 만료되었습니다" :
          reason === "invalid_token" ? "유효하지 않은 인증" :
          "인증 처리 중 오류",
      },
      { status: 401 },
    ),
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   requireMasterAuth — 운영자 (admins 도큐먼트 active=true)
   ═══════════════════════════════════════════════════════════════════════ */

export async function requireMasterAuth(req: NextRequest): Promise<AuthResult> {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth;
  return assertMaster(auth);
}

/**
 * Server Component 진입점. `app/admin/layout.tsx`처럼 NextRequest를 받지 못하는
 * 컨텍스트에서 쿠키만 사용해 master 권한을 검증.
 *
 * 호출 컨벤션:
 *   const auth = await requireMasterAuthFromHeaders();
 *   if (!auth.ok) notFound();
 */
export async function requireMasterAuthFromHeaders(): Promise<AuthResult> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;

  const auth = await verifyTokenOrCookie(null, sessionCookie);
  if (!auth.ok) return auth;
  return assertMaster(auth);
}

async function assertMaster(auth: AuthSuccess): Promise<AuthResult> {
  try {
    const adminDoc = await getAdminDb().collection("admins").doc(auth.uid).get();
    if (!adminDoc.exists || adminDoc.data()?.active !== true) {
      return {
        ok: false,
        reason: "not_master",
        response: NextResponse.json(
          { error: "권한이 없습니다" },
          { status: 403 },
        ),
      };
    }
    return { ...auth, isMaster: true };
  } catch {
    return {
      ok: false,
      reason: "internal_error",
      response: NextResponse.json(
        { error: "권한 확인 중 오류" },
        { status: 500 },
      ),
    };
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   유틸 — 표준 zod 에러 응답
   ═══════════════════════════════════════════════════════════════════════ */

export function zodErrorResponse(error: { format: () => unknown }): NextResponse {
  return NextResponse.json(
    {
      error: "유효하지 않은 입력",
      details: error.format(),
    },
    { status: 400 },
  );
}
