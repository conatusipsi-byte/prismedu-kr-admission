/**
 * /admin/sample-stats 회귀 (Day 11)
 *
 * 검증:
 *   1. SampleStatsOverview — insufficient > 0 → rose 강조
 *   2. SampleStatsTable — insufficient 행 rose 톤 + 사유 라벨
 *   3. summarize() — sufficient/insufficient 분류 + byReason 카운트
 *   4. P-002 — "확정 합격" 0건 / 부정 표현 0건
 *   5. insufficient 자동 우선 정렬 (운영자 우선순위)
 */

import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { SampleStatsOverview } from "../SampleStatsOverview";
import { SampleStatsTable } from "../SampleStatsTable";
import {
  summarizeSampleStats as summarize,
  type SampleStatsItem,
} from "@/lib/admission/sample-stats-summary";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/admin/sample-stats",
}));

const NEGATIVE_TERMS = ["검열", "차단", "거부", "막음", "필터링"];

function item(overrides: Partial<SampleStatsItem> = {}): SampleStatsItem {
  const acceptedCount = overrides.acceptedCount ?? 10;
  const weightedCount = overrides.weightedCount ?? 7.5;
  const sufficient = acceptedCount >= 5 && weightedCount >= 3.0;
  return {
    id: overrides.id ?? "test_id",
    universityId: "yonsei",
    departmentId: "business",
    year: 2027,
    trackKind: "jeongsi_na",
    verifiedCount: 12,
    weightedCount,
    acceptedCount,
    gate: sufficient
      ? { sufficient: true, acceptedN: acceptedCount, weightedN: weightedCount }
      : { sufficient: false, reason: "below_threshold", acceptedN: acceptedCount, weightedN: weightedCount },
    updatedAtMs: Date.now(),
    ...overrides,
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   summarize — 분류 카운트
   ═══════════════════════════════════════════════════════════════════════ */

describe("summarize — sufficient/insufficient + byReason", () => {
  it("모두 sufficient → insufficient=0", () => {
    const r = summarize([item({ acceptedCount: 10, weightedCount: 7 }), item({ acceptedCount: 8 })]);
    expect(r.total).toBe(2);
    expect(r.sufficient).toBe(2);
    expect(r.insufficient).toBe(0);
  });

  it("byReason 카운트 정확", () => {
    const items: SampleStatsItem[] = [
      item({
        id: "a",
        gate: { sufficient: false, reason: "no_data", acceptedN: 0, weightedN: 0 },
      }),
      item({
        id: "b",
        gate: { sufficient: false, reason: "below_threshold", acceptedN: 2, weightedN: 1 },
      }),
      item({
        id: "c",
        gate: { sufficient: false, reason: "weighted_below", acceptedN: 6, weightedN: 2 },
      }),
      item({
        id: "d",
        gate: { sufficient: false, reason: "no_accepted", acceptedN: 0, weightedN: 0 },
      }),
    ];
    const r = summarize(items);
    expect(r.byReason).toEqual({ no_data: 1, below_threshold: 1, weighted_below: 1, no_accepted: 1 });
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   SampleStatsOverview — 시각 강조
   ═══════════════════════════════════════════════════════════════════════ */

describe("SampleStatsOverview — insufficient 강조", () => {
  it("insufficient > 0 → '표본 부족' 카드 rose 톤", () => {
    const summary = summarize([
      item({ id: "a", gate: { sufficient: false, reason: "below_threshold", acceptedN: 1, weightedN: 0.5 } }),
    ]);
    const { container } = render(<SampleStatsOverview summary={summary} />);
    const card = container.querySelector('[data-stat-card="표본 부족"]') as HTMLElement;
    expect(card.getAttribute("data-tone")).toBe("rose");
  });

  it("insufficient = 0 → 표본 부족 카드 neutral 톤 + '없음' 안내", () => {
    const summary = summarize([item({ acceptedCount: 10 })]);
    const { container } = render(<SampleStatsOverview summary={summary} />);
    const card = container.querySelector('[data-stat-card="표본 부족"]') as HTMLElement;
    expect(card.getAttribute("data-tone")).toBe("neutral");
    expect(container.textContent).toMatch(/표본 부족 학과 없음/);
  });

  it("byReason 분포 4종 모두 노출", () => {
    const summary = summarize([
      item({ id: "a", gate: { sufficient: false, reason: "no_data", acceptedN: 0, weightedN: 0 } }),
      item({ id: "b", gate: { sufficient: false, reason: "below_threshold", acceptedN: 2, weightedN: 1 } }),
    ]);
    const { container } = render(<SampleStatsOverview summary={summary} />);
    const reasonList = container.querySelector('[data-element="reason-list"]') as HTMLElement;
    expect(reasonList.querySelector('[data-reason="no_data"]')).not.toBeNull();
    expect(reasonList.querySelector('[data-reason="below_threshold"]')).not.toBeNull();
    expect(reasonList.querySelector('[data-reason="weighted_below"]')).not.toBeNull();
    expect(reasonList.querySelector('[data-reason="no_accepted"]')).not.toBeNull();
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   SampleStatsTable — 정렬·시각 분리
   ═══════════════════════════════════════════════════════════════════════ */

describe("SampleStatsTable — insufficient 우선 정렬 + 시각 분리", () => {
  it("insufficient 행이 위쪽 정렬", () => {
    const { container } = render(
      <SampleStatsTable
        items={[
          item({ id: "a", acceptedCount: 10, weightedCount: 7 }),
          item({
            id: "b",
            acceptedCount: 1,
            weightedCount: 0.5,
            gate: { sufficient: false, reason: "below_threshold", acceptedN: 1, weightedN: 0.5 },
          }),
        ]}
      />,
    );
    const rows = container.querySelectorAll("[data-stats-id]");
    expect(rows[0].getAttribute("data-stats-id")).toBe("b");
    expect(rows[0].getAttribute("data-sufficient")).toBe("false");
  });

  it("insufficient 행 rose 톤 + 사유 라벨", () => {
    const { container } = render(
      <SampleStatsTable
        items={[
          item({
            id: "x",
            gate: { sufficient: false, reason: "below_threshold", acceptedN: 2, weightedN: 1 },
          }),
        ]}
      />,
    );
    const row = container.querySelector('[data-sufficient="false"]') as HTMLElement;
    expect(row.className).toMatch(/rose/);
    const badge = container.querySelector('[data-element="insufficient-badge"]') as HTMLElement;
    expect(badge.getAttribute("data-reason")).toBe("below_threshold");
    expect(badge.textContent).toMatch(/5건 미만/);
  });

  it("빈 목록 → 안내", () => {
    const { container } = render(<SampleStatsTable items={[]} />);
    expect(container.querySelector('[data-empty="true"]')).not.toBeNull();
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   P-002 — admin UI 톤 일관
   ═══════════════════════════════════════════════════════════════════════ */

describe("P-002 — admin UI 정직성", () => {
  it("Overview·Table 모두 '확정 합격' 0건 + 부정 표현 0건", () => {
    const summary = summarize([item()]);
    const overview = render(<SampleStatsOverview summary={summary} />);
    const table = render(<SampleStatsTable items={[item()]} />);
    const text = overview.container.textContent + " " + table.container.textContent;
    expect(text).not.toMatch(/확정\s*합격/);
    for (const t of NEGATIVE_TERMS) {
      expect(text).not.toContain(t);
    }
  });
});
