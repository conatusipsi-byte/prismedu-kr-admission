/**
 * lib/plans.ts — 얼리버드 가격 + 번들 카탈로그 회귀 (QA round 2 ④, 2026-05-25).
 */

import { describe, it, expect } from "vitest";
import {
  PRODUCTS_KR,
  getEffectivePriceKrw,
  isEarlybirdActive,
  TIME_SLOT_VALID_FROM,
  TIME_SLOT_LABELS,
} from "../plans";

describe("PRODUCTS_KR 카탈로그", () => {
  it("consult_one 활성화 + 가격 300,000 (2026-05-30 변경)", () => {
    const p = PRODUCTS_KR.consult_one;
    expect(p.enabled).toBe(true);
    // 클라이언트 요청 (방준현): 180,000 → 300,000.
    expect(p.priceKrw).toBe(300000);
    expect(p.isPricePlaceholder).toBe(false);
    expect(p.shortDescription).toContain("코나투스 입시 컨설턴트");
    expect(p.shortDescription).not.toContain("방준현");
  });

  it("season_pass — earlybirdPriceKrw=29000 / regularPriceKrw=40000 / earlybirdUntil=2027-03-31", () => {
    const p = PRODUCTS_KR.season_pass;
    expect(p.priceKrw).toBe(29000);
    expect(p.earlybirdPriceKrw).toBe(29000);
    expect(p.regularPriceKrw).toBe(40000);
    expect(p.earlybirdUntil).toBe("2027-03-31");
  });

  it("season_consult_1 — 시즌권 + 컨설팅 1회, type='bundle'", () => {
    const p = PRODUCTS_KR.season_consult_1;
    expect(p.type).toBe("bundle");
    expect(p.priceKrw).toBe(190000);
    expect(p.regularPriceKrw).toBe(300000);
    expect(p.bundleContents).toHaveLength(2);
    expect(p.bundleContents?.[0]).toEqual({ kind: "subscription", count: 1 });
    expect(p.bundleContents?.[1]).toEqual({ kind: "consulting", count: 1 });
  });

  it("season_consult_3 — 시기 지정 컨설팅 3회 (before_june/before_sept/after_csat)", () => {
    const p = PRODUCTS_KR.season_consult_3;
    expect(p.type).toBe("bundle");
    expect(p.priceKrw).toBe(490000);
    expect(p.regularPriceKrw).toBe(700000);
    const consulting = p.bundleContents?.find((c) => c.kind === "consulting");
    expect(consulting?.count).toBe(3);
    expect(consulting?.timeSlots).toEqual(["before_june", "before_sept", "after_csat"]);
  });
});

describe("getEffectivePriceKrw / isEarlybirdActive", () => {
  it("얼리버드 기간 안 → earlybirdPriceKrw 반환", () => {
    const p = PRODUCTS_KR.season_pass;
    const now = new Date("2026-12-01T00:00:00Z");
    expect(getEffectivePriceKrw(p, now)).toBe(29000);
    expect(isEarlybirdActive(p, now)).toBe(true);
  });

  it("얼리버드 종료 후 → regularPriceKrw 반환", () => {
    const p = PRODUCTS_KR.season_pass;
    const now = new Date("2027-04-15T00:00:00Z");
    expect(getEffectivePriceKrw(p, now)).toBe(40000);
    expect(isEarlybirdActive(p, now)).toBe(false);
  });

  it("얼리버드 마지막날 23:59 KST 까지 적용", () => {
    const p = PRODUCTS_KR.season_pass;
    // 2027-03-31 23:30 KST = 2027-03-31 14:30 UTC — 얼리버드 유지
    const last = new Date("2027-03-31T14:30:00Z");
    expect(isEarlybirdActive(p, last)).toBe(true);
    // 2027-04-01 00:30 KST = 2027-03-31 15:30 UTC — 종료
    const after = new Date("2027-03-31T16:00:00Z");
    expect(isEarlybirdActive(p, after)).toBe(false);
  });

  it("얼리버드 없는 상품 (report_one) → priceKrw 그대로 + isEarlybirdActive=false", () => {
    const p = PRODUCTS_KR.report_one;
    expect(getEffectivePriceKrw(p)).toBe(p.priceKrw);
    expect(isEarlybirdActive(p)).toBe(false);
  });
});

describe("TIME_SLOT_VALID_FROM / LABELS", () => {
  it("3종 시기 슬롯 모두 정의", () => {
    expect(TIME_SLOT_VALID_FROM.before_june).toBe("2026-06-01T00:00:00+09:00");
    expect(TIME_SLOT_VALID_FROM.before_sept).toBe("2026-09-01T00:00:00+09:00");
    expect(TIME_SLOT_VALID_FROM.after_csat).toBe("2026-11-14T00:00:00+09:00");
  });

  it("라벨 한글", () => {
    expect(TIME_SLOT_LABELS.before_june).toContain("6월");
    expect(TIME_SLOT_LABELS.before_sept).toContain("9월");
    expect(TIME_SLOT_LABELS.after_csat).toContain("수능");
  });
});
