/**
 * PriceTag — BUG-022 회귀 (2026-05-25).
 *
 * 검증:
 *   - 얼리버드 활성 → 정가 line-through + 얼리버드 강조 (size별 글자 크기)
 *   - showEarlybirdBadge=true → 배지 노출 ("얼리버드 ~YYYY.MM")
 *   - 얼리버드 종료 후 → 정가만, 배지 미노출
 *   - earlybirdPriceKrw 없는 상품 (report_one) → 단일 가격
 *   - periodLabel 노출
 *   - data-earlybird attribute (E2E 셀렉터)
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { PriceTag } from "../PriceTag";
import { PRODUCTS_KR } from "@/lib/plans";

afterEach(() => {
  vi.useRealTimers();
});

describe("PriceTag (BUG-022)", () => {
  it("얼리버드 활성 — 정가 line-through + 얼리버드 강조", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-01T00:00:00Z"));
    const { container } = render(<PriceTag product={PRODUCTS_KR.season_pass} size="compact" />);
    const regular = container.querySelector('[data-element="regular-price-strikethrough"]');
    const effective = container.querySelector('[data-element="effective-price"]');
    expect(regular, "정가 line-through 미노출").not.toBeNull();
    expect(regular!.textContent).toContain("40,000");
    expect(effective!.textContent).toContain("29,000");
    // 얼리버드 attribute 확인
    const tag = container.querySelector('[data-component="price-tag"]');
    expect(tag!.getAttribute("data-earlybird")).toBe("true");
  });

  it("showEarlybirdBadge=true → 배지 노출 (라벨만, 종료일 미표시)", () => {
    // 2026-05-30 클라이언트 요청: "얼리버드 ~YYYY.MM" 포맷 → "얼리버드"만 노출.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-01T00:00:00Z"));
    const { container } = render(
      <PriceTag product={PRODUCTS_KR.season_pass} showEarlybirdBadge />,
    );
    const badge = container.querySelector('[data-element="earlybird-badge"]');
    expect(badge, "얼리버드 배지 미노출").not.toBeNull();
    expect(badge!.textContent?.trim()).toBe("얼리버드");
    // 회귀 가드: 종료일 (YYYY.MM) 가 라벨에 포함되지 않음
    expect(badge!.textContent).not.toContain("2027.03");
    expect(badge!.textContent).not.toMatch(/~\s*\d{4}/);
  });

  it("showEarlybirdBadge=false (default) → 배지 미노출", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-01T00:00:00Z"));
    const { container } = render(<PriceTag product={PRODUCTS_KR.season_pass} />);
    expect(container.querySelector('[data-element="earlybird-badge"]')).toBeNull();
    // 단, 정가 line-through 는 여전히 노출
    expect(container.querySelector('[data-element="regular-price-strikethrough"]')).not.toBeNull();
  });

  it("얼리버드 종료 후 — 정가만, 배지/취소선 미노출", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-04-15T00:00:00Z"));
    const { container } = render(
      <PriceTag product={PRODUCTS_KR.season_pass} showEarlybirdBadge />,
    );
    expect(container.querySelector('[data-element="regular-price-strikethrough"]')).toBeNull();
    expect(container.querySelector('[data-element="earlybird-badge"]')).toBeNull();
    const effective = container.querySelector('[data-element="effective-price"]');
    expect(effective!.textContent).toContain("40,000");
    const tag = container.querySelector('[data-component="price-tag"]');
    expect(tag!.getAttribute("data-earlybird")).toBe("false");
  });

  it("얼리버드 없는 상품 (report_one) — 단일 가격, 배지/취소선 X", () => {
    const { container } = render(<PriceTag product={PRODUCTS_KR.report_one} />);
    expect(container.querySelector('[data-element="regular-price-strikethrough"]')).toBeNull();
    expect(container.querySelector('[data-element="earlybird-badge"]')).toBeNull();
    expect(container.querySelector('[data-element="effective-price"]')!.textContent).toContain("9,900");
  });

  it("얼리버드 없는 상품 + showEarlybirdBadge=true → 여전히 배지 X (가짜 배지 차단)", () => {
    const { container } = render(<PriceTag product={PRODUCTS_KR.report_one} showEarlybirdBadge />);
    expect(container.querySelector('[data-element="earlybird-badge"]')).toBeNull();
  });

  it("periodLabel '/ 월' 노출", () => {
    const { container } = render(
      <PriceTag product={PRODUCTS_KR.subscription_pro} periodLabel="/ 월" />,
    );
    expect(container.textContent).toContain("/ 월");
  });

  it("size='hero' / 'compact' / 'inline' 글자 크기 클래스 분리", () => {
    const hero = render(<PriceTag product={PRODUCTS_KR.report_one} size="hero" />);
    const compact = render(<PriceTag product={PRODUCTS_KR.report_one} size="compact" />);
    const inline = render(<PriceTag product={PRODUCTS_KR.report_one} size="inline" />);
    expect(hero.container.querySelector('[data-element="effective-price"]')!.className).toContain("text-5xl");
    expect(compact.container.querySelector('[data-element="effective-price"]')!.className).toContain("text-2xl");
    expect(inline.container.querySelector('[data-element="effective-price"]')!.className).toContain("text-base");
  });

  it("BUG-022 회귀 가드 — season_consult_1 번들도 정가 line-through 노출 (얼리버드 안)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-01T00:00:00Z"));
    const { container } = render(
      <PriceTag product={PRODUCTS_KR.season_consult_1} showEarlybirdBadge />,
    );
    const regular = container.querySelector('[data-element="regular-price-strikethrough"]');
    expect(regular!.textContent).toContain("300,000");
    expect(container.querySelector('[data-element="effective-price"]')!.textContent).toContain("190,000");
  });
});
