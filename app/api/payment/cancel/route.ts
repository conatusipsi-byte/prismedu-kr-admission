/**
 * POST /api/payment/cancel — 결제 취소·환불
 *
 * 흐름:
 *   1. requireAuth + Rate limit
 *   2. PaymentCancelSchema 검증
 *   3. orders/{orderId} 조회 + 본인 주문 + approved 상태 검증
 *   4. 환불 가능 기간 확인 (현 단계 14일 — P-014로 정책 확정 후 조정)
 *   5. 토스 cancel API 호출 (Basic auth)
 *   6. 트랜잭션: orders.status=refunded + entitlement 롤백
 *
 * 부분 환불은 본 단계에선 미지원 (cancelAmount 무시) — 정책 확정 후 추가.
 */

import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { requireAuth, zodErrorResponse } from "@/lib/api-auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { PaymentCancelSchema } from "@/lib/schemas/api/payment";
import { reportRouteError } from "@/lib/sentry-report";
import type { Order, UserEntitlement } from "@/types/admission";

const TOSS_CANCEL_URL = (paymentKey: string) =>
  `https://api.tosspayments.com/v1/payments/${encodeURIComponent(paymentKey)}/cancel`;

const REFUND_WINDOW_MS = 14 * 24 * 60 * 60 * 1000; // 14일 (P-014 확정 시 조정)

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const rateErr = await enforceRateLimit({
    bucket: "payment_cancel",
    uid: auth.uid,
    windowMs: 60_000,
    limit: 5,
  });
  if (rateErr) return rateErr;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "유효하지 않은 JSON 본문" }, { status: 400 });
  }
  const parsed = PaymentCancelSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const { orderId, reason } = parsed.data;

  const db = getAdminDb();
  const orderRef = db.collection("orders").doc(orderId);
  const snap = await orderRef.get();

  if (!snap.exists) {
    return NextResponse.json({ error: "주문을 찾을 수 없습니다." }, { status: 404 });
  }
  const order = snap.data() as Order & {
    payment?: { paymentKey?: string; approvedAt?: string };
    validFrom?: { toMillis?: () => number };
  };

  // 본인 주문만
  if (order.uid !== auth.uid) {
    // 열거 차단 — 404 동일
    return NextResponse.json({ error: "주문을 찾을 수 없습니다." }, { status: 404 });
  }

  // approved 상태만 환불 가능
  if (order.status !== "approved") {
    return NextResponse.json(
      { error: `현재 상태(${order.status})에서는 환불할 수 없습니다.` },
      { status: 400 },
    );
  }

  // 환불 가능 기간
  const approvedAtMs = order.validFrom?.toMillis?.() ?? 0;
  if (approvedAtMs > 0 && Date.now() - approvedAtMs > REFUND_WINDOW_MS) {
    return NextResponse.json(
      { error: "환불 가능 기간(14일)이 지났습니다. 고객센터로 문의해주세요." },
      { status: 400 },
    );
  }

  const paymentKey = order.payment?.paymentKey;
  if (!paymentKey) {
    console.error(`[payment/cancel] paymentKey 누락 orderId=${orderId}`);
    return NextResponse.json(
      { error: "환불 처리에 필요한 정보가 누락됐어요. 고객센터로 문의해주세요." },
      { status: 500 },
    );
  }

  // 토스 cancel
  const secretKey = process.env.TOSS_SECRET_KEY;
  if (!secretKey) {
    console.error("[payment/cancel] TOSS_SECRET_KEY 미설정");
    return NextResponse.json({ error: "결제 설정 오류" }, { status: 500 });
  }
  const basicAuth = Buffer.from(`${secretKey}:`).toString("base64");

  let tossRes: Response;
  let tossData: { code?: string; message?: string; transactionKey?: string };
  try {
    tossRes = await fetch(TOSS_CANCEL_URL(paymentKey), {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ cancelReason: reason }),
    });
    tossData = (await tossRes.json()) as typeof tossData;
  } catch (e) {
    reportRouteError("api.payment.cancel.toss", e, { uid: auth.uid, orderId });
    return NextResponse.json(
      { error: "결제사 통신 오류. 잠시 후 다시 시도해주세요." },
      { status: 502 },
    );
  }

  if (!tossRes.ok) {
    return NextResponse.json(
      { error: "환불 처리에 실패했어요. 잠시 후 다시 시도해주세요." },
      { status: tossRes.status },
    );
  }

  // 트랜잭션 — orders.refunded + entitlement 롤백
  const entitlementRef = db.collection("users").doc(auth.uid).collection("entitlements").doc("current");
  try {
    await db.runTransaction(async (tx) => {
      tx.set(
        orderRef,
        {
          status: "refunded",
          refund: {
            refundedAt: FieldValue.serverTimestamp(),
            amount: order.amount,
            reason,
            cancelKey: tossData.transactionKey ?? null,
          },
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      // entitlement.active 에서 본 orderId 제거. 모든 active 권한이 사라지면 currentPlan = free.
      const entSnap = await tx.get(entitlementRef);
      if (!entSnap.exists) return;
      const ent = entSnap.data() as UserEntitlement;
      const remaining = (ent.active ?? []).filter((a) => a.orderId !== orderId);

      tx.set(
        entitlementRef,
        {
          active: remaining,
          // 남은 권한이 없으면 free, 있으면 가장 높은 plan 유지 (가장 최근 grant)
          currentPlan: remaining.length === 0 ? "free" : ent.currentPlan,
          planSource: remaining.length === 0 ? "free" : ent.planSource,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    });
  } catch (e) {
    reportRouteError("api.payment.cancel.tx_failed", e, {
      uid: auth.uid,
      orderId,
      severity: "critical",
    });
    return NextResponse.json(
      {
        error: "환불은 처리됐지만 권한 갱신 중 오류가 발생했어요. 고객센터에 문의해주세요.",
        code: "DB_WRITE_FAILED",
        recoveryId: orderId,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, orderId, refundedAmount: order.amount });
}
