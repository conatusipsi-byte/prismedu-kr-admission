/**
 * Fragment(`#`) 폴백 페이지 — `/auth/callback` Route Handler 가 query 비었을 때
 * 30x redirect 로 위임. 브라우저가 fragment 를 보존(RFC 7231 §7.1.2) 하므로
 * 클라이언트가 hash 파싱해 에러 surface 또는 implicit flow 세션 픽업.
 */

import { CallbackFragmentHandler } from "../CallbackFragmentHandler";

export const dynamic = "force-dynamic";

function safeNextPath(raw: string | string[] | undefined): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v) return "/dashboard";
  return v.startsWith("/") && !v.startsWith("//") ? v : "/dashboard";
}

export default async function AuthCallbackFragmentPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  return <CallbackFragmentHandler nextPath={safeNextPath(next)} />;
}
