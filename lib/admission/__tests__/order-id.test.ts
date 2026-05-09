/**
 * order-id — 결제 orderId 생성·파싱·timestamp 검증 회귀
 *
 * 검증:
 *   1. buildKrOrderId → parseKrOrderId 라운드트립
 *   2. parseKrOrderId — 정상 입력, 잘못된 형식, productKind/period/uid 변조
 *   3. validateOrderTimestamp — 정상·만료·미래
 *   4. 보안 — uid 형식 강제 (영숫자 20~40자)
 */

import { describe, it, expect } from "vitest";
import {
  buildKrOrderId,
  parseKrOrderId,
  validateOrderTimestamp,
  ORDER_TIMESTAMP_MAX_AGE_MS,
  ORDER_TIMESTAMP_FUTURE_TOLERANCE_MS,
} from "@/lib/admission/order-id";

const VALID_UID = "abc123XYZ456abc123XYZ456abc1"; // 28자 — Firebase 표준

/* ═══════════════════════════════════════════════════════════════════════
   1. 라운드트립
   ═══════════════════════════════════════════════════════════════════════ */

describe("buildKrOrderId → parseKrOrderId 라운드트립", () => {
  it("report_one once → 정상 파싱", () => {
    const id = buildKrOrderId(VALID_UID, "report_one", "once");
    const parsed = parseKrOrderId(id);
    expect(parsed).not.toBeNull();
    expect(parsed!.productKind).toBe("report_one");
    expect(parsed!.period).toBe("once");
    expect(parsed!.uid).toBe(VALID_UID);
    expect(parsed!.timestamp).toBeGreaterThan(Date.now() - 1000);
    expect(parsed!.nonce).toMatch(/^[A-Za-z0-9]{6}$/);
    expect(parsed!.raw).toBe(id);
  });

  it("season_pass once 라운드트립", () => {
    const id = buildKrOrderId(VALID_UID, "season_pass", "once");
    const parsed = parseKrOrderId(id);
    expect(parsed!.productKind).toBe("season_pass");
  });

  it("subscription_pro monthly 라운드트립 (productKind에 underscore 포함)", () => {
    const id = buildKrOrderId(VALID_UID, "subscription_pro", "monthly");
    const parsed = parseKrOrderId(id);
    expect(parsed!.productKind).toBe("subscription_pro");
    expect(parsed!.period).toBe("monthly");
  });

  it("subscription_elite yearly 라운드트립", () => {
    const id = buildKrOrderId(VALID_UID, "subscription_elite", "yearly");
    const parsed = parseKrOrderId(id);
    expect(parsed!.productKind).toBe("subscription_elite");
    expect(parsed!.period).toBe("yearly");
  });

  it("동시 호출도 nonce 차이로 구분 (충돌 회피)", () => {
    const id1 = buildKrOrderId(VALID_UID, "report_one", "once");
    const id2 = buildKrOrderId(VALID_UID, "report_one", "once");
    expect(id1).not.toBe(id2);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   2. 잘못된 입력 — null 반환
   ═══════════════════════════════════════════════════════════════════════ */

describe("parseKrOrderId — 잘못된 입력 거부", () => {
  it("빈 문자열", () => expect(parseKrOrderId("")).toBeNull());
  it("undefined / null 형 입력", () => {
    // @ts-expect-error 의도적
    expect(parseKrOrderId(undefined)).toBeNull();
    // @ts-expect-error 의도적
    expect(parseKrOrderId(null)).toBeNull();
  });
  it("prismedu.kr 포맷 (PRISM_) 거부", () => {
    expect(parseKrOrderId(`PRISM_pro_monthly_${VALID_UID}_1730000000000`)).toBeNull();
  });
  it("알 수 없는 productKind", () => {
    expect(parseKrOrderId(`kr_unknown_kind_once_${VALID_UID}_1730000000000_a1B2c3`)).toBeNull();
  });
  it("알 수 없는 period", () => {
    expect(parseKrOrderId(`kr_report_one_weekly_${VALID_UID}_1730000000000_a1B2c3`)).toBeNull();
  });
  it("uid 너무 짧음 (19자)", () => {
    expect(parseKrOrderId(`kr_report_one_once_abc123XYZ456abc123x_1730000000000_a1B2c3`)).toBeNull();
  });
  it("uid 너무 김 (41자)", () => {
    const long = "a".repeat(41);
    expect(parseKrOrderId(`kr_report_one_once_${long}_1730000000000_a1B2c3`)).toBeNull();
  });
  it("uid에 특수문자", () => {
    expect(parseKrOrderId(`kr_report_one_once_abc-123-XYZ456abc123XYZ456_1730000000000_a1B2c3`)).toBeNull();
  });
  it("timestamp 너무 짧음", () => {
    expect(parseKrOrderId(`kr_report_one_once_${VALID_UID}_123_a1B2c3`)).toBeNull();
  });
  it("nonce 5자 (6자 미달)", () => {
    expect(parseKrOrderId(`kr_report_one_once_${VALID_UID}_1730000000000_a1B2c`)).toBeNull();
  });
  it("nonce 7자 (6자 초과)", () => {
    expect(parseKrOrderId(`kr_report_one_once_${VALID_UID}_1730000000000_a1B2c3D`)).toBeNull();
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   3. uid 형식 강제 (buildKrOrderId)
   ═══════════════════════════════════════════════════════════════════════ */

describe("buildKrOrderId — uid 형식 강제", () => {
  it("정상 uid (28자) — 통과", () => {
    expect(() => buildKrOrderId(VALID_UID, "report_one", "once")).not.toThrow();
  });
  it("19자 uid → throw", () => {
    expect(() => buildKrOrderId("short_uid_too_short", "report_one", "once")).toThrow(/uid/);
  });
  it("특수문자 포함 uid → throw", () => {
    expect(() => buildKrOrderId("abc-123-with-dashes-here-12345", "report_one", "once")).toThrow();
  });
  it("빈 uid → throw", () => {
    expect(() => buildKrOrderId("", "report_one", "once")).toThrow();
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   4. validateOrderTimestamp
   ═══════════════════════════════════════════════════════════════════════ */

describe("validateOrderTimestamp", () => {
  const now = 1_730_000_000_000;

  it("정확히 now 입력 → valid=true", () => {
    expect(validateOrderTimestamp(now, now)).toEqual({ valid: true });
  });

  it("10분 전 → valid=true (창 30분 내)", () => {
    expect(validateOrderTimestamp(now - 10 * 60 * 1000, now)).toEqual({ valid: true });
  });

  it("31분 전 → expired", () => {
    expect(validateOrderTimestamp(now - 31 * 60 * 1000, now)).toEqual({
      valid: false,
      reason: "expired",
    });
  });

  it("1분 미래 (시계 skew) → valid=true (관용 2분)", () => {
    expect(validateOrderTimestamp(now + 60 * 1000, now)).toEqual({ valid: true });
  });

  it("3분 미래 → future (관용 초과)", () => {
    expect(validateOrderTimestamp(now + 3 * 60 * 1000, now)).toEqual({
      valid: false,
      reason: "future",
    });
  });

  it("MAX_AGE 정확히 → 경계 통과 (cutoff 직전)", () => {
    expect(validateOrderTimestamp(now - ORDER_TIMESTAMP_MAX_AGE_MS, now)).toEqual({ valid: true });
  });

  it("MAX_AGE + 1ms → expired (경계 직후)", () => {
    expect(validateOrderTimestamp(now - ORDER_TIMESTAMP_MAX_AGE_MS - 1, now)).toEqual({
      valid: false,
      reason: "expired",
    });
  });

  it("FUTURE_TOLERANCE 정확히 → 경계 통과", () => {
    expect(
      validateOrderTimestamp(now + ORDER_TIMESTAMP_FUTURE_TOLERANCE_MS, now),
    ).toEqual({ valid: true });
  });
});
