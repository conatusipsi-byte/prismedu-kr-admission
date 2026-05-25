/**
 * BookingCalendar 시기별 슬롯 필터 (Day 4 QA round 2 ④, 2026-05-25).
 *
 * 시나리오:
 *   1. entitlement 미전달 → 모든 슬롯 활성 (기존 동작 보존)
 *   2. untimedRemaining > 0 → 모든 슬롯 활성
 *   3. timedSlots 만 보유 + slot.startAt > validFrom → 활성
 *   4. timedSlots 만 보유 + slot.startAt < validFrom → 비활성 + tooltip
 *   5. pendingTimedSlots 만 (validFrom 미도래) → 모든 슬롯 비활성 + 안내
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { BookingCalendar, type CalendarEntitlement } from "../BookingCalendar";

const mockFetch = vi.fn();

// 캘린더의 다음 주 1일 0시 (UTC) 슬롯 — 결정성 위해 weekStart 기반 슬롯 미사용,
// 대신 +5일 후 슬롯을 ISO 로 만들기.
function isoPlusDays(days: number, hour = 10): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

function mockSlotsResponse(slots: Array<{ id: string; startAt: string }>): void {
  (globalThis as unknown as { fetch: typeof mockFetch }).fetch = mockFetch;
  mockFetch.mockResolvedValue(
    new Response(
      JSON.stringify({
        slots: slots.map((s) => ({
          id: s.id,
          startAt: s.startAt,
          endAt: s.startAt,
          durationMinutes: 60,
        })),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  );
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("BookingCalendar — 시기 슬롯 필터", () => {
  it("entitlement 미전달 → 모든 슬롯 활성", async () => {
    const slotIso = isoPlusDays(3);
    mockSlotsResponse([{ id: "s1", startAt: slotIso }]);
    render(<BookingCalendar />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const btn = await screen.findByRole("button", { pressed: false, name: /\d{2}:\d{2}/ });
    expect(btn.getAttribute("data-slot-usable")).toBe("true");
    expect(btn).not.toBeDisabled();
  });

  it("untimedRemaining=1 → 슬롯 활성", async () => {
    const slotIso = isoPlusDays(3);
    mockSlotsResponse([{ id: "s1", startAt: slotIso }]);
    const ent: CalendarEntitlement = {
      untimedRemaining: 1,
      timedSlots: [],
      pendingTimedSlots: [],
    };
    render(<BookingCalendar entitlement={ent} />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const btn = await screen.findByRole("button", { pressed: false, name: /\d{2}:\d{2}/ });
    expect(btn.getAttribute("data-slot-usable")).toBe("true");
  });

  it("timedSlots 만 + validFrom 도래 + 슬롯 미래 → 활성", async () => {
    const slotIso = isoPlusDays(3); // 3일 후
    mockSlotsResponse([{ id: "s1", startAt: slotIso }]);
    const ent: CalendarEntitlement = {
      untimedRemaining: 0,
      timedSlots: [{ timeSlot: "before_june", validFrom: isoPlusDays(-1), remaining: 1 }],
      pendingTimedSlots: [],
    };
    render(<BookingCalendar entitlement={ent} />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const btn = await screen.findByRole("button", { pressed: false, name: /\d{2}:\d{2}/ });
    expect(btn.getAttribute("data-slot-usable")).toBe("true");
  });

  it("pendingTimedSlots 만 (validFrom 미도래) → 슬롯 비활성 + tooltip", async () => {
    const slotIso = isoPlusDays(3); // 3일 후
    mockSlotsResponse([{ id: "s1", startAt: slotIso }]);
    const ent: CalendarEntitlement = {
      untimedRemaining: 0,
      timedSlots: [],
      pendingTimedSlots: [{ timeSlot: "before_sept", validFrom: isoPlusDays(100) }],
    };
    render(<BookingCalendar entitlement={ent} />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const btn = await screen.findByRole("button", { name: /\d{2}:\d{2}/ });
    expect(btn.getAttribute("data-slot-usable")).toBe("false");
    expect(btn).toBeDisabled();
    expect(btn.getAttribute("title")).toContain("9월 모의평가");
  });

  it("validFrom 미래 timedSlots 만 (사용자 권리 X) → 비활성", async () => {
    const slotIso = isoPlusDays(3);
    mockSlotsResponse([{ id: "s1", startAt: slotIso }]);
    const ent: CalendarEntitlement = {
      untimedRemaining: 0,
      timedSlots: [],
      pendingTimedSlots: [{ timeSlot: "after_csat", validFrom: isoPlusDays(200) }],
    };
    render(<BookingCalendar entitlement={ent} />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const btn = await screen.findByRole("button", { name: /\d{2}:\d{2}/ });
    expect(btn).toBeDisabled();
    expect(btn.getAttribute("title")).toContain("수능");
  });
});
