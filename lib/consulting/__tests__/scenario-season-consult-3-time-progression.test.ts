/**
 * 시나리오 통합 — season_consult_3 시간 진행 (Day 7, 2026-05-26).
 *
 * 시계 mock 으로 3개 시점 (5월 / 6월 진입 / 9월 진입 / 6모 소진 후 9월) 에서
 * getCalendarEntitlementSummary 가 timedSlots / pendingTimedSlots 를 정확히 분리.
 *
 * 본 테스트는 entitlement-bundle.test.ts 와 보완 — bundle 테스트는 단일 시점,
 * 본 테스트는 같은 데이터를 시간 진행에 따라 어떻게 다르게 해석하는지 검증.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

const FUTURE_VALID_UNTIL = "2027-03-31T14:59:59Z";

interface ActiveEntry {
  orderId: string;
  productKind: string;
  validUntil: string;
  grantedAt: string;
  bundleContents?: Record<string, unknown>;
}

const state: { active: ActiveEntry[]; confirmedBookings: number } = {
  active: [],
  confirmedBookings: 0,
};

vi.mock("@/lib/supabase-server", () => ({
  getAdminSupabase: () => ({
    from: (table: string) => {
      const b: Record<string, unknown> = {};
      b.select = vi.fn(() => b);
      b.eq = vi.fn(() => b);
      b.maybeSingle = vi.fn(() => {
        if (table === "user_entitlements") {
          return Promise.resolve({ data: { active: state.active }, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      });
      b.then = (onF: (v: { count: number; error: null }) => unknown): Promise<unknown> =>
        Promise.resolve({ count: state.confirmedBookings, error: null }).then(onF);
      return b;
    },
  }),
}));

function makeSeasonConsult3Entry(): ActiveEntry {
  return {
    orderId: "kr_season_consult_3_once_uuid_x_y",
    productKind: "season_consult_3",
    validUntil: FUTURE_VALID_UNTIL,
    grantedAt: "2026-05-26T00:00:00Z",
    bundleContents: {
      subscription: { active: true },
      consulting: {
        totalSlots: 3,
        timeSlots: {
          before_june: { remaining: 1, validFrom: "2026-06-01T00:00:00+09:00" },
          before_sept: { remaining: 1, validFrom: "2026-09-01T00:00:00+09:00" },
          after_csat: { remaining: 1, validFrom: "2026-11-14T00:00:00+09:00" },
        },
      },
    },
  };
}

beforeEach(() => {
  state.active = [makeSeasonConsult3Entry()];
  state.confirmedBookings = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("시나리오 — season_consult_3 시간 진행", () => {
  it("5월 (모든 시기 미도래) → ready=0, pending=3", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-26T00:00:00Z"));
    const { getCalendarEntitlementSummary } = await import("../entitlement");
    const cal = await getCalendarEntitlementSummary("uid-1");
    expect(cal.untimedRemaining).toBe(0);
    expect(cal.timedSlots).toHaveLength(0);
    expect(cal.pendingTimedSlots).toHaveLength(3);
    expect(cal.pendingTimedSlots.map((p) => p.timeSlot).sort()).toEqual([
      "after_csat",
      "before_june",
      "before_sept",
    ]);
  });

  it("6월 1일 자정 KST (=before_june 정확히 도래) — 6월만 ready, 나머지 pending", async () => {
    vi.useFakeTimers();
    // 2026-06-01 00:00:00 KST = 2026-05-31 15:00 UTC
    vi.setSystemTime(new Date("2026-05-31T15:00:00Z"));
    const { getCalendarEntitlementSummary } = await import("../entitlement");
    const cal = await getCalendarEntitlementSummary("uid-1");
    expect(cal.timedSlots).toHaveLength(1);
    expect(cal.timedSlots[0].timeSlot).toBe("before_june");
    expect(cal.pendingTimedSlots.map((p) => p.timeSlot).sort()).toEqual([
      "after_csat",
      "before_sept",
    ]);
  });

  it("9월 진입 + before_june 소진 → before_sept ready, after_csat pending", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T00:00:00Z"));
    // before_june usedAt 세팅 (소진)
    const entry = state.active[0];
    const timed = entry.bundleContents!.consulting as {
      timeSlots: Record<string, { remaining: number; validFrom: string; usedAt?: string }>;
    };
    timed.timeSlots.before_june = {
      remaining: 0,
      usedAt: "2026-06-10T00:00:00Z",
      validFrom: "2026-06-01T00:00:00+09:00",
    };

    const { getCalendarEntitlementSummary } = await import("../entitlement");
    const cal = await getCalendarEntitlementSummary("uid-1");
    // before_june 소진 → 제외. before_sept 도래. after_csat 미도래.
    expect(cal.timedSlots).toHaveLength(1);
    expect(cal.timedSlots[0].timeSlot).toBe("before_sept");
    expect(cal.pendingTimedSlots).toHaveLength(1);
    expect(cal.pendingTimedSlots[0].timeSlot).toBe("after_csat");
  });

  it("수능 이후 + 모든 시기 소진 → ready=0, pending=0 (사용권 없음)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-01T00:00:00Z"));
    const entry = state.active[0];
    const timed = entry.bundleContents!.consulting as {
      timeSlots: Record<string, { remaining: number; validFrom: string; usedAt?: string }>;
    };
    timed.timeSlots.before_june = {
      remaining: 0,
      usedAt: "2026-06-10T00:00:00Z",
      validFrom: "2026-06-01T00:00:00+09:00",
    };
    timed.timeSlots.before_sept = {
      remaining: 0,
      usedAt: "2026-09-15T00:00:00Z",
      validFrom: "2026-09-01T00:00:00+09:00",
    };
    timed.timeSlots.after_csat = {
      remaining: 0,
      usedAt: "2026-11-20T00:00:00Z",
      validFrom: "2026-11-14T00:00:00+09:00",
    };

    const { getCalendarEntitlementSummary } = await import("../entitlement");
    const cal = await getCalendarEntitlementSummary("uid-1");
    expect(cal.untimedRemaining).toBe(0);
    expect(cal.timedSlots).toHaveLength(0);
    expect(cal.pendingTimedSlots).toHaveLength(0);
  });

  it("validUntil 만료 — 시간 진행과 무관하게 전체 무효", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-04-01T00:00:00Z")); // validUntil 2027-03-31 + 1일
    const { getCalendarEntitlementSummary, getConsultingEntitlement } = await import(
      "../entitlement"
    );
    const cal = await getCalendarEntitlementSummary("uid-1");
    expect(cal.untimedRemaining).toBe(0);
    expect(cal.timedSlots).toHaveLength(0);
    expect(cal.pendingTimedSlots).toHaveLength(0);
    const ent = await getConsultingEntitlement("uid-1");
    expect(ent.hasAccess).toBe(false);
    expect(ent.totalUnexpired).toBe(0);
  });
});
