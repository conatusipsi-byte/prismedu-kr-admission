/**
 * Supabase 인증 callback — 두 가지 경로 + fragment fallback.
 *
 *   A) OAuth (Google/Kakao/Apple) — `signInWithOAuth({ redirectTo: ".../auth/callback" })`
 *      → URL 에 `code` 쿼리. exchangeCodeForSession 으로 세션 발급.
 *
 *   B) 이메일 confirm / magiclink / recovery — Supabase 가 인증 메일 링크에 박는 형태
 *      → URL 에 `token_hash` + `type` 쿼리. verifyOtp 로 세션 발급.
 *
 *   C) Fragment fallback — Supabase 가 OAuth 에러·implicit flow 결과를 URL `#` 에
 *      박아 보내는 케이스. 서버는 fragment 를 못 읽으므로 client 컴포넌트가 처리.
 *      이전엔 이 경로가 missing_code_or_token 으로 잘못 폴백돼서 사용자에게
 *      "인증 링크가 만료됐거나 잘못됐어요" 라는 오인 메시지가 노출됐었음.
 *
 * 에러 시: /login?error=... 로 redirect — humanizeAuthError 가 한국어 친화 변환.
 */

import { redirect } from "next/navigation";
import { getRouteSupabase } from "@/lib/supabase-server";
import { CallbackFragmentHandler } from "./CallbackFragmentHandler";

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

function safeNextPath(raw: string | undefined): string {
  if (!raw) return "/dashboard";
  return raw.startsWith("/") && !raw.startsWith("//") ? raw : "/dashboard";
}

type SearchParams = Record<string, string | string[] | undefined>;

function pick(params: SearchParams, key: string): string | undefined {
  const v = params[key];
  return Array.isArray(v) ? v[0] : v;
}

export default async function AuthCallbackPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const code = pick(params, "code");
  const tokenHash = pick(params, "token_hash");
  const type = pick(params, "type");
  const oauthError = pick(params, "error");
  const oauthErrorDesc = pick(params, "error_description");
  const nextRaw = pick(params, "next") ?? pick(params, "returnUrl");
  const safeNext = safeNextPath(nextRaw);

  // (1) OAuth provider 측 거절 — fragment 가 아닌 query 로 도착한 케이스.
  if (oauthError) {
    const msg = oauthErrorDesc || oauthError;
    redirect(`/login?error=${encodeURIComponent(msg)}`);
  }

  // (2) PKCE OAuth — code 교환.
  if (code) {
    const sb = await getRouteSupabase();
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (error) {
      redirect(`/login?error=${encodeURIComponent(error.message)}`);
    }
    redirect(safeNext);
  }

  // (3) 이메일 confirm / magiclink / recovery.
  if (tokenHash && type && VALID_TYPES.has(type as SupabaseEmailOtpType)) {
    const sb = await getRouteSupabase();
    const { error } = await sb.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as SupabaseEmailOtpType,
    });
    if (error) {
      redirect(`/login?error=${encodeURIComponent(error.message)}`);
    }
    redirect(safeNext);
  }

  // (4) query 에 아무것도 없음 — fragment fallback. Supabase 가 OAuth 에러·implicit
  // flow 토큰을 `#` 에 박은 경우 (서버에선 안 보임). 클라이언트가 hash 파싱.
  return <CallbackFragmentHandler nextPath={safeNext} />;
}
