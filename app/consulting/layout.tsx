/**
 * /consulting/* server layout — 진입 권한 단일 검증 지점
 *
 * 흐름:
 *   1. middleware (Edge): 세션 쿠키 부재 시 /login?returnUrl=/consulting redirect.
 *   2. **본 layout (Node)**: 쿠키 검증 + user_entitlements.active 에서 consult_one 보유 확인.
 *   3. 통과 시 자식 page 렌더.
 *
 * 미보유 사용자는 /pricing#consulting 으로 보내 결제 안내 (P-014 가격 placeholder 인 동안에도
 * "출시 예정" 카드는 노출되므로 안내 자체는 의미가 있음).
 *
 * 정직성 (P-002): 권한 없으면 "있는 척" 캘린더를 띄우지 않고 명확하게 결제 페이지로 안내.
 */

import { redirect } from "next/navigation";
import { getRouteSupabase } from "@/lib/supabase-server";
import { getConsultingEntitlement } from "@/lib/consulting/entitlement";

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

  const entitlement = await getConsultingEntitlement(user.id);
  if (!entitlement.hasAccess) {
    redirect("/pricing#consulting");
  }

  return <>{children}</>;
}
