/**
 * /consulting/my-bookings layout — entitlement 검사 우회.
 *
 * 부모 /consulting layout 은 entitlement.hasAccess 미보유 사용자를 /pricing#consulting 으로
 * redirect 시킨다. 하지만 본 페이지는 **과거 예약 이력**을 보여주므로, entitlement 가
 * 만료/소진된 사용자도 접근할 수 있어야 한다 (P-002 정직성 — 자신의 데이터 확인 권한).
 *
 * 이 layout 은 인증만 확인하고 entitlement 체크는 페이지가 자체 처리.
 */

import { redirect } from "next/navigation";
import { getRouteSupabase } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export default async function MyBookingsLayout({ children }: { children: React.ReactNode }) {
  const sb = await getRouteSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/login?returnUrl=/consulting/my-bookings");
  return <>{children}</>;
}
