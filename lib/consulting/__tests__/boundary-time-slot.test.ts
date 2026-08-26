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

/* ─────────────────────────────────────────────────────────────────────
   시각 고정 (2026-08-26 이관 점검) — 시한폭탄 제거.
   아래 3개 테스트(빈 timeSlots / untimedRemaining=2 / booking 차감)는 시각을 고정하지 않아
   `validUntil: FUTURE` 가 **실제 현재보다 미래**라는 가정에 의존했다.
   2028-01-01 이 지나면 FUTURE 가 과거가 되어 권한이 만료 처리 → untimedRemaining 0 →
   테스트가 저절로 깨진다(그전에도 '빈 timeSlots' 는 만료 때문에 통과하는 위양성이 된다).
   → 파일 전체의 기준 시각을 다른 테스트와 동일한 2026-07-01 로 고정한다.
   (useFakeTimers 미사용 = Date 만 모킹. 개별 테스트의 useFakeTimers 호출은 그대로 유효)
   ───────────────────────────────────────────────────────────────────── */
/** 파일 전체 기준 시각 — 개별 테스트가 필요 시 setSystemTime 으로 덮어쓴다. */
const NOW_FIXED = new Date("2026-07-01T00:00:00Z");

/** 기준 시각(NOW_FIXED) 대비 확실한 미래 — 권한 만료 경로를 타지 않게 하는 validUntil. */
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
  vi.setSystemTime(NOW_FIXED);
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
