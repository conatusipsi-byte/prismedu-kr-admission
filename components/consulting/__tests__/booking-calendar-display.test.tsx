/**
 * BookingCalendar — 사용자 노출 안전성 회귀 (BUG-015, 2026-05-25).
 *
 * 결함: 슬롯 선택 시 footer 에 내부 UUID + "(Day 3)" 노출.
 * 수정: 사용자 친화 KST 형식. UUID·"Day N" 미노출.
 *
 * P-002 정직성 — 사용자에게 내부 식별자·작업 단계명 절대 노출 X.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { BookingCalendar } from "../BookingCalendar";

const SLOT_ID = "4d23fe40-a012-4f0f-9bd4-560b86d56f1e";
const SLOT_ISO = (() => {
  // 다음 주 어느 평일 19:00 KST
  const d = new Date();
  d.setDate(d.getDate() + 3);
  d.setHours(19, 0, 0, 0);
  return d.toISOString();
})();

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockResolvedValue(
    new Response(
      JSON.stringify({
        slots: [
          { id: SLOT_ID, startAt: SLOT_ISO, endAt: SLOT_ISO, durationMinutes: 60 },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  );
  (globalThis as unknown as { fetch: typeof mockFetch }).fetch = mockFetch;
});

describe("BookingCalendar — 사용자 노출 안전성 (BUG-015)", () => {
  it("슬롯 선택 전 — selected-slot-indicator 미노출", async () => {
    const { container } = render(<BookingCalendar />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    await screen.findByRole("button", { name: /\d{2}:\d{2}/ });
    expect(container.querySelector('[data-element="selected-slot-indicator"]')).toBeNull();
  });

  it("슬롯 선택 후 — 사용자 친화 형식 노출 (UUID X)", async () => {
    const { container } = render(<BookingCalendar />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const btn = await screen.findByRole("button", { name: /\d{2}:\d{2}/ });
    fireEvent.click(btn);
    const indicator = await waitFor(() =>
      container.querySelector('[data-element="selected-slot-indicator"]'),
    );
    expect(indicator, "selected-slot-indicator 노출 필요").not.toBeNull();
    const text = indicator!.textContent ?? "";
    // UUID 패턴 (8-4-4-4-12 hex) 미노출
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
    expect(text).not.toContain(SLOT_ID);
    // "Day N" 작업 단계명 미노출
    expect(text).not.toMatch(/Day\s*\d+/);
    // "ID" 키워드 미노출 (BUG-015 원래 카피)
    expect(text).not.toContain("ID");
    // 친화 형식 — "선택하신 시간:" + "KST" 포함
    expect(text).toContain("선택하신 시간");
    expect(text).toContain("KST");
  });

  it("슬롯 선택 후 — 시간 (HH:MM) 포함", async () => {
    const { container } = render(<BookingCalendar />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const btn = await screen.findByRole("button", { name: /\d{2}:\d{2}/ });
    fireEvent.click(btn);
    const indicator = await waitFor(() =>
      container.querySelector('[data-element="selected-slot-indicator"]'),
    );
    expect(indicator!.textContent).toMatch(/\d{1,2}:\d{2}/);
  });

  it("슬롯 토글 (재클릭 해제) — indicator 사라짐", async () => {
    const { container } = render(<BookingCalendar />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const btn = await screen.findByRole("button", { name: /\d{2}:\d{2}/ });
    fireEvent.click(btn); // 선택
    await waitFor(() =>
      expect(container.querySelector('[data-element="selected-slot-indicator"]')).not.toBeNull(),
    );
    fireEvent.click(btn); // 해제
    await waitFor(() =>
      expect(container.querySelector('[data-element="selected-slot-indicator"]')).toBeNull(),
    );
  });
});
