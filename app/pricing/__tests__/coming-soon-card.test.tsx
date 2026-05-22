/**
 * BUG-006 회귀 — /pricing 의 1:1 컨설팅 (enabled=false) 카드 노출.
 *
 * 결함: 비교표에 "1:1 컨설팅" 컬럼이 있는데 상단 카드 영역에는 없어서 사용자에게
 * 구매 경로가 끊겼음. consult_one 은 lib/plans.ts 에서 enabled=false placeholder 라
 * listEnabledProductsKr() 결과에서 제외되기 때문.
 *
 * 본 테스트가 강제하는 계약:
 *   1. /pricing 페이지 (server component) 가 consult_one 카드를 항상 렌더 (enabled 무관)
 *   2. 카드에 "출시 예정" 배지 노출 (consult_one 의 경우 "5/28 출시 예정")
 *   3. 가격 영역에 "준비 중" 텍스트 (₩0 같은 임의 숫자가 노출되면 회귀)
 *   4. 버튼이 disabled 상태이고 라벨이 "출시 예정"
 *   5. 카드의 data-coming-soon="true" 속성으로 E2E 셀렉터 안정성 확보
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import PricingPage from "../page";

describe("BUG-006 — /pricing 1:1 컨설팅 카드 (enabled=false)", () => {
  it("consult_one 카드가 페이지에 노출된다 (data-product-kind 셀렉터)", () => {
    const { container } = render(<PricingPage />);
    const consultCard = container.querySelector(
      'article[data-component="pricing-card"][data-product-kind="consult_one"]',
    );
    expect(consultCard).not.toBeNull();
  });

  it("consult_one 카드에 'data-coming-soon=true' + '5/28 출시 예정' 배지", () => {
    const { container } = render(<PricingPage />);
    const card = container.querySelector(
      'article[data-product-kind="consult_one"][data-coming-soon="true"]',
    );
    expect(card, "consult_one 카드가 coming-soon 으로 표시되어야 함").not.toBeNull();
    expect(card!.textContent).toContain("5/28 출시 예정");
  });

  it("consult_one 카드 가격 영역에 '준비 중' (₩0 같은 임의 숫자 X — P-002)", () => {
    const { container } = render(<PricingPage />);
    const card = container.querySelector('article[data-product-kind="consult_one"]')!;
    expect(card.textContent).toContain("준비 중");
    // ₩0 노출 X — 의미 없는 가격 숫자 회귀 방지
    expect(card.textContent).not.toContain("₩0");
  });

  it("consult_one 카드 버튼은 disabled + '출시 예정' 라벨", () => {
    render(<PricingPage />);
    const btn = screen.getByRole("button", { name: "출시 예정" });
    expect(btn).toBeDisabled();
    expect(btn.getAttribute("aria-disabled")).toBe("true");
  });

  it("report_one / season_pass 등 enabled 상품 카드는 영향 없음 (회귀 방지)", () => {
    const { container } = render(<PricingPage />);
    // 일반 카드는 data-coming-soon="false"
    const normalCards = container.querySelectorAll(
      'article[data-component="pricing-card"][data-coming-soon="false"]',
    );
    expect(normalCards.length, "활성 상품 카드가 최소 1개 이상 존재해야 함").toBeGreaterThan(0);
  });
});
