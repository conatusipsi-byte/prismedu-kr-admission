/**
 * getConsultingEntitlement — 번들 + 시기 지정 슬롯 회귀 (QA round 2 ④, 2026-05-25).
 *
 * 검증:
 *   - 단건 consult_one: 기존 동작 (booking 카운트로 차감) 유지
 *   - season_consult_1: 컨설팅 1회 즉시 사용 가능
 *   - season_consult_3: 시기별 validFrom 도래한 슬롯만 remainingCredits 합산
 *   - 미도래 슬롯은 pendingFutureSlots 로 분리 노출
 *   - 사용 (usedAt) 또는 remaining=0 슬롯은 카운트 X
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// supabase mock — entitlements + bookings 양쪽 chain
const mockState: {
  entitlementRow: { active: unknown[] } | null;
  bookingCount: number;
  bookingError: { message: string } | null;
} = {
  entitlementRow: null,
  bookingCount: 0,
  bookingError: null,
};

function makeEntitlementBuilder(): unknown {
  const b: Record<string, unknown> = {};
  b.select = vi.fn(() => b);
  b.eq = vi.fn(() => b);
  b.maybeSingle = vi.fn(() =>
    Promise.resolve({ data: mockState.entitlementRow, error: null }),
  );
  return b;
}

function makeBookingsBuilder(): unknown {
  const b: Record<string, unknown> = {};
  b.select = vi.fn(() => b);
  b.eq = vi.fn(() => b);
  // 두 번째 .eq() 호출 결과가 Promise — 카운트 반환
  let eqCount = 0;
  b.eq = vi.fn(() => {
    eqCount += 1;
    if (eqCount >= 2) {
      return Promise.resolve({
        count: mockState.bookingCount,
        error: mockState.bookingError,
      });
    }
    return b;
  });
  return b;
}

vi.mock("@/lib/supabase-server", () => ({
  getAdminSupabase: () => ({
    from: (table: string) => {
      if (table === "user_entitlements") return makeEntitlementBuilder();
      if (table === "consulting_bookings") return makeBookingsBuilder();
      throw new Error(`unmocked table: ${table}`);
    },
  }),
}));

beforeEach(() => {
  mockState.entitlementRow = null;
  mockState.bookingCount = 0;
  mockState.bookingError = null;
});

const FUTURE_ISO = "2099-12-31T23:59:59Z";

describe("getConsultingEntitlement — bundle + timed slots", () => {
  it("uid 없음 → NOT_ENTITLED", async () => {
    const { getConsultingEntitlement } = await import("../entitlement");
    const r = await getConsultingEntitlement(null);
    expect(r.hasAccess).toBe(false);
    expect(r.remainingCredits).toBe(0);
  });

  it("entitlement row 없음 → NOT_ENTITLED", async () => {
    mockState.entitlementRow = null;
    const { getConsultingEntitlement } = await import("../entitlement");
    const r = await getConsultingEntitlement("uid1");
    expect(r.hasAccess).toBe(false);
  });

  it("단건 consult_one 1회 + booking 0건 → remainingCredits=1", async () => {
    mockState.entitlementRow = {
      active: [
        { orderId: "ord1", productKind: "consult_one", validUntil: FUTURE_ISO },
      ],
    };
    mockState.bookingCount = 0;
    const { getConsultingEntitlement } = await import("../entitlement");
    const r = await getConsultingEntitlement("uid1");
    expect(r.hasAccess).toBe(true);
    expect(r.remainingCredits).toBe(1);
    expect(r.totalUnexpired).toBe(1);
  });

  it("단건 consult_one 1회 + booking 1건 → remainingCredits=0", async () => {
    mockState.entitlementRow = {
      active: [
        { orderId: "ord1", productKind: "consult_one", validUntil: FUTURE_ISO },
      ],
    };
    mockState.bookingCount = 1;
    const { getConsultingEntitlement } = await import("../entitlement");
    const r = await getConsultingEntitlement("uid1");
    expect(r.hasAccess).toBe(false);
    expect(r.remainingCredits).toBe(0);
    expect(r.usedCount).toBe(1);
  });

  it("season_consult_1 (시기 미지정 1회) → 즉시 1회 사용 가능", async () => {
    mockState.entitlementRow = {
      active: [
        {
          orderId: "ord2",
          productKind: "season_consult_1",
          validUntil: FUTURE_ISO,
          bundleContents: {
            subscription: { active: true },
            consulting: { totalSlots: 1 },
          },
        },
      ],
    };
    const { getConsultingEntitlement } = await import("../entitlement");
    const r = await getConsultingEntitlement("uid1");
    expect(r.hasAccess).toBe(true);
    expect(r.remainingCredits).toBe(1);
    expect(r.pendingFutureSlots).toHaveLength(0);
  });

  it("season_consult_3 — 모든 슬롯 미도래 (현재시각=2026-05-25) → remainingCredits=0 + pendingFutureSlots=3", async () => {
    mockState.entitlementRow = {
      active: [
        {
          orderId: "ord3",
          productKind: "season_consult_3",
          validUntil: FUTURE_ISO,
          bundleContents: {
            subscription: { active: true },
            consulting: {
              totalSlots: 3,
              timeSlots: {
                before_june: { remaining: 1, validFrom: "2026-06-01T00:00:00+09:00" },
                before_sept: { remaining: 1, validFrom: "2026-09-01T00:00:00+09:00" },
                after_csat:  { remaining: 1, validFrom: "2026-11-14T00:00:00+09:00" },
              },
            },
          },
        },
      ],
    };
    // 시스템 시간 mock — 2026-05-25 (모든 슬롯 미도래)
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-25T00:00:00Z"));
    try {
      const { getConsultingEntitlement } = await import("../entitlement");
      const r = await getConsultingEntitlement("uid1");
      expect(r.remainingCredits).toBe(0);
      expect(r.hasAccess).toBe(false);
      expect(r.pendingFutureSlots).toHaveLength(3);
      expect(r.pendingFutureSlots.map((p) => p.timeSlot).sort()).toEqual([
        "after_csat",
        "before_june",
        "before_sept",
      ]);
      expect(r.totalUnexpired).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("season_consult_3 — 6월 슬롯만 도래 (현재시각=2026-07-01) → remainingCredits=1 + pending=2", async () => {
    mockState.entitlementRow = {
      active: [
        {
          orderId: "ord3",
          productKind: "season_consult_3",
          validUntil: FUTURE_ISO,
          bundleContents: {
            subscription: { active: true },
            consulting: {
              totalSlots: 3,
              timeSlots: {
                before_june: { remaining: 1, validFrom: "2026-06-01T00:00:00+09:00" },
                before_sept: { remaining: 1, validFrom: "2026-09-01T00:00:00+09:00" },
                after_csat:  { remaining: 1, validFrom: "2026-11-14T00:00:00+09:00" },
              },
            },
          },
        },
      ],
    };
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-01T00:00:00Z"));
    try {
      const { getConsultingEntitlement } = await import("../entitlement");
      const r = await getConsultingEntitlement("uid1");
      expect(r.remainingCredits).toBe(1);
      expect(r.hasAccess).toBe(true);
      expect(r.pendingFutureSlots.map((p) => p.timeSlot).sort()).toEqual([
        "after_csat",
        "before_sept",
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("season_consult_3 — 6모 슬롯 이미 사용 (usedAt set) → remainingCredits 차감", async () => {
    mockState.entitlementRow = {
      active: [
        {
          orderId: "ord3",
          productKind: "season_consult_3",
          validUntil: FUTURE_ISO,
          bundleContents: {
            consulting: {
              totalSlots: 3,
              timeSlots: {
                before_june: { remaining: 0, usedAt: "2026-06-10T00:00:00Z", validFrom: "2026-06-01T00:00:00+09:00" },
                before_sept: { remaining: 1, validFrom: "2026-09-01T00:00:00+09:00" },
                after_csat:  { remaining: 1, validFrom: "2026-11-14T00:00:00+09:00" },
              },
            },
          },
        },
      ],
    };
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T00:00:00Z"));
    try {
      const { getConsultingEntitlement } = await import("../entitlement");
      const r = await getConsultingEntitlement("uid1");
      // 6모 사용됨 (제외) + 9모 도래 + 수능 미도래 → 즉시 1회 사용 가능
      expect(r.remainingCredits).toBe(1);
      expect(r.pendingFutureSlots).toHaveLength(1);
      expect(r.pendingFutureSlots[0].timeSlot).toBe("after_csat");
    } finally {
      vi.useRealTimers();
    }
  });

  it("만료된 entitlement (validUntil < now) → 제외", async () => {
    mockState.entitlementRow = {
      active: [
        { orderId: "ord1", productKind: "consult_one", validUntil: "2020-01-01T00:00:00Z" },
      ],
    };
    const { getConsultingEntitlement } = await import("../entitlement");
    const r = await getConsultingEntitlement("uid1");
    expect(r.hasAccess).toBe(false);
  });
});
