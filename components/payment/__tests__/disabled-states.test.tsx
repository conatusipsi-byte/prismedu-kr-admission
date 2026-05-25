/**
 * BUG-005 / BUG-006 회귀 — 결제 disabled UX.
 *
 * BUG-005: 결제 인프라 (NEXT_PUBLIC_TOSS_CLIENT_KEY) 미설정 상태에서 ProductCard 의 결제 버튼이
 *   클릭 가능한 채로 노출되면 안 됨. 라벨·시각·사유 안내가 명확해야 함.
 *
 * BUG-006: /pricing 의 PricingCard 가 enabled=false 상품 (consult_one) 을 받을 때 "출시 예정"
 *   배지·"준비 중" 가격·disabled 버튼으로 렌더되어야 함.
 *
 * 두 결함 모두 P-002 정직성 — 의도된 비활성 상태를 사용자에게 명확히 표시.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProductCard } from "../ProductCard";
import type { ProductDefKr } from "@/lib/plans";

const BASE_PRODUCT: ProductDefKr = {
  kind: "report_one",
  type: "analysis",
  displayName: "단건 리포트",
  shortDescription: "1회용 합격률 분석 리포트",
  priceKrw: 9900,
  period: "once",
  durationDays: 30,
  grants: { unlocksAnalysis: true },
  blocksOnInsufficientSample: true,
  enabled: true,
  isPricePlaceholder: true,
  highlights: ["전형별 분리 분석", "환산점수 컷·등급컷 비공개 사례 표시"],
};

describe("BUG-005 — ProductCard disabledReason UX", () => {
  it("disabledReason 없을 때: 버튼 '결제하기' + 활성", () => {
    render(<ProductCard product={BASE_PRODUCT} />);
    const btn = screen.getByRole("button", { name: "결제하기" });
    expect(btn).not.toBeDisabled();
    expect(btn.getAttribute("aria-disabled")).not.toBe("true");
  });

  /* ─────────────────────────────────────────────────────────────────────
     BUG-022 회귀 — /payment 가격 표시도 정가 line-through + 얼리버드 일관
     ───────────────────────────────────────────────────────────────────── */

  it("BUG-022: 얼리버드 상품 — 정가 line-through + 얼리버드 가격 + 배지 모두 노출", () => {
    const SEASON_PASS_LIKE: ProductDefKr = {
      ...BASE_PRODUCT,
      kind: "season_pass",
      displayName: "시즌권",
      priceKrw: 29000,
      earlybirdPriceKrw: 29000,
      regularPriceKrw: 40000,
      earlybirdUntil: "2099-12-31", // 항상 활성
      isPricePlaceholder: false,
    };
    const { container } = render(<ProductCard product={SEASON_PASS_LIKE} />);
    // 정가 line-through
    const regular = container.querySelector('[data-element="regular-price-strikethrough"]');
    expect(regular, "정가 line-through 미노출 (BUG-022 회귀)").not.toBeNull();
    expect(regular!.textContent).toContain("40,000");
    // 얼리버드 가격
    expect(container.querySelector('[data-element="effective-price"]')!.textContent).toContain("29,000");
    // 얼리버드 배지
    const badge = container.querySelector('[data-element="earlybird-badge"]');
    expect(badge, "얼리버드 배지 미노출").not.toBeNull();
  });

  it("BUG-022: 얼리버드 없는 상품 (report_one) — 단일 가격, 배지 X", () => {
    const { container } = render(<ProductCard product={BASE_PRODUCT} />);
    expect(container.querySelector('[data-element="regular-price-strikethrough"]')).toBeNull();
    expect(container.querySelector('[data-element="earlybird-badge"]')).toBeNull();
    expect(container.querySelector('[data-element="effective-price"]')!.textContent).toContain("9,900");
  });

  it("disabledReason 있을 때: 버튼 '결제하기 (준비 중)' + disabled + aria-disabled", () => {
    const reason = "사업자 등록 완료 후 활성화됩니다 (출시 준비 중)";
    render(<ProductCard product={BASE_PRODUCT} disabledReason={reason} />);

    const btn = screen.getByRole("button", { name: "결제하기 (준비 중)" });
    expect(btn).toBeDisabled();
    expect(btn.getAttribute("aria-disabled")).toBe("true");

    // 사유 텍스트가 카드 본문에 노출 (클릭 전 정직성 안내)
    expect(screen.getByText(reason)).toBeInTheDocument();
  });

  it("disabledReason 있을 때 onPurchase 콜백이 호출되지 않는다 (HTML disabled)", () => {
    const onPurchase = vi.fn();
    render(
      <ProductCard
        product={BASE_PRODUCT}
        disabledReason="사업자 등록 완료 후 활성화됩니다 (출시 준비 중)"
        onPurchase={onPurchase}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "결제하기 (준비 중)" }));
    expect(onPurchase).not.toHaveBeenCalled();
  });

  it("data-disabled 속성이 true 로 노출 (E2E·셀렉터 안정성)", () => {
    const { container } = render(
      <ProductCard product={BASE_PRODUCT} disabledReason="any reason" />,
    );
    expect(container.querySelector('[data-component="product-card"][data-disabled="true"]')).not.toBeNull();
  });
});
