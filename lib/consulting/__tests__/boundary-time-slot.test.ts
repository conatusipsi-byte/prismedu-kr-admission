/**
 * 경계 케이스 — 시기 슬롯 정책 (Day 7, 2026-05-26).
 *
 * 검증:
 *   - validFrom = NOW 정확히 같은 시점 → 사용 가능 (≤ 비교, not <)
 *   - validFrom = NOW + 1ms → 사용 불가
 *   - usedAt 세팅 + remaining > 0 → 사용 불가 (이중 가드)
 *   - remaining = 0 + usedAt 없음 → 사용 불가
 *   - 빈 timeSlots 객체 → consulting bundle 사용권 0
 *
 * 본 테스트는 SQL/JS 양쪽의 시기 정책 일관성 안전망.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

const FUTURE = "2027-12-31T23:59:59Z";

interface Entry {
  orderId: string;
  productKind: string;
  validUntil: string;
  bundleContents?: Record<string, unknown>;
}
const state: { active: Entry[]; confirmedBookings: number } = {
  active: [],
  confirmedBookings: 0,
};

vi.mock("@/lib/supabase-server", () => ({
  getAdminSupabase: () => ({
    from: (table: string) => {
      const b: Record<string, unknown> = {};
      b.select = vi.fn(() => b);
      b.eq = vi.fn(() => b);
      b.maybeSingle = vi.fn(() =>
        table === "user_entitlements"
          ? Promise.resolve({ data: { active: state.active }, error: null })
          : Promise.resolve({ data: null, error: null }),
      );
      b.then = (onF: (v: { count: number; error: null }) => unknown): Promise<unknown> =>
        Promise.resolve({ count: state.confirmedBookings, error: null }).then(onF);
      return b;
    },
  }),
}));

function makeEntry(timeSlots: Record<string, { remaining: number; validFrom: string; usedAt?: string }>): Entry {
  return {
    orderId: "boundary-test",
    productKind: "season_consult_3",
    validUntil: FUTURE,
    bundleContents: {
      consulting: { totalSlots: 3, timeSlots },
    },
  };
}

beforeEach(() => {
  state.active = [];
  state.confirmedBookings = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("경계 케이스 — 시기 슬롯", () => {
  it("validFrom = NOW 정확히 같은 시점 → ready (≤ 비교)", async () => {
    vi.useFakeTimers();
    const NOW_ISO = "2026-07-01T00:00:00Z";
    vi.setSystemTime(new Date(NOW_ISO));
    state.active = [
      makeEntry({
        slot_a: { remaining: 1, validFrom: NOW_ISO }, // 정확히 같음
      }),
    ];
    const { getCalendarEntitlementSummary } = await import("../entitlement");
    const cal = await getCalendarEntitlementSummary("uid-1");
    expect(cal.timedSlots).toHaveLength(1);
    expect(cal.pendingTimedSlots).toHaveLength(0);
  });

  it("validFrom = NOW + 1ms → pending (< 비교)", async () => {
    vi.useFakeTimers();
    const NOW = new Date("2026-07-01T00:00:00Z");
    vi.setSystemTime(NOW);
    const future1ms = new Date(NOW.getTime() + 1).toISOString();
    state.active = [
      makeEntry({
        slot_a: { remaining: 1, validFrom: future1ms },
      }),
    ];
    const { getCalendarEntitlementSummary } = await import("../entitlement");
    const cal = await getCalendarEntitlementSummary("uid-1");
    expect(cal.timedSlots).toHaveLength(0);
    expect(cal.pendingTimedSlots).toHaveLength(1);
  });

  it("usedAt 세팅 + remaining > 0 (이중 상태) → 사용 불가", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-01T00:00:00Z"));
    state.active = [
      makeEntry({
        slot_a: { remaining: 1, validFrom: "2026-06-01T00:00:00Z", usedAt: "2026-06-10T00:00:00Z" },
      }),
    ];
    const { getCalendarEntitlementSummary } = await import("../entitlement");
    const cal = await getCalendarEntitlementSummary("uid-1");
    // usedAt 있으면 무조건 제외 (remaining 무관)
    expect(cal.timedSlots).toHaveLength(0);
  });

  it("remaining = 0 + usedAt 없음 → 사용 불가", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-01T00:00:00Z"));
    state.active = [
      makeEntry({
        slot_a: { remaining: 0, validFrom: "2026-06-01T00:00:00Z" },
      }),
    ];
    const { getCalendarEntitlementSummary } = await import("../entitlement");
    const cal = await getCalendarEntitlementSummary("uid-1");
    expect(cal.timedSlots).toHaveLength(0);
    expect(cal.pendingTimedSlots).toHaveLength(0); // remaining=0 = 카운트 X
  });

  it("빈 timeSlots {} → consulting bundle 사용권 0", async () => {
    state.active = [makeEntry({})];
    const { getCalendarEntitlementSummary } = await import("../entitlement");
    const cal = await getCalendarEntitlementSummary("uid-1");
    expect(cal.untimedRemaining).toBe(0);
    expect(cal.timedSlots).toHaveLength(0);
    expect(cal.pendingTimedSlots).toHaveLength(0);
  });

  it("season_consult_1 (timeSlots 부재) + season_consult_3 (timeSlots 있음) 혼합 — untimed + timed 분리", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-01T00:00:00Z"));
    state.active = [
      {
        orderId: "sc1",
        productKind: "season_consult_1",
        validUntil: FUTURE,
        bundleContents: { consulting: { totalSlots: 1 } }, // timeSlots 없음
      },
      makeEntry({
        slot_a: { remaining: 1, validFrom: "2026-06-01T00:00:00Z" },
      }),
    ];
    const { getCalendarEntitlementSummary } = await import("../entitlement");
    const cal = await getCalendarEntitlementSummary("uid-1");
    expect(cal.untimedRemaining).toBe(1); // sc1
    expect(cal.timedSlots).toHaveLength(1); // sc3 의 ready 슬롯 1
  });

  it("consult_one + season_consult_1 동시 보유 → untimedRemaining=2", async () => {
    state.active = [
      { orderId: "c1", productKind: "consult_one", validUntil: FUTURE },
      {
        orderId: "sc1",
        productKind: "season_consult_1",
        validUntil: FUTURE,
        bundleContents: { consulting: { totalSlots: 1 } },
      },
    ];
    const { getCalendarEntitlementSummary } = await import("../entitlement");
    const cal = await getCalendarEntitlementSummary("uid-1");
    expect(cal.untimedRemaining).toBe(2);
  });

  it("untimed 2 보유 + confirmed booking 1 → untimedRemaining=1 (카운트 차감)", async () => {
    state.active = [
      { orderId: "c1", productKind: "consult_one", validUntil: FUTURE },
      { orderId: "c2", productKind: "consult_one", validUntil: FUTURE },
    ];
    state.confirmedBookings = 1;
    const { getCalendarEntitlementSummary } = await import("../entitlement");
    const cal = await getCalendarEntitlementSummary("uid-1");
    expect(cal.untimedRemaining).toBe(1);
  });
});
