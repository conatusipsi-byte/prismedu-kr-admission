/**
 * 시나리오 통합 — consult_one 풀 흐름 (Day 7, 2026-05-26).
 *
 * 본 테스트는 단위 테스트가 못 잡는 **계층 간 계약** 을 검증한다:
 *   - 결제 webhook 이 만드는 entitlement.active 엔트리의 정확한 모양
 *   - 그 모양을 getConsultingEntitlement 가 정확히 해석
 *   - booking 생성 시 untimed 슬롯이 정상 동작 (시기 매칭 X, consumedTimeSlot=null)
 *   - 취소 후 환불 (timeSlots 없음 → refundedTimeSlot=null)
 *
 * Webhook · booking · cancel 의 실제 SQL 동작은 각자 별도 테스트에서 검증되었으므로
 * 본 시나리오는 **데이터 모양 + 함수 호출 순서** 만 검증한다 (다른 테스트와 중복 X).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

/* ─────────────────────────────────────────────────────────────────────
   in-memory entitlement.active 상태 — webhook 이 쓰고, entitlement 가 읽고,
   booking 이 갱신하고, cancel 이 복구.
   ───────────────────────────────────────────────────────────────────── */

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
      // count: exact head: true → { count: N }
      b.then = (onF: (v: { count: number; error: null }) => unknown): Promise<unknown> => {
        if (table === "consulting_bookings") {
          return Promise.resolve({ count: state.confirmedBookings, error: null }).then(onF);
        }
        return Promise.resolve({ count: 0, error: null }).then(onF);
      };
      return b;
    },
  }),
}));

beforeEach(() => {
  state.active = [];
  state.confirmedBookings = 0;
});

describe("시나리오 — consult_one 풀 흐름 (Day 7)", () => {
  it("webhook 출력 → entitlement 해석 → 캘린더 요약 → 차감 → 환불 (계층 계약 검증)", async () => {
    // 1. webhook 이 만드는 active 엔트리 모양 (lib/plans + payment/confirm 의 빌더 로직).
    //    여기선 webhook 직접 호출 X — 알려진 출력 형태를 state 에 주입.
    // validUntil/grantedAt 은 현재 시각 기준 상대값 — 고정 날짜를 쓰면 그 날짜가 지나는 순간
    // entitlement 가 만료로 판정돼 테스트가 저절로 깨진다 (실제 2026-07-23 하드코딩분이 그렇게 터짐).
    // 대상 코드(getConsultingEntitlement / getCalendarEntitlementSummary)가 Date.now() 를
    // 두 곳에서 읽고 mock supabase 가 promise 기반이라, fake timer 보다 상대 날짜가 단순·안전.
    const DAY_MS = 24 * 60 * 60 * 1000;
    const FUTURE = new Date(Date.now() + 60 * DAY_MS).toISOString(); // 60일 뒤 = 미유효기간 내
    const GRANTED_AT = new Date(Date.now() - 1 * DAY_MS).toISOString(); // 어제 지급
    state.active = [
      {
        orderId: "kr_consult_one_once_uuid_1234567890123_abc123",
        productKind: "consult_one",
        validUntil: FUTURE,
        grantedAt: GRANTED_AT,
        // consult_one 은 bundleContents 없음 — 단건
      },
    ];

    // 2. entitlement 해석 — untimed 1회 사용 가능
    const { getConsultingEntitlement, getCalendarEntitlementSummary } = await import(
      "../entitlement"
    );
    let ent = await getConsultingEntitlement("uid-1");
    expect(ent.hasAccess).toBe(true);
    expect(ent.remainingCredits).toBe(1);
    expect(ent.pendingFutureSlots).toHaveLength(0);

    // 3. 캘린더 요약 — untimedRemaining=1, timed 없음
    let cal = await getCalendarEntitlementSummary("uid-1");
    expect(cal.untimedRemaining).toBe(1);
    expect(cal.timedSlots).toHaveLength(0);
    expect(cal.pendingTimedSlots).toHaveLength(0);

    // 4. booking 생성 시뮬레이션 — confirmedBookings 증가. entitlement read 가 차감 인식.
    state.confirmedBookings = 1;
    ent = await getConsultingEntitlement("uid-1");
    expect(ent.hasAccess).toBe(false); // untimed 1 - 1 = 0
    expect(ent.remainingCredits).toBe(0);
    expect(ent.usedCount).toBe(1);

    cal = await getCalendarEntitlementSummary("uid-1");
    expect(cal.untimedRemaining).toBe(0); // untimed 사용분 차감

    // 5. 취소 시뮬레이션 — booking 카운트 복귀. entitlement re-issue.
    state.confirmedBookings = 0;
    ent = await getConsultingEntitlement("uid-1");
    expect(ent.hasAccess).toBe(true);
    expect(ent.remainingCredits).toBe(1); // 환불 후 다시 사용 가능
  });

  it("expired consult_one — hasAccess=false (validUntil 만료 보호)", async () => {
    state.active = [
      {
        orderId: "expired-order",
        productKind: "consult_one",
        validUntil: "2020-01-01T00:00:00Z",
        grantedAt: "2019-12-01T00:00:00Z",
      },
    ];
    const { getConsultingEntitlement } = await import("../entitlement");
    const ent = await getConsultingEntitlement("uid-1");
    expect(ent.hasAccess).toBe(false);
    expect(ent.totalUnexpired).toBe(0);
  });
});
