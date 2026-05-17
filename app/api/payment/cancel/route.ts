/**
 * POST /api/payment/cancel — 결제 취소·환불 (Supabase).
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase-server";
import { requireAuth, zodErrorResponse } from "@/lib/api-auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { PaymentCancelSchema } from "@/lib/schemas/api/payment";
import { reportRouteError } from "@/lib/sentry-report";
import type { UserEntitlement } from "@/types/admission";

const TOSS_CANCEL_URL = (paymentKey: string) =>
  `https://api.tosspayments.com/v1/payments/${encodeURIComponent(paymentKey)}/cancel`;

const REFUND_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

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

  const sb = getAdminSupabase();

  const { data: orderRow, error: fetchErr } = await sb
    .from("orders")
    .select("user_id, status, amount, valid_from, payment")
    .eq("id", orderId)
    .maybeSingle();
  if (fetchErr || !orderRow) {
    return NextResponse.json({ error: "주문을 찾을 수 없습니다." }, { status: 404 });
  }
  const order = orderRow as {
    user_id: string;
    status: string;
    amount: number;
    valid_from: string | null;
    payment: { paymentKey?: string; approvedAt?: string } | null;
  };

  if (order.user_id !== auth.uid) {
    // 열거 차단 — 404 동일
    return NextResponse.json({ error: "주문을 찾을 수 없습니다." }, { status: 404 });
  }
  if (order.status !== "approved") {
    return NextResponse.json(
      { error: `현재 상태(${order.status})에서는 환불할 수 없습니다.` },
      { status: 400 },
    );
  }

  const approvedAtMs = order.valid_from ? new Date(order.valid_from).getTime() : 0;
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

  // orders + user_entitlements 갱신 (순차)
  try {
    const { error: orderUpdErr } = await sb
      .from("orders")
      .update({
        status: "refunded",
        refund: {
          refundedAt: new Date().toISOString(),
          amount: order.amount,
          reason,
          cancelKey: tossData.transactionKey ?? null,
        },
      })
      .eq("id", orderId);
    if (orderUpdErr) throw orderUpdErr;

    const { data: entRow } = await sb
      .from("user_entitlements")
      .select("active, current_plan, plan_source")
      .eq("user_id", auth.uid)
      .maybeSingle();
    if (entRow) {
      const ent = entRow as { active: UserEntitlement["active"]; current_plan: string; plan_source: string };
      const remaining = (ent.active ?? []).filter((a) => a.orderId !== orderId);
      const { error: entUpdErr } = await sb
        .from("user_entitlements")
        .update({
          active: remaining,
          current_plan: remaining.length === 0 ? "free" : ent.current_plan,
          plan_source: remaining.length === 0 ? "free" : ent.plan_source,
        })
        .eq("user_id", auth.uid);
      if (entUpdErr) throw entUpdErr;
    }
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
