/**
 * Supabase 서버 클라이언트 — Route Handler / Server Component / API 라우트 용.
 *
 * 두 가지 패턴:
 *   1. getRouteSupabase()   — 요청 cookie 기반 RLS-aware 클라이언트 (사용자 세션 활용)
 *   2. getAdminSupabase()    — service_role 키 사용 RLS bypass (관리자 작업·결제 confirm 등)
 *
 * lib/firebase-admin.ts 의 getAdminDb() / getAdminAuth() 와 대응:
 *   - getAdminDb()    → getAdminSupabase()
 *   - getAdminAuth()  → getAdminSupabase().auth.admin
 *
 * 환경변수:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   SUPABASE_SERVICE_ROLE_KEY  (서버 전용)
 */
import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (process.env.NODE_ENV === "production") {
  if (!URL || !ANON) {
    console.error("[supabase-server] NEXT_PUBLIC_SUPABASE_URL/ANON_KEY 누락");
  }
  if (!SERVICE) {
    console.error("[supabase-server] SUPABASE_SERVICE_ROLE_KEY 누락 — admin 작업 동작 불가");
  }
}

/**
 * Route Handler / Server Component 용 — 요청 cookie 기반 세션 인식.
 * RLS 가 auth.uid() 를 사용해 본인 데이터만 접근 가능.
 *
 *   import { getRouteSupabase } from "@/lib/supabase-server";
 *   const sb = await getRouteSupabase();
 *   const { data: { user } } = await sb.auth.getUser();
 */
export async function getRouteSupabase() {
  const cookieStore = await cookies();
  return createServerClient(URL, ANON, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Component 컨텍스트에선 set 불가 — 무시. middleware 가 갱신.
        }
      },
    },
  });
}

/* ═══════════════════════════════════════════════════════════════════════
   Admin 클라이언트 (service_role)
   ───────────────────────────────────────────────────────────────────────
   RLS bypass — 결제 confirm, ETL 적재, 마스터 계정 작업 등 신뢰된 서버
   로직만 사용. 절대로 응답 본문·클라이언트 번들에 노출 금지.
   ═══════════════════════════════════════════════════════════════════════ */

let cachedAdmin: SupabaseClient | null = null;

/**
 * service_role 클라이언트 — RLS bypass. 싱글톤.
 *
 *   import { getAdminSupabase } from "@/lib/supabase-server";
 *   const sb = getAdminSupabase();
 *   await sb.from("orders").update({ status: "approved" }).eq("id", orderId);
 */
export function getAdminSupabase(): SupabaseClient {
  if (cachedAdmin) return cachedAdmin;
  if (!URL || !SERVICE) {
    throw new Error(
      "Supabase admin 초기화 실패: NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 누락.",
    );
  }
  cachedAdmin = createClient(URL, SERVICE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cachedAdmin;
}

/* ═══════════════════════════════════════════════════════════════════════
   Firebase 호환 별칭 — 마이그레이션 중 코드 변경 최소화
   ───────────────────────────────────────────────────────────────────────
   기존 코드:
     import { getAdminDb } from "@/lib/firebase-admin";
     const db = getAdminDb();
     await db.collection("orders").doc(id).update({ ... });
   →
   대응:
     import { getAdminSupabase } from "@/lib/supabase-server";
     const sb = getAdminSupabase();
     await sb.from("orders").update({ ... }).eq("id", id);

   API 자체가 다르므로 1:1 별칭은 불가. 라우트별로 수동 마이그레이션.
   ═══════════════════════════════════════════════════════════════════════ */
