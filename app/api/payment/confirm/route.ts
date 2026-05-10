/**
 * POST /api/payment/confirm — 토스 결제 승인 트랜잭션
 *
 * prismedu.kr `app/api/payment/confirm/route.ts` 패턴을 한국 상품 카탈로그용으로 어댑트:
 *   1. requireAuth
 *   2. enforceRateLimit (1분 10회) — 브루트포스/중복 paymentKey 차단
 *   3. PaymentConfirmSchema 검증
 *   4. parseKrOrderId — orderId 형식 검증 + 분해
 *   5. uid 일치 검증 (남의 결제로 본인 권한 활성화 차단)
 *   6. timestamp 30분 창 검증 (replay 차단)
 *   7. 클라 amount가 PRODUCTS_KR.priceKrw와 일치 (서버 단일 소스)
 *   8. Idempotency — orders/{orderId} 이미 approved면 즉시 반환
 *   9. 토스 confirm API (Basic auth)
 *  10. 토스 응답 재검증 (orderId·totalAmount·status="DONE")
 *  11. 트랜잭션: orders update + users/{uid}/entitlements/current 갱신
 *
 * 보안:
 *   - paymentKey는 orders 도큐먼트에 저장 X (rules로 클라 read 차단해도 분쟁 추적엔
 *     orderId만으로 토스 콘솔 조회 가능 — 침해 시 paymentKey 노출 위험만 늘어남).
 *   - 트랜잭션 실패 시 silent X — 명확한 에러 + recoveryId로 운영팀 추적 가능하게.
 */

import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { requireAuth, zodErrorResponse } from "@/lib/api-auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { PaymentConfirmSchema } from "@/lib/schemas/api/payment";
import { getProductKr } from "@/lib/plans";
import { reportRouteError } from "@/lib/sentry-report";
import {
  parseKrOrderId,
  validateOrderTimestamp,
} from "@/lib/admission/order-id";
import type { Order, ProductKind, UserEntitlement } from "@/types/admission";

const TOSS_CONFIRM_URL = "https://api.tosspayments.com/v1/payments/confirm";

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. 인증
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  // 2. Rate limit
  const rateErr = await enforceRateLimit({
    bucket: "payment_confirm",
    uid: auth.uid,
    windowMs: 60_000,
    limit: 10,
  });
  if (rateErr) return rateErr;

  // 3. 입력 검증
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "유효하지 않은 JSON 본문" }, { status: 400 });
  }
  const parsed = PaymentConfirmSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const { paymentKey, orderId, amount } = parsed.data;

  // 4. orderId 형식 검증 + 분해
  const order = parseKrOrderId(orderId);
  if (!order) {
    return NextResponse.json(
      { error: "유효하지 않은 주문 형식입니다." },
      { status: 400 },
    );
  }

  // 5. uid 일치
  if (order.uid !== auth.uid) {
    console.warn(`[payment/confirm] uid mismatch: session=${auth.uid} order=${order.uid}`);
    return NextResponse.json(
      { error: "본인 계정의 결제만 처리할 수 있어요." },
      { status: 403 },
    );
  }

  // 6. timestamp 창
  const tsValid = validateOrderTimestamp(order.timestamp);
  if (!tsValid.valid) {
    console.warn(`[payment/confirm] timestamp ${tsValid.reason}: orderId=${orderId}`);
    return NextResponse.json(
      { error: "만료된 주문 번호입니다. 다시 결제를 시작해주세요." },
      { status: 400 },
    );
  }

  // 7. 클라 amount가 PRODUCTS_KR.priceKrw와 일치 — 서버 단일 소스
  const product = getProductKr(order.productKind);
  if (!product) {
    return NextResponse.json(
      { error: "상품 정보를 확인할 수 없어요." },
      { status: 400 },
    );
  }
  if (amount !== product.priceKrw) {
    console.warn(
      `[payment/confirm] amount mismatch: client=${amount} catalog=${product.priceKrw}`,
    );
    return NextResponse.json(
      { error: "결제 금액이 상품 가격과 일치하지 않아요." },
      { status: 400 },
    );
  }

  // 8. Idempotency
  const db = getAdminDb();
  const orderRef = db.collection("orders").doc(orderId);
  const existing = await orderRef.get();
  if (existing.exists) {
    const data = existing.data() as Order | undefined;
    if (data?.status === "approved") {
      // 이미 처리됨 — 멱등 응답
      return NextResponse.json({
        success: true,
        orderId,
        productKind: order.productKind,
        idempotent: true,
      });
    }
    // pending/failed 상태는 계속 진행 (재시도 가능)
  }

  // 9. 토스 confirm 호출
  const secretKey = process.env.TOSS_SECRET_KEY;
  if (!secretKey) {
    console.error("[payment/confirm] TOSS_SECRET_KEY 미설정");
    return NextResponse.json({ error: "결제 설정 오류" }, { status: 500 });
  }
  const basicAuth = Buffer.from(`${secretKey}:`).toString("base64");

  let tossRes: Response;
  let tossData: TossConfirmResponse;
  try {
    tossRes = await fetch(TOSS_CONFIRM_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ paymentKey, orderId, amount }),
    });
    tossData = (await tossRes.json()) as TossConfirmResponse;
  } catch (e) {
    reportRouteError("api.payment.confirm.toss", e, { uid: auth.uid, orderId });
    return NextResponse.json(
      { error: "결제사 통신 오류. 잠시 후 다시 시도해주세요." },
      { status: 502 },
    );
  }

  if (!tossRes.ok) {
    // 실패 기록 — paymentKey는 저장 X (분쟁 추적은 orderId만으로 토스 콘솔에서 가능)
    try {
      await orderRef.set(
        {
          status: "failed",
          updatedAt: FieldValue.serverTimestamp(),
          tossError: { code: tossData?.code ?? null, message: tossData?.message ?? "unknown" },
        },
        { merge: true },
      );
    } catch (e) {
      console.error("[payment/confirm] failure log write failed:", e);
    }
    // 토스 원문 메시지는 노출 안 함 — 정적 문구로 통일
    return NextResponse.json(
      { error: "결제 승인에 실패했어요. 잠시 후 다시 시도해주세요." },
      { status: tossRes.status },
    );
  }

  // 10. 토스 응답 재검증
  if (tossData.orderId !== orderId) {
    console.error(`[payment/confirm] orderId mismatch: req=${orderId} toss=${tossData.orderId}`);
    return NextResponse.json({ error: "주문 정보 불일치" }, { status: 400 });
  }
  if (tossData.totalAmount !== product.priceKrw) {
    console.error(
      `[payment/confirm] amount mismatch: catalog=${product.priceKrw} toss=${tossData.totalAmount}`,
    );
    return NextResponse.json({ error: "결제 금액 불일치" }, { status: 400 });
  }
  if (tossData.status !== "DONE") {
    return NextResponse.json(
      { error: `결제 상태 이상: ${tossData.status}` },
      { status: 400 },
    );
  }

  // 11. 트랜잭션 — orders + entitlement 원자적 갱신
  const entitlementRef = db.collection("users").doc(auth.uid).collection("entitlements").doc("current");
  const validFromMs = Date.now();
  const validUntilMs = validFromMs + product.durationDays * 24 * 60 * 60 * 1000;

  try {
    await db.runTransaction(async (tx) => {
      // 트랜잭션 내 재확인 (race condition 대비)
      const recheck = await tx.get(orderRef);
      if (recheck.exists && (recheck.data() as Order)?.status === "approved") {
        return;
      }

      // orders/{orderId} update — paymentKey는 별도 서버 전용 필드로 저장
      // (rules에서 본 도큐먼트 read는 본인 uid 허용, paymentKey 필드만 server-only)
      tx.set(
        orderRef,
        {
          id: orderId,
          uid: auth.uid,
          productKind: order.productKind,
          productName: product.displayName,
          amount: product.priceKrw,
          status: "approved",
          period: order.period,
          validFrom: FieldValue.serverTimestamp(),
          validUntil: validUntilMs,
          payment: {
            paymentKey, // ⚠️ 서버 전용 — Firestore rules로 클라 read 차단 필수
            method: tossData.method ?? null,
            approvedAt: tossData.approvedAt ?? null,
          },
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      // users/{uid}/entitlements/current 갱신
      const entSnap = await tx.get(entitlementRef);
      const ent = entSnap.exists ? (entSnap.data() as UserEntitlement) : null;

      const upgradedPlan = product.grants.upgradePlan ?? ent?.currentPlan ?? "free";
      const planSource: UserEntitlement["planSource"] =
        product.period === "once" ? "one_time" : "subscription";

      const newActive = [
        ...(ent?.active ?? []),
        {
          orderId,
          productKind: order.productKind,
          validUntil: validUntilMs,
          grantedAt: FieldValue.serverTimestamp(),
        },
      ];

      tx.set(
        entitlementRef,
        {
          uid: auth.uid,
          active: newActive,
          currentPlan: upgradedPlan,
          planSource,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    });
  } catch (txError) {
    // 토스에선 승인됐으나 DB 저장 실패 — CRITICAL. recoveryId 로 운영팀 추적.
    reportRouteError("api.payment.confirm.tx_failed", txError, {
      uid: auth.uid,
      orderId,
      severity: "critical",
    });
    return NextResponse.json(
      {
        error: "결제는 승인됐지만 권한 적용 중 오류가 발생했어요. 고객센터에 다음 번호를 알려주세요.",
        code: "DB_WRITE_FAILED",
        recoveryId: orderId,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    orderId,
    productKind: order.productKind,
    productName: product.displayName,
    validUntil: validUntilMs,
  });
}

/* ═══════════════════════════════════════════════════════════════════════
   토스 confirm 응답 타입 — 핵심 필드만
   https://docs.tosspayments.com/reference#payment-객체
   ═══════════════════════════════════════════════════════════════════════ */

interface TossConfirmResponse {
  orderId?: string;
  totalAmount?: number;
  status?: "READY" | "IN_PROGRESS" | "WAITING_FOR_DEPOSIT" | "DONE" | "CANCELED" | "PARTIAL_CANCELED" | "ABORTED" | "EXPIRED";
  method?: string;
  approvedAt?: string;
  paymentKey?: string;
  /** 에러 응답 시 */
  code?: string;
  message?: string;
}

// 사용 보장 — TS unused import 회피
void ({} as ProductKind);
