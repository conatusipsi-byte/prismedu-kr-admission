/**
 * /pricing 카드 회귀 — QA round 2 ④ (2026-05-25) 갱신.
 *
 * 변경 컨텍스트:
 *   - consult_one 활성화 (5/28 출시 예정 → 즉시 결제 가능)
 *   - 시즌권·번들 얼리버드 가격 적용 (~2027.03)
 *   - 신규 번들 2종 (season_consult_1, season_consult_3)
 *
 * 회귀 검증:
 *   1. consult_one 카드 = enabled (data-coming-soon="false") + 활성 가격
 *   2. 얼리버드 활성 카드 = data-earlybird="true" + 정가 취소선 + 얼리버드 배지
 *   3. 번들 카드 = bundle-contents 박스 노출
 *   4. season_consult_3 = 시기 슬롯 라벨 (6모/9모/수능) 노출
 */

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import PricingPage from "../page";

describe("/pricing 카드 (QA round 2 ④)", () => {
  it("consult_one 카드 = enabled (출시 예정 라벨 X)", () => {
    const { container } = render(<PricingPage />);
    const card = container.querySelector(
      'article[data-product-kind="consult_one"]',
    );
    expect(card, "consult_one 카드 미노출").not.toBeNull();
    expect(card!.getAttribute("data-coming-soon")).toBe("false");
    // "준비 중" 텍스트 사라지고 실제 가격 표기
    expect(card!.textContent).not.toContain("준비 중");
    expect(card!.textContent).toContain("180,000");
  });

  it("season_pass 카드 = 얼리버드 활성 (정가 취소선 + 배지)", () => {
    const { container } = render(<PricingPage />);
    const card = container.querySelector(
      'article[data-product-kind="season_pass"]',
    );
    expect(card!.getAttribute("data-earlybird")).toBe("true");
    expect(
      card!.querySelector('[data-element="earlybird-badge"]'),
      "얼리버드 배지 미노출",
    ).not.toBeNull();
    expect(
      card!.querySelector('[data-element="regular-price-strikethrough"]'),
      "정가 취소선 미노출",
    ).not.toBeNull();
    expect(card!.textContent).toContain("29,000"); // 얼리버드
    expect(card!.textContent).toContain("40,000"); // 정가 취소선
  });

  it("season_consult_1 번들 카드 — 패키지 구성 박스 노출 + 절약액 정확 (BUG-017 회귀)", () => {
    const { container } = render(<PricingPage />);
    const card = container.querySelector(
      'article[data-product-kind="season_consult_1"]',
    );
    expect(card, "season_consult_1 카드 미노출").not.toBeNull();
    const bundle = card!.querySelector('[data-element="bundle-contents"]');
    expect(bundle, "bundle-contents 박스 미노출").not.toBeNull();
    expect(bundle!.textContent).toContain("시즌권 분석 무제한");
    expect(bundle!.textContent).toContain("1:1 컨설팅 1회");
    // 얼리버드 활성
    expect(card!.getAttribute("data-earlybird")).toBe("true");
    expect(card!.textContent).toContain("190,000");
    expect(card!.textContent).toContain("300,000"); // 정가
    // BUG-017: 동적 절약액 — 단건 합산 ₩209,000 대비 ₩19,000 절약
    const savings = bundle!.querySelector('[data-element="bundle-savings"]');
    expect(savings, "bundle-savings 미노출").not.toBeNull();
    expect(savings!.textContent).toContain("209,000"); // 단건 합산
    expect(savings!.textContent).toContain("19,000");  // 절약액
    expect(savings!.textContent).toContain("절약");
    // 9.5x 부풀린 ₩180,000 회귀 차단
    expect(savings!.textContent).not.toContain("180,000");
  });

  it("season_consult_3 번들 카드 — 시기 슬롯 라벨 (6모/9모/수능)", () => {
    const { container } = render(<PricingPage />);
    const card = container.querySelector(
      'article[data-product-kind="season_consult_3"]',
    );
    expect(card, "season_consult_3 카드 미노출").not.toBeNull();
    const bundle = card!.querySelector('[data-element="bundle-contents"]');
    expect(bundle).not.toBeNull();
    expect(bundle!.textContent).toContain("1:1 컨설팅 3회");
    // 시기 슬롯 — 6월 모평/9월 모평/수능 이후
    expect(bundle!.textContent).toMatch(/6월 모의평가/);
    expect(bundle!.textContent).toMatch(/9월 모의평가/);
    expect(bundle!.textContent).toMatch(/수능 이후/);
    expect(card!.textContent).toContain("490,000");
    expect(card!.textContent).toContain("700,000");
    // BUG-017: 동적 절약액 — 단건 합산 ₩569,000 대비 ₩79,000 절약
    const savings = bundle!.querySelector('[data-element="bundle-savings"]');
    expect(savings, "bundle-savings 미노출").not.toBeNull();
    expect(savings!.textContent).toContain("569,000");
    expect(savings!.textContent).toContain("79,000");
  });

  it("report_one 등 얼리버드 미적용 상품은 data-earlybird=false (회귀 방지)", () => {
    const { container } = render(<PricingPage />);
    const reportCard = container.querySelector(
      'article[data-product-kind="report_one"]',
    );
    expect(reportCard!.getAttribute("data-earlybird")).toBe("false");
    // 얼리버드 배지·취소선 X
    expect(reportCard!.querySelector('[data-element="earlybird-badge"]')).toBeNull();
    expect(reportCard!.querySelector('[data-element="regular-price-strikethrough"]')).toBeNull();
  });

  it("5개 활성 상품 카드 모두 렌더링 (단건/시즌/컨설팅/번들×2)", () => {
    const { container } = render(<PricingPage />);
    const kinds = ["report_one", "season_pass", "consult_one", "season_consult_1", "season_consult_3"];
    for (const k of kinds) {
      const card = container.querySelector(`article[data-product-kind="${k}"]`);
      expect(card, `${k} 카드 미노출`).not.toBeNull();
    }
  });
});
