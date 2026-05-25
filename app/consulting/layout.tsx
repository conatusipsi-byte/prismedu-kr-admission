/**
 * /consulting/* server layout — 세션 검증 (Day 4 갱신, 2026-05-25).
 *
 * 기존: layout 에서 entitlement.hasAccess 도 검증해서 미보유 사용자를 /pricing 으로 redirect.
 * 변경: my-bookings 페이지가 본 layout 의 자식이라 entitlement 게이트에 막혀 자신의 과거
 *   예약 이력도 못 봤다. 본 layout 은 세션만 가드하고 entitlement 게이트는 /consulting/page.tsx
 *   가 자체 처리 (my-bookings 는 entitlement 없어도 접근 가능 — 자신의 데이터 확인 권리).
 */

import { redirect } from "next/navigation";
import { getRouteSupabase } from "@/lib/supabase-server";

export const dynamic = "force-dynamic"; // 쿠키 의존 — prerender 금지

export default async function ConsultingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sb = await getRouteSupabase();
  const {
    data: { user },
    error,
  } = await sb.auth.getUser();

  if (error || !user) {
    redirect("/login?returnUrl=/consulting");
  }

  return <>{children}</>;
}
