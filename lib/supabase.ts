/**
 * Supabase 클라이언트 (브라우저) — @supabase/ssr 기반 cookie-aware 클라이언트.
 *
 * Auth 세션이 cookie 에 저장되어 SSR(서버 컴포넌트·라우트)와 동기화됨.
 * Route Handler / Server Component 에서는 lib/supabase-server.ts 사용.
 *
 * 환경변수:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *
 * 두 변수 모두 클라이언트 번들에 노출되며 RLS 가 차단함.
 */
import { createBrowserClient } from "@supabase/ssr";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anon) {
  if (process.env.NODE_ENV === "production") {
    console.error(
      "[supabase] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 가 비어있습니다. " +
      "Vercel/Codespaces Secrets 등록 확인하세요. placeholder 로 폴백 — Auth/DB 동작 안 함.",
    );
  }
}

/**
 * 브라우저 Supabase 클라이언트 — 컴포넌트에서 호출 시 같은 인스턴스 반환됨
 * (createBrowserClient 내부 캐시).
 */
export function getBrowserSupabase() {
  return createBrowserClient(
    url ?? "https://placeholder.supabase.co",
    anon ?? "placeholder-anon-key",
  );
}

/** 기존 lib/firebase.ts `db` 호환 — 브라우저 컴포넌트에서 쓸 때 import 단순화용. */
export const supabase = getBrowserSupabase();
