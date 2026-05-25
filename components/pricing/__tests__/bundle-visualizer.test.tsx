/**
 * BundlePackageVisualizer 회귀 (BUG-021, 2026-05-25).
 *
 * 검증:
 *   - 2개 번들 카드 (season_consult_1 / season_consult_3) 노출
 *   - 각 카드: 시즌권 part + 컨설팅 part
 *   - season_consult_3: 시기 슬롯 라벨 (6월 모의평가 / 9월 모의평가 / 수능 이후)
 *   - 가격: 단건 합산 (line-through) + 패키지 가격 (강조) + 절약액
 *   - BUG-017 회귀 가드 — ₩180,000 부풀린 표기 부재
 *   - data-element attribute (E2E 셀렉터)
 */

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { BundlePackageVisualizer } from "../BundlePackageVisualizer";

describe("BundlePackageVisualizer (BUG-021)", () => {
  it("2개 번들 카드 노출 — season_consult_1 + season_consult_3", () => {
    const { container } = render(<BundlePackageVisualizer />);
    const c1 = container.querySelector('[data-product-kind="season_consult_1"]');
    const c3 = container.querySelector('[data-product-kind="season_consult_3"]');
    expect(c1, "season_consult_1 카드 미노출").not.toBeNull();
    expect(c3, "season_consult_3 카드 미노출").not.toBeNull();
  });

  it("season_consult_1 — 시즌권 + 컨설팅 1회 part 노출", () => {
    const { container } = render(<BundlePackageVisualizer />);
    const c1 = container.querySelector('[data-product-kind="season_consult_1"]')!;
    const parts = c1.querySelectorAll('[data-element="bundle-part"]');
    expect(parts).toHaveLength(2);
    expect(parts[0].textContent).toContain("시즌권 분석 무제한");
    expect(parts[1].textContent).toContain("1:1 컨설팅 1회");
    // 시기 슬롯 라벨 부재 (시기 미지정)
    expect(c1.querySelector('[data-element="bundle-time-slots"]')).toBeNull();
  });

  it("season_consult_3 — 컨설팅 3회 + 시기 슬롯 라벨", () => {
    const { container } = render(<BundlePackageVisualizer />);
    const c3 = container.querySelector('[data-product-kind="season_consult_3"]')!;
    const parts = c3.querySelectorAll('[data-element="bundle-part"]');
    expect(parts).toHaveLength(2);
    expect(parts[1].textContent).toContain("1:1 컨설팅 3회");
    const timeSlots = c3.querySelector('[data-element="bundle-time-slots"]');
    expect(timeSlots, "시기 슬롯 라벨 미노출").not.toBeNull();
    expect(timeSlots!.textContent).toContain("6월 모의평가 이후");
    expect(timeSlots!.textContent).toContain("9월 모의평가 이후");
    expect(timeSlots!.textContent).toContain("수능 이후");
  });

  it("season_consult_1 가격 비교 — 단건 합산 ₩209,000 → 패키지 ₩190,000 → 절약 ₩19,000", () => {
    const { container } = render(<BundlePackageVisualizer />);
    const c1 = container.querySelector('[data-product-kind="season_consult_1"]')!;
    const cmp = c1.querySelector('[data-element="bundle-price-comparison"]')!;
    expect(cmp.textContent).toContain("209,000"); // 단건 합산
    expect(cmp.textContent).toContain("190,000"); // 패키지
    const savings = c1.querySelector('[data-element="bundle-savings-line"]');
    expect(savings, "절약 라인 미노출").not.toBeNull();
    expect(savings!.textContent).toContain("19,000");
    // BUG-017 회귀 가드: 9.5x 부풀린 ₩180,000 잔존 X
    expect(cmp.textContent).not.toContain("180,000");
  });

  it("season_consult_3 가격 비교 — 단건 합산 ₩569,000 → 패키지 ₩490,000 → 절약 ₩79,000", () => {
    const { container } = render(<BundlePackageVisualizer />);
    const c3 = container.querySelector('[data-product-kind="season_consult_3"]')!;
    const cmp = c3.querySelector('[data-element="bundle-price-comparison"]')!;
    expect(cmp.textContent).toContain("569,000");
    expect(cmp.textContent).toContain("490,000");
    const savings = c3.querySelector('[data-element="bundle-savings-line"]');
    expect(savings!.textContent).toContain("79,000");
  });

  it("결제 CTA — /payment 로 이동", () => {
    const { container } = render(<BundlePackageVisualizer />);
    const links = container.querySelectorAll('a[href="/payment"]');
    expect(links).toHaveLength(2); // 카드별 1개씩
  });

  it("data-component='bundle-package-visualizer' 섹션 노출 (E2E 셀렉터)", () => {
    const { container } = render(<BundlePackageVisualizer />);
    const section = container.querySelector('[data-component="bundle-package-visualizer"]');
    expect(section).not.toBeNull();
    expect(section!.textContent).toContain("번들 = 단건의 조합");
  });
});
