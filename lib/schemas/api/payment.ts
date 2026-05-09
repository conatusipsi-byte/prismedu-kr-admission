/**
 * /api/payment/* + /api/orders 입력 스키마
 *
 * 토스페이먼츠 paymentKey/orderId 형식을 따름.
 */

import { z } from "zod";

/* ═══════════════════════════════════════════════════════════════════════
   POST /api/payment/request
   ═══════════════════════════════════════════════════════════════════════ */

export const PaymentRequestSchema = z.object({
  productKind: z.enum([
    "report_one",
    "season_pass",
    "consult_one",
    "subscription_pro",
    "subscription_elite",
  ]),
  /** 결제 주기 — 단건은 once, 구독은 monthly/yearly */
  period: z.enum(["once", "monthly", "yearly"]).default("once"),
  /**
   * 결제 완료 후 사용자를 보낼 절대 URL. 토스 success/fail callback에 그대로 전달.
   *
   * 보안:
   *   - 동일 출처(NEXT_PUBLIC_SITE_URL)만 허용 — open redirect 차단.
   *   - 라우트가 서버에서 출처 검증 후 토스에 전달.
   */
  returnUrl: z.string().url().max(2048).optional(),
  /**
   * P-001 컨텍스트 — 사용자가 결제 진입 시 표본 부족 학과 결과 페이지에서 왔는지 등.
   * 일부 상품(report_one)이 학과를 직접 지정하지 않으므로 보통 false.
   */
  targetingInsufficientSampleDept: z.boolean().optional(),
});

/* ═══════════════════════════════════════════════════════════════════════
   POST /api/payment/confirm
   ═══════════════════════════════════════════════════════════════════════ */

export const PaymentConfirmSchema = z.object({
  paymentKey: z.string().min(1).max(256),
  orderId: z.string().min(1).max(256),
  amount: z.number().positive().max(10_000_000),
});

/* ═══════════════════════════════════════════════════════════════════════
   POST /api/payment/cancel — 결제 취소·환불
   ═══════════════════════════════════════════════════════════════════════ */

export const PaymentCancelSchema = z.object({
  orderId: z.string().min(1).max(256),
  reason: z.string().min(1).max(500),
  /** 부분 환불 금액 (전체 환불 시 미지정) */
  cancelAmount: z.number().positive().optional(),
});

/* ═══════════════════════════════════════════════════════════════════════
   GET /api/orders
   ═══════════════════════════════════════════════════════════════════════ */

export const OrdersListQuerySchema = z.object({
  status: z.enum(["pending", "approved", "failed", "refunded", "cancelled"]).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
});
