/**
 * calculateBundleSavings — BUG-017 회귀 (2026-05-25).
 *
 * 결함: season_consult_1 highlights 에 "₩180,000 절약" 정적 카피 — 실제는 ₩19,000.
 *      9.5배 부풀려진 표기 (P-002 정직성 직접 위반).
 *
 * 수정: 정적 카피 제거 + calculateBundleSavings 동적 계산.
 *
 * 검증:
 *   - season_consult_1 얼리버드 = ₩19,000 절약 정확
 *   - season_consult_3 얼리버드 = ₩79,000 절약 정확
 *   - 얼리버드 종료 후 → savings 가 음수 (번들이 단건보다 비쌈) → UI 미노출 책임
 *   - 부풀린 ₩180,000 가 반환되지 않도록 회귀 가드
 */

import { describe, it, expect } from "vitest";
import { PRODUCTS_KR, calculateBundleSavings } from "../plans";

describe("calculateBundleSavings (BUG-017)", () => {
  // 얼리버드 기간 안 (default earlybirdUntil = 2027-03-31)
  const EARLYBIRD = new Date("2026-12-01T00:00:00Z");
  // 얼리버드 종료 후
  const AFTER_EB = new Date("2027-04-15T00:00:00Z");

  // 2026-05-30 클라이언트 요청 (방준현): consult_one 180,000 → 300,000.
  //   bundle 가격은 미변경 — 단건 합산이 오르며 절약액 자동 재계산.

  it("season_consult_1 얼리버드 — individualTotal=₩329,000, savings=₩139,000", () => {
    const r = calculateBundleSavings(PRODUCTS_KR.season_consult_1, EARLYBIRD);
    expect(r).not.toBeNull();
    expect(r!.individualTotal).toBe(29000 + 300000); // season_pass eb + 신 consult_one
    expect(r!.bundlePrice).toBe(190000);
    expect(r!.savings).toBe(139000);
    // BUG-017 회귀 가드: 정적 ₩180,000 카피가 잔존하지 않음
    expect(r!.savings).not.toBe(180000);
  });

  it("season_consult_3 얼리버드 — individualTotal=₩929,000, savings=₩439,000", () => {
    const r = calculateBundleSavings(PRODUCTS_KR.season_consult_3, EARLYBIRD);
    expect(r!.individualTotal).toBe(29000 + 300000 * 3); // 929,000
    expect(r!.bundlePrice).toBe(490000);
    expect(r!.savings).toBe(439000);
  });

  it("얼리버드 종료 후 season_consult_1 — savings 양수 (번들이 단건보다 저렴)", () => {
    const r = calculateBundleSavings(PRODUCTS_KR.season_consult_1, AFTER_EB);
    // 정가: 40,000 (season_pass regular) + 300,000 (consult_one) = 340,000
    // 번들 정가: 300,000
    expect(r!.individualTotal).toBe(40000 + 300000);
    expect(r!.bundlePrice).toBe(300000);
    expect(r!.savings).toBe(40000); // 양수 — 번들이 더 저렴
  });

  it("얼리버드 종료 후 season_consult_3 — savings 양수", () => {
    const r = calculateBundleSavings(PRODUCTS_KR.season_consult_3, AFTER_EB);
    // 정가: 40,000 + 300,000 × 3 = 940,000
    // 번들 정가: 700,000
    expect(r!.individualTotal).toBe(40000 + 300000 * 3);
    expect(r!.bundlePrice).toBe(700000);
    expect(r!.savings).toBe(940000 - 700000); // 240,000
  });

  it("non-bundle 상품 → null", () => {
    expect(calculateBundleSavings(PRODUCTS_KR.report_one)).toBeNull();
    expect(calculateBundleSavings(PRODUCTS_KR.season_pass)).toBeNull();
    expect(calculateBundleSavings(PRODUCTS_KR.consult_one)).toBeNull();
  });

  it("season_consult_1 highlights — 잘못된 절약 카피 제거 확인 (회귀 가드)", () => {
    const h = PRODUCTS_KR.season_consult_1.highlights;
    for (const line of h) {
      expect(line, `highlights '${line}' 에 '절약' 정적 카피 잔존`).not.toContain("절약");
      expect(line).not.toContain("180,000");
      expect(line).not.toContain("180000");
    }
  });
});
