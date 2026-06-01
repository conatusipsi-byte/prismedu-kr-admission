/**
 * 컨설팅 슬롯 소비 헬퍼 — booking 확정 시 user_entitlements.active 갱신.
 *
 * 호출 시점 (예상):
 *   - POST /api/consulting/bookings (Day 4 도입) 가 booking row 를 만들기 직전.
 *   - 단건/번들1 (시기 미지정): UPDATE 없이 booking row 만 만들면 됨 (getConsultingEntitlement
 *     이 confirmed booking 수로 차감).
 *   - 번들3 (시기 지정): active[entryIdx].bundleContents.consulting.timeSlots[ts].usedAt 을
 *     세팅. 이 함수가 그 갱신을 담당.
 *
 * 멱등성:
 *   - usedAt 이 이미 있으면 본 함수는 no-op (재호출 안전).
 *
 * 정직성 (P-002):
 *   - 시기 미도래 (validFrom > now) 슬롯은 소비 시도 거부.
 *   - 가용 슬롯 없으면 명시적 에러 반환 (호출자가 사용자 피드백 제공).
 */

import "server-only";
import { getAdminSupabase } from "@/lib/supabase-server";
import type {
  ConsultingTimeSlot,
  EntitlementBundleContents,
  ProductKind,
} from "@/types/admission";

interface ActiveEntry {
  orderId: string;
  productKind: ProductKind | string;
  validUntil?: string;
  grantedAt?: string;
  bundleContents?: EntitlementBundleContents;
}

/** 단건/번들1 (시기 미지정) — booking 만 만들면 entitlement 자동 차감. 본 함수는 시기 지정용. */
export interface ConsumeResult {
  consumedTimeSlot: ConsultingTimeSlot | null;
  /** 변경된 active 엔트리의 orderId (null = 단건/번들1, 변경 없음) */
  changedOrderId: string | null;
}

/**
 * 사용자의 다음 가용 시기 지정 슬롯을 소비. 시기 미지정만 있으면 no-op (consumedTimeSlot: null).
 *
 * @param uid 사용자 ID
 * @param now 현재 시각 — 테스트 주입 가능
 * @returns 소비된 slot (또는 null)
 * @throws "no_available_slot" — 가용 슬롯 0개
 */
export async function consumeNextConsultingSlot(
  uid: string,
  now: Date = new Date(),
): Promise<ConsumeResult> {
  const sb = getAdminSupabase();
  const { data, error } = await sb
    .from("user_entitlements")
    .select("active")
    .eq("user_id", uid)
    .maybeSingle();
  if (error || !data) throw new Error("no_available_slot");

  // JSONB 손상 방어(P2 3-2): active 가 배열이 아니면 빈 배열로 — 비배열 캐스트로 인한 오동작 차단.
  const rawActive = (data as { active: unknown }).active;
  const active: ActiveEntry[] = Array.isArray(rawActive) ? (rawActive as ActiveEntry[]) : [];
  const nowMs = now.getTime();

  // 우선순위 1: 가용 시기 지정 슬롯 (validFrom 도래, remaining ≥ 1, usedAt 없음).
  //   같은 entry 안에서 가장 이른 validFrom 부터 — "수능 이후" 같은 후행 슬롯 보호.
  let pickedEntryIdx = -1;
  let pickedTs: ConsultingTimeSlot | null = null;
  let pickedValidFromMs = Number.POSITIVE_INFINITY;
  for (let i = 0; i < active.length; i += 1) {
    const e = active[i];
    if (!e.validUntil) continue;
    if (Date.parse(e.validUntil) <= nowMs) continue; // 만료
    const timed = e.bundleContents?.consulting?.timeSlots;
    if (!timed) continue;
    for (const [ts, meta] of Object.entries(timed) as Array<[
      ConsultingTimeSlot,
      { remaining: number; usedAt?: string; validFrom: string },
    ]>) {
      // remaining 이 유한수가 아니면 스킵 — 손상 엔트리로 인한 NaN 차감 방지(P2 3-2).
      if (typeof meta.remaining !== "number" || !Number.isFinite(meta.remaining) || meta.remaining <= 0 || meta.usedAt) continue;
      const vfMs = Date.parse(meta.validFrom);
      if (Number.isNaN(vfMs) || vfMs > nowMs) continue;
      if (vfMs < pickedValidFromMs) {
        pickedValidFromMs = vfMs;
        pickedEntryIdx = i;
        pickedTs = ts;
      }
    }
  }

  if (pickedEntryIdx >= 0 && pickedTs) {
    const entry = active[pickedEntryIdx];
    const timed = entry.bundleContents!.consulting!.timeSlots!;
    const updatedTimed = {
      ...timed,
      [pickedTs]: {
        ...timed[pickedTs]!,
        remaining: Math.max(0, timed[pickedTs]!.remaining - 1),
        usedAt: now.toISOString(),
      },
    };
    const updatedActive = active.slice();
    updatedActive[pickedEntryIdx] = {
      ...entry,
      bundleContents: {
        ...entry.bundleContents!,
        consulting: {
          ...entry.bundleContents!.consulting!,
          timeSlots: updatedTimed,
        },
      },
    };
    const { error: updErr } = await sb
      .from("user_entitlements")
      .update({ active: updatedActive })
      .eq("user_id", uid);
    if (updErr) throw new Error(`active 업데이트 실패: ${updErr.message}`);
    return { consumedTimeSlot: pickedTs, changedOrderId: entry.orderId };
  }

  // 시기 지정 슬롯 없음 → 시기 미지정 (consult_one / season_consult_1) 가용 여부만 확인.
  const hasUntimed = active.some((e) => {
    if (!e.validUntil) return false;
    if (Date.parse(e.validUntil) <= nowMs) return false;
    if (e.productKind === "consult_one") return true;
    const consulting = e.bundleContents?.consulting;
    if (!consulting) return false;
    return !consulting.timeSlots && consulting.totalSlots > 0;
  });
  if (!hasUntimed) throw new Error("no_available_slot");

  // 시기 미지정 슬롯은 active 직접 갱신 안 함 — booking row 카운트로 차감.
  return { consumedTimeSlot: null, changedOrderId: null };
}
