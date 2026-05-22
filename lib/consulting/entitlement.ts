/**
 * 컨설팅 entitlement 검증 — /consulting 진입 게이트 + 예약 생성 사전 검증.
 *
 * 권한 모델 (P-014 placeholder 가격 상태에서도 동작):
 *   - PRODUCTS_KR['consult_one'].grants = { consultCredits: 1 } (lib/plans.ts)
 *   - 결제 승인 시 user_entitlements.active 에 { orderId, productKind: 'consult_one', validUntil, grantedAt } 추가 (app/api/payment/confirm).
 *
 * "사용 가능 크레딧" 정의:
 *   - active 배열 내 productKind='consult_one' 항목 중 validUntil > now() (만료 안 됨)
 *   - 같은 orderId 로 만들어진 confirmed booking 이 있으면 그 크레딧은 사용됨
 *
 * Day 2 단계는 본 페이지 진입 가드만 사용. 예약 생성(POST /api/consulting/bookings)에선
 *   "남은 크레딧 ≥ 1" 검증을 별도로 수행 (Day 3). 본 함수는 둘 다 커버하도록 설계.
 *
 * 정직성 (P-002): "권한 없음" 사유를 명시. 환불 분쟁 대비 redirect 후 /pricing#consulting 에서
 *   사용자에게 구매 안내 노출.
 */

import "server-only";
import { getAdminSupabase } from "@/lib/supabase-server";

export interface ConsultingEntitlement {
  hasAccess: boolean;
  /** 남은 컨설팅 크레딧 (만료 안 됐고 booking 없는 consult_one 항목 수). hasAccess 가 false 면 0. */
  remainingCredits: number;
  /** 디버그/관리자용 — total 만료 안 된 consult_one 항목 수 */
  totalUnexpired: number;
  /** 이미 사용한 (confirmed booking 있는) consult_one 항목 수 */
  usedCount: number;
}

interface ActiveEntry {
  orderId: string;
  productKind: string;
  validUntil?: string;
  grantedAt?: string;
}

const NOT_ENTITLED: ConsultingEntitlement = {
  hasAccess: false,
  remainingCredits: 0,
  totalUnexpired: 0,
  usedCount: 0,
};

/**
 * 사용자의 컨설팅 권한 조회. uid 가 없거나 row 가 없으면 NOT_ENTITLED.
 *
 * 호출처:
 *   - app/consulting/layout.tsx → hasAccess=false 면 /pricing#consulting redirect
 *   - app/api/consulting/bookings POST (Day 3) → remainingCredits=0 면 403
 */
export async function getConsultingEntitlement(
  uid: string | undefined | null,
): Promise<ConsultingEntitlement> {
  if (!uid) return NOT_ENTITLED;

  const sb = getAdminSupabase();
  const { data, error } = await sb
    .from("user_entitlements")
    .select("active")
    .eq("user_id", uid)
    .maybeSingle();
  if (error || !data) return NOT_ENTITLED;

  const active = ((data as { active: ActiveEntry[] | null }).active ?? []) as ActiveEntry[];
  const now = Date.now();

  const unexpiredConsultEntries = active.filter((entry) => {
    if (entry.productKind !== "consult_one") return false;
    if (!entry.validUntil) return false;
    const validUntilMs = Date.parse(entry.validUntil);
    if (Number.isNaN(validUntilMs)) return false;
    return validUntilMs > now;
  });

  if (unexpiredConsultEntries.length === 0) return NOT_ENTITLED;

  // 사용 여부 — confirmed booking 의 application 을 통해 추적이 정석이나, Day 2 단계는
  // 단일 booking-per-user 가정으로 단순화. user_id + status='confirmed' 카운트.
  // Day 3 booking POST 에서 본 함수의 카운팅 로직을 강화 (orderId ↔ booking 매핑).
  const { count: confirmedBookings, error: bookingErr } = await sb
    .from("consulting_bookings")
    .select("id", { count: "exact", head: true })
    .eq("user_id", uid)
    .eq("status", "confirmed");
  if (bookingErr) {
    // 권한 조회 실패 → 안전 방향(접근 허용) — 사용자가 이미 결제한 상태라
    // booking 조회 실패로 캘린더 진입 차단하면 더 큰 마찰. Day 3 에서 강화.
    return {
      hasAccess: true,
      remainingCredits: unexpiredConsultEntries.length,
      totalUnexpired: unexpiredConsultEntries.length,
      usedCount: 0,
    };
  }

  const used = confirmedBookings ?? 0;
  const remaining = Math.max(0, unexpiredConsultEntries.length - used);

  return {
    hasAccess: remaining > 0,
    remainingCredits: remaining,
    totalUnexpired: unexpiredConsultEntries.length,
    usedCount: used,
  };
}
