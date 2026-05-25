/**
 * 컨설팅 entitlement 검증 — /consulting 진입 게이트 + 예약 생성 사전 검증.
 *
 * 권한 모델 (QA round 2 ④ 확장, 2026-05-25):
 *   - 단건 consult_one  → active 엔트리 { orderId, productKind: 'consult_one', validUntil, grantedAt }
 *   - 번들 season_consult_1 → bundleContents.consulting.totalSlots = 1
 *   - 번들 season_consult_3 → bundleContents.consulting.totalSlots = 3, timeSlots 시기 지정
 *
 * "사용 가능 크레딧" 정의:
 *   - 단건/번들 (시기 미지정) — confirmed booking 수 차감 후 remaining
 *   - 번들 시기 지정 — 각 timeSlot 의 validFrom 도래 + remaining ≥ 1 인 슬롯만 카운트
 *
 * 정직성 (P-002): "권한 없음" 사유를 명시. 환불 분쟁 대비 redirect 후
 *   /pricing#consulting 에서 사용자에게 구매 안내 노출.
 */

import "server-only";
import { getAdminSupabase } from "@/lib/supabase-server";
import type {
  ConsultingTimeSlot,
  EntitlementBundleContents,
  ProductKind,
} from "@/types/admission";

/**
 * 캘린더 표시용 entitlement 요약 — BookingCalendar 가 prop 으로 받아 슬롯별 사용 가능 판정.
 * page.tsx (server) 가 빌드 후 client component 로 전달.
 */
export interface CalendarEntitlementSummary {
  untimedRemaining: number;
  timedSlots: Array<{
    timeSlot: ConsultingTimeSlot;
    validFrom: string;
    remaining: number;
  }>;
  pendingTimedSlots: Array<{
    timeSlot: ConsultingTimeSlot;
    validFrom: string;
  }>;
}

export interface ConsultingEntitlement {
  hasAccess: boolean;
  /** 즉시 예약 가능한 컨설팅 크레딧 수 (시기 슬롯의 validFrom 도래 + remaining ≥ 1). */
  remainingCredits: number;
  /** 결제했지만 아직 시기 미도래 → 노출은 하되 예약 불가. */
  pendingFutureSlots: Array<{
    timeSlot: ConsultingTimeSlot;
    validFrom: string;
    orderId: string;
  }>;
  /** 디버그/관리자용 — 전체 미만료 컨설팅 슬롯 수 (사용 + 미도래 + 사용 가능 합) */
  totalUnexpired: number;
  /** 이미 사용한 (confirmed booking 차감) 슬롯 수 */
  usedCount: number;
}

interface ActiveEntry {
  orderId: string;
  productKind: ProductKind | string;
  validUntil?: string;
  grantedAt?: string;
  bundleContents?: EntitlementBundleContents;
}

const NOT_ENTITLED: ConsultingEntitlement = {
  hasAccess: false,
  remainingCredits: 0,
  pendingFutureSlots: [],
  totalUnexpired: 0,
  usedCount: 0,
};

/** 컨설팅 크레딧을 가지는 ProductKind. */
const CONSULTING_PRODUCTS = new Set<string>([
  "consult_one",
  "season_consult_1",
  "season_consult_3",
]);

/**
 * 한 active 엔트리가 제공하는 총 컨설팅 슬롯 수.
 * 단건 consult_one = 1, 번들 = bundleContents.consulting.totalSlots.
 */
function totalSlotsFromEntry(entry: ActiveEntry): number {
  if (entry.productKind === "consult_one") return 1;
  return entry.bundleContents?.consulting?.totalSlots ?? 0;
}

/**
 * 사용자의 컨설팅 권한 조회. uid 가 없거나 row 가 없으면 NOT_ENTITLED.
 *
 * 호출처:
 *   - app/consulting/layout.tsx → hasAccess=false 면 /pricing#consulting redirect
 *   - app/api/consulting/bookings POST → 예약 사전 검증
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

  // 미만료 + 컨설팅 권한 보유 엔트리만.
  const consultingEntries = active.filter((entry) => {
    if (!CONSULTING_PRODUCTS.has(entry.productKind)) return false;
    if (!entry.validUntil) return false;
    const validUntilMs = Date.parse(entry.validUntil);
    if (Number.isNaN(validUntilMs)) return false;
    return validUntilMs > now;
  });
  if (consultingEntries.length === 0) return NOT_ENTITLED;

  const totalUnexpired = consultingEntries.reduce((s, e) => s + totalSlotsFromEntry(e), 0);

  // 시기 지정 슬롯 — validFrom 도래 여부 판정
  const pendingFutureSlots: ConsultingEntitlement["pendingFutureSlots"] = [];
  let readyTimedSlots = 0;
  let untimedSlots = 0; // 단건 consult_one + season_consult_1
  for (const entry of consultingEntries) {
    const timed = entry.bundleContents?.consulting?.timeSlots;
    if (!timed) {
      // 시기 미지정 — 단건/번들1 — 즉시 사용 가능 슬롯에 합산
      untimedSlots += totalSlotsFromEntry(entry);
      continue;
    }
    // 시기 지정 — 슬롯별 검사
    for (const [ts, meta] of Object.entries(timed) as Array<[
      ConsultingTimeSlot,
      { remaining: number; usedAt?: string; validFrom: string },
    ]>) {
      if (meta.remaining <= 0 || meta.usedAt) continue;
      const validFromMs = Date.parse(meta.validFrom);
      if (Number.isNaN(validFromMs)) continue;
      if (validFromMs <= now) {
        readyTimedSlots += meta.remaining;
      } else {
        pendingFutureSlots.push({
          timeSlot: ts,
          validFrom: meta.validFrom,
          orderId: entry.orderId,
        });
      }
    }
  }

  // confirmed booking 카운트 — 단건/번들1 의 사용량 차감용. 시기 지정 슬롯의 차감은
  // booking 생성 시 active jsonb 의 timeSlot.remaining/usedAt 을 직접 갱신하므로
  // 여기서 중복 차감하지 않는다.
  const { count: confirmedBookings, error: bookingErr } = await sb
    .from("consulting_bookings")
    .select("id", { count: "exact", head: true })
    .eq("user_id", uid)
    .eq("status", "confirmed");

  let untimedRemaining: number;
  let usedCount: number;
  if (bookingErr) {
    // 권한 조회 실패 → 안전 방향(접근 허용) — 사용자가 이미 결제한 상태라
    // booking 조회 실패로 캘린더 진입 차단하면 더 큰 마찰.
    untimedRemaining = untimedSlots;
    usedCount = 0;
  } else {
    // 시기 지정 슬롯에 대응하는 booking 은 위에서 usedAt 으로 이미 차감됨.
    // confirmed booking 중 시기 지정 슬롯에 매핑된 것은 metadata.consumed_time_slot
    // 으로 식별 가능하지만 (Day 3+ 도입), 본 함수는 시기 미지정 슬롯 사용량만 추적.
    // booking 수 ≥ 시기 지정 사용량 + 시기 미지정 사용량 이므로,
    // untimedUsed = max(0, totalConfirmedBookings - timedSlotsUsedFromActive).
    const timedUsedFromActive = consultingEntries.reduce((s, e) => {
      const timed = e.bundleContents?.consulting?.timeSlots;
      if (!timed) return s;
      return s + Object.values(timed).filter((meta) => meta?.usedAt).length;
    }, 0);
    const totalConfirmed = confirmedBookings ?? 0;
    const untimedUsed = Math.max(0, totalConfirmed - timedUsedFromActive);
    untimedRemaining = Math.max(0, untimedSlots - untimedUsed);
    usedCount = totalConfirmed;
  }

  const remainingCredits = untimedRemaining + readyTimedSlots;

  return {
    hasAccess: remainingCredits > 0,
    remainingCredits,
    pendingFutureSlots,
    totalUnexpired,
    usedCount,
  };
}

/**
 * 캘린더용 entitlement 요약 — BookingCalendar 가 사용. 시기 ready/pending 분리 + untimed 잔여.
 * /consulting/page.tsx 가 호출 후 client 컴포넌트로 전달.
 */
export async function getCalendarEntitlementSummary(
  uid: string,
): Promise<CalendarEntitlementSummary> {
  const sb = getAdminSupabase();
  const { data } = await sb
    .from("user_entitlements")
    .select("active")
    .eq("user_id", uid)
    .maybeSingle();

  const empty: CalendarEntitlementSummary = {
    untimedRemaining: 0,
    timedSlots: [],
    pendingTimedSlots: [],
  };
  if (!data) return empty;

  const active = ((data as { active: ActiveEntry[] | null }).active ?? []) as ActiveEntry[];
  const nowMs = Date.now();
  let untimedTotal = 0;
  const timedSlots: CalendarEntitlementSummary["timedSlots"] = [];
  const pendingTimedSlots: CalendarEntitlementSummary["pendingTimedSlots"] = [];

  for (const entry of active) {
    if (!CONSULTING_PRODUCTS.has(entry.productKind)) continue;
    if (!entry.validUntil) continue;
    if (Date.parse(entry.validUntil) <= nowMs) continue;

    const consulting = entry.bundleContents?.consulting;
    const timed = consulting?.timeSlots;

    if (entry.productKind === "consult_one") {
      untimedTotal += 1;
    } else if (consulting && !timed) {
      untimedTotal += consulting.totalSlots;
    } else if (timed) {
      for (const [ts, meta] of Object.entries(timed) as Array<[
        ConsultingTimeSlot,
        { remaining: number; usedAt?: string; validFrom: string },
      ]>) {
        if (meta.remaining <= 0 || meta.usedAt) continue;
        if (Date.parse(meta.validFrom) <= nowMs) {
          timedSlots.push({ timeSlot: ts, validFrom: meta.validFrom, remaining: meta.remaining });
        } else {
          pendingTimedSlots.push({ timeSlot: ts, validFrom: meta.validFrom });
        }
      }
    }
  }

  // booking 카운트로 untimed 사용분 차감
  const { count: confirmedBookings } = await sb
    .from("consulting_bookings")
    .select("id", { count: "exact", head: true })
    .eq("user_id", uid)
    .eq("status", "confirmed");
  const totalConfirmed = confirmedBookings ?? 0;
  const timedUsedFromActive = active.reduce((s, e) => {
    const timed = e.bundleContents?.consulting?.timeSlots;
    if (!timed) return s;
    return s + Object.values(timed).filter((meta) => meta?.usedAt).length;
  }, 0);
  const untimedUsed = Math.max(0, totalConfirmed - timedUsedFromActive);
  const untimedRemaining = Math.max(0, untimedTotal - untimedUsed);

  return { untimedRemaining, timedSlots, pendingTimedSlots };
}
