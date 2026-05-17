/**
 * POST /api/payment/confirm — 토스 결제 승인 + 권한 부여 (Supabase 버전).
 *
 *   1. requireAuth
 *   2. enforceRateLimit (1분 10회)
 *   3. PaymentConfirmSchema 검증
 *   4. parseKrOrderId — orderId 형식 검증 + 분해
 *   5. uid 일치 검증
 *   6. timestamp 30분 창
 *   7. 클라 amount 가 PRODUCTS_KR.priceKrw 와 일치
 *   8. Idempotency — orders.status 이미 approved 면 즉시 반환
 *   9. 토스 confirm API
 *  10. 토스 응답 재검증
 *  11. orders + user_entitlements 갱신 (Postgres — atomic transaction 은 별도 RPC 로 보강 가능)
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase-server";
import { requireAuth, zodErrorResponse } from "@/lib/api-auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { PaymentConfirmSchema } from "@/lib/schemas/api/payment";
import { getProductKr } from "@/lib/plans";
import { reportRouteError } from "@/lib/sentry-report";
import {
  parseKrOrderId,
  validateOrderTimestamp,
} from "@/lib/admission/order-id";
import type { UserEntitlement } from "@/types/admission";

const TOSS_CONFIRM_URL = "https://api.tosspayments.com/v1/payments/confirm";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const rateErr = await enforceRateLimit({
    bucket: "payment_confirm",
    uid: auth.uid,
    windowMs: 60_000,
    limit: 10,
  });
  if (rateErr) return rateErr;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "유효하지 않은 JSON 본문" }, { status: 400 });
  }
  const parsed = PaymentConfirmSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const { paymentKey, orderId, amount } = parsed.data;

  const order = parseKrOrderId(orderId);
  if (!order) {
    return NextResponse.json(
      { error: "유효하지 않은 주문 형식입니다." },
      { status: 400 },
    );
  }

  if (order.uid !== auth.uid) {
    console.warn(`[payment/confirm] uid mismatch: session=${auth.uid} order=${order.uid}`);
    return NextResponse.json(
      { error: "본인 계정의 결제만 처리할 수 있어요." },
      { status: 403 },
    );
  }

  const tsValid = validateOrderTimestamp(order.timestamp);
  if (!tsValid.valid) {
    console.warn(`[payment/confirm] timestamp ${tsValid.reason}: orderId=${orderId}`);
    return NextResponse.json(
      { error: "만료된 주문 번호입니다. 다시 결제를 시작해주세요." },
      { status: 400 },
    );
  }

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

  const sb = getAdminSupabase();

  // 8. Idempotency
  const { data: existing } = await sb
    .from("orders")
    .select("status")
    .eq("id", orderId)
    .maybeSingle();
  if (existing && (existing as { status: string }).status === "approved") {
    return NextResponse.json({
      success: true,
      orderId,
      productKind: order.productKind,
      idempotent: true,
    });
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
    try {
      await sb
        .from("orders")
        .update({
          status: "failed",
          payment: { tossError: { code: tossData?.code ?? null, message: tossData?.message ?? "unknown" } },
        })
        .eq("id", orderId);
    } catch (e) {
      console.error("[payment/confirm] failure log write failed:", e);
    }
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

  // 11. orders + user_entitlements 갱신 (순차)
  //   ⚠️ Postgres transaction 으로 묶으려면 별도 RPC 필요. 본 PR 단계는 순차 — 결제 승인 후
  //   entitlement 실패 시 운영자가 orderId 로 수동 복구 (CRITICAL 알림).
  const validFromMs = Date.now();
  const validUntilMs = validFromMs + product.durationDays * 24 * 60 * 60 * 1000;
  const validUntilIso = new Date(validUntilMs).toISOString();
  const validFromIso = new Date(validFromMs).toISOString();

  try {
    // orders update
    const { error: orderErr } = await sb
      .from("orders")
      .update({
        product_kind: order.productKind,
        product_name: product.displayName,
        amount: product.priceKrw,
        status: "approved",
        period: order.period,
        valid_from: validFromIso,
        valid_until: validUntilIso,
        payment: {
          paymentKey,
          method: tossData.method ?? null,
          approvedAt: tossData.approvedAt ?? null,
        },
      })
      .eq("id", orderId);
    if (orderErr) throw orderErr;

    // user_entitlements 갱신 — 기존 row 있으면 active 배열에 추가, 없으면 insert
    const { data: entRow } = await sb
      .from("user_entitlements")
      .select("active, current_plan, plan_source")
      .eq("user_id", auth.uid)
      .maybeSingle();

    const prevActive = entRow ? (entRow as { active: UserEntitlement["active"] }).active ?? [] : [];
    const upgradedPlan = product.grants.upgradePlan ?? (entRow as { current_plan: string } | null)?.current_plan ?? "free";
    const planSource: UserEntitlement["planSource"] =
      product.period === "once" ? "one_time" : "subscription";
    const newActive = [
      ...prevActive,
      {
        orderId,
        productKind: order.productKind,
        validUntil: validUntilIso as unknown as UserEntitlement["active"][number]["validUntil"],
        grantedAt: new Date().toISOString() as unknown as UserEntitlement["active"][number]["grantedAt"],
      },
    ];

    const { error: entErr } = await sb
      .from("user_entitlements")
      .upsert({
        user_id: auth.uid,
        active: newActive,
        current_plan: upgradedPlan,
        plan_source: planSource,
      });
    if (entErr) throw entErr;
  } catch (txError) {
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

interface TossConfirmResponse {
  orderId?: string;
  totalAmount?: number;
  status?: "READY" | "IN_PROGRESS" | "WAITING_FOR_DEPOSIT" | "DONE" | "CANCELED" | "PARTIAL_CANCELED" | "ABORTED" | "EXPIRED";
  method?: string;
  approvedAt?: string;
  paymentKey?: string;
  code?: string;
  message?: string;
}
