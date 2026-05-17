/**
 * API 라우트 인증 가드 — Supabase Auth 기반 (Firebase 마이그레이션 후).
 *
 * 사용:
 *   const auth = await requireAuth(req);
 *   if (!auth.ok) return auth.response;
 *   // auth.uid, auth.email 사용 가능
 *
 * 인증 흐름:
 *   1. Authorization Bearer 헤더 (Supabase access_token JWT) — API client 표준
 *   2. Cookie (`sb-{ref}-auth-token`) — Supabase SSR 클라이언트가 자동 관리
 *
 * 시그니처는 기존 Firebase 버전과 동일 (호출 라우트 33개 호환).
 */

import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getRouteSupabase, getAdminSupabase } from "./supabase-server";

/**
 * 레거시 호환 — Firebase 시기의 `__session` 쿠키. Supabase 마이그레이션 후엔
 * Supabase가 자동 관리하는 `sb-{ref}-auth-token` 사용. 본 상수는 카카오 콜백
 * 등 일부 코드 호환을 위해 유지하되, 신규 코드는 참조하지 말 것.
 */
export const SESSION_COOKIE_NAME = "__session";

/* ═══════════════════════════════════════════════════════════════════════
   타입
   ═══════════════════════════════════════════════════════════════════════ */

export interface AuthSuccess {
  ok: true;
  uid: string;
  email?: string;
  /** requireMasterAuth 통과 시에만 true */
  isMaster?: boolean;
}

export interface AuthFailure {
  ok: false;
  response: NextResponse;
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
   토큰/세션 추출
   ═══════════════════════════════════════════════════════════════════════ */

function extractBearerToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    return auth.slice("Bearer ".length).trim();
  }
  return null;
}

/* ═══════════════════════════════════════════════════════════════════════
   verifyBearerToken — Supabase access_token JWT 검증
   ═══════════════════════════════════════════════════════════════════════ */

async function verifyBearerToken(token: string): Promise<AuthResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return internalErrorResponse("Supabase env 누락");

  // session 영속화 끔 — 매 요청마다 새 클라이언트, getUser(token) 직접 호출.
  const client = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  try {
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) {
      return mapAuthError(error?.message);
    }
    return {
      ok: true,
      uid: data.user.id,
      email: data.user.email ?? undefined,
    };
  } catch (e) {
    return mapAuthError((e as Error).message);
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   verifyCookieSession — Supabase SSR 클라이언트가 cookie 자동 처리
   ═══════════════════════════════════════════════════════════════════════ */

async function verifyCookieSession(): Promise<AuthResult> {
  try {
    const sb = await getRouteSupabase();
    const { data, error } = await sb.auth.getUser();
    if (error || !data.user) {
      return mapAuthError(error?.message);
    }
    return {
      ok: true,
      uid: data.user.id,
      email: data.user.email ?? undefined,
    };
  } catch (e) {
    return mapAuthError((e as Error).message);
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   requireAuth — 일반 사용자
   ═══════════════════════════════════════════════════════════════════════ */

export async function requireAuth(req: NextRequest): Promise<AuthResult> {
  const bearer = extractBearerToken(req);

  // 1) Bearer (Supabase access_token) 우선
  if (bearer) {
    const result = await verifyBearerToken(bearer);
    if (result.ok) return result;
    // 토큰 검증 실패 — 쿠키 fallback 시도
  }

  // 2) 쿠키 세션
  const cookieResult = await verifyCookieSession();
  if (cookieResult.ok) return cookieResult;

  // 둘 다 실패 — 둘 다 없으면 missing_token, 있었는데 실패면 invalid_token
  if (!bearer) {
    return {
      ok: false,
      reason: "missing_token",
      response: NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 }),
    };
  }
  return cookieResult; // 마지막 시도 결과 반환
}

/* ═══════════════════════════════════════════════════════════════════════
   requireMasterAuth — 운영자 (admins 테이블 active=true)
   ═══════════════════════════════════════════════════════════════════════ */

export async function requireMasterAuth(req: NextRequest): Promise<AuthResult> {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth;
  return assertMaster(auth);
}

/**
 * Server Component 진입점 — NextRequest 없는 컨텍스트(layout, page) 용.
 */
export async function requireMasterAuthFromHeaders(): Promise<AuthResult> {
  const auth = await verifyCookieSession();
  if (!auth.ok) return auth;
  return assertMaster(auth);
}

async function assertMaster(auth: AuthSuccess): Promise<AuthResult> {
  try {
    const sb = getAdminSupabase();
    const { data, error } = await sb
      .from("admins")
      .select("active")
      .eq("user_id", auth.uid)
      .maybeSingle();
    if (error) return internalErrorResponse(error.message);
    if (!data || data.active !== true) {
      return {
        ok: false,
        reason: "not_master",
        response: NextResponse.json({ error: "권한이 없습니다" }, { status: 403 }),
      };
    }
    return { ...auth, isMaster: true };
  } catch (e) {
    return internalErrorResponse((e as Error).message);
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   에러 매핑
   ═══════════════════════════════════════════════════════════════════════ */

function mapAuthError(message: string | undefined): AuthFailure {
  // Supabase 에러 메시지 패턴 — "JWT expired", "Invalid JWT", "Token has expired" 등
  const m = (message ?? "").toLowerCase();
  const reason: AuthFailureReason =
    m.includes("expired") ? "expired_token" :
    m.includes("invalid") || m.includes("jwt") || m.includes("malformed") ? "invalid_token" :
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

function internalErrorResponse(message?: string): AuthFailure {
  if (process.env.NODE_ENV !== "production" && message) {
    console.error("[api-auth] internal:", message);
  }
  return {
    ok: false,
    reason: "internal_error",
    response: NextResponse.json({ error: "인증 처리 중 오류" }, { status: 500 }),
  };
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
