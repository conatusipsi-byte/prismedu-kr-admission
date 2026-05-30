/**
 * lib/email/templates/payment-receipt — Day 5 회귀 (2026-05-25).
 *
 * 검증:
 *   - subject 가 displayName 포함
 *   - html 에 금액·주문번호·환불 정책 포함
 *   - 상품별 사용 안내 분기 (consult_one / season_consult_1 / season_consult_3 / report_one / season_pass)
 *   - 시기 지정 슬롯 사용 가능일 명시 (6월 1일·9월 1일·11월 14일)
 *   - text fallback 핵심 정보 포함
 *   - 24시간 취소 정책 노출
 */

import { describe, it, expect } from "vitest";
import { buildPaymentReceiptEmail } from "../templates/payment-receipt";
import { PRODUCTS_KR } from "@/lib/plans";

const baseArgs = {
  orderId: "kr_consult_one_once_user-id_1234567890123_abc123",
  amountKrw: 180000,
  approvedAt: "2026-12-01T05:00:00Z",
  paymentMethod: "신용카드",
  validUntilIso: "2027-03-31T14:59:59Z",
  siteUrl: "https://conatusipsi.com",
};

describe("buildPaymentReceiptEmail", () => {
  it("subject 가 상품명 포함", () => {
    const r = buildPaymentReceiptEmail({ ...baseArgs, product: PRODUCTS_KR.consult_one });
    expect(r.subject).toContain("결제 완료");
    // 2026-05-30 클라이언트 요청 (방준현): 컨설팅 명 변경 → "코나투스 1:1 입시컨설팅"
    expect(r.subject).toContain("코나투스 1:1 입시컨설팅");
  });

  it("html — 금액·주문번호·환불 정책 포함", () => {
    const r = buildPaymentReceiptEmail({ ...baseArgs, product: PRODUCTS_KR.consult_one });
    expect(r.html).toContain("180,000");
    expect(r.html).toContain(baseArgs.orderId);
    expect(r.html).toContain("환불 정책");
    expect(r.html).toContain("신용카드");
  });

  it("consult_one — 60일 / 24시간 취소 안내", () => {
    const r = buildPaymentReceiptEmail({ ...baseArgs, product: PRODUCTS_KR.consult_one });
    expect(r.html).toContain("60일");
    expect(r.html).toContain("24시간");
    expect(r.html).toContain("/consulting");
  });

  it("season_consult_1 — 시즌권 즉시 + 컨설팅 1회 + 시기 무관 안내", () => {
    const r = buildPaymentReceiptEmail({
      ...baseArgs,
      amountKrw: 190000,
      product: PRODUCTS_KR.season_consult_1,
    });
    expect(r.html).toContain("시즌권 즉시 활성화");
    expect(r.html).toContain("1:1 컨설팅 1회");
    expect(r.html).toContain("시기 무관");
  });

  it("season_consult_3 — 시기별 사용 가능일 (2026-06-01 / 09-01 / 11-14)", () => {
    const r = buildPaymentReceiptEmail({
      ...baseArgs,
      amountKrw: 490000,
      product: PRODUCTS_KR.season_consult_3,
    });
    expect(r.html).toContain("1:1 컨설팅 3회");
    expect(r.html).toContain("2026-06-01");
    expect(r.html).toContain("2026-09-01");
    expect(r.html).toContain("2026-11-14");
    expect(r.html).toContain("6월 모의평가 이후");
    expect(r.html).toContain("9월 모의평가 이후");
    expect(r.html).toContain("수능 이후");
    expect(r.html).toContain("취소 시 해당 시기 슬롯 자동 복구");
  });

  it("season_pass — 즉시 활성화 + 180일 안내", () => {
    const r = buildPaymentReceiptEmail({
      ...baseArgs,
      amountKrw: 29000,
      product: PRODUCTS_KR.season_pass,
    });
    expect(r.html).toContain("즉시 활성화");
    expect(r.html).toContain("180일");
    expect(r.html).toContain("/analysis");
  });

  it("report_one — 30일간 무제한 (정책 변경 2026-05-30)", () => {
    const r = buildPaymentReceiptEmail({
      ...baseArgs,
      amountKrw: 9900,
      product: PRODUCTS_KR.report_one,
    });
    // 클라이언트 요청: "1회 사용 후 30일 보관" → "30일간 무제한 재실행"
    expect(r.html).toContain("30일간 무제한");
    expect(r.html).toContain("/analysis");
    // 회귀 가드: 옛 "30일 보관" 문구가 남아있지 않음
    expect(r.html).not.toContain("30일 보관");
  });

  it("text fallback — 주문번호·금액·상품명 포함", () => {
    const r = buildPaymentReceiptEmail({ ...baseArgs, product: PRODUCTS_KR.consult_one });
    expect(r.text).toContain("180,000");
    expect(r.text).toContain(baseArgs.orderId);
    // 2026-05-30 컨설팅 명 변경
    expect(r.text).toContain("코나투스 1:1 입시컨설팅");
    expect(r.text).toContain("conatusipsi@gmail.com");
  });

  it("paymentMethod 없을 때 — 행 누락 (HTML 깨짐 X)", () => {
    const r = buildPaymentReceiptEmail({
      ...baseArgs,
      paymentMethod: undefined,
      product: PRODUCTS_KR.consult_one,
    });
    // "결제 수단" 행이 렌더링되지 않아야 함
    expect(r.html).not.toContain("결제 수단");
    expect(r.html).toContain("180,000"); // 다른 정보는 유지
  });

  it("결제 일시 KST 변환 (UTC + 9)", () => {
    // 2026-12-01T05:00:00Z = 2026-12-01 14:00 KST
    const r = buildPaymentReceiptEmail({ ...baseArgs, product: PRODUCTS_KR.consult_one });
    expect(r.html).toContain("2026.12.01 14:00 KST");
  });

  it("유효 기간 — 날짜만 노출 (날짜·시간 혼동 차단)", () => {
    const r = buildPaymentReceiptEmail({
      ...baseArgs,
      validUntilIso: "2027-03-31T14:59:59Z",
      product: PRODUCTS_KR.season_pass,
    });
    expect(r.html).toContain("2027-03-31 까지");
  });
});
