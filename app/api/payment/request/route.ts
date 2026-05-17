/**
 * POST /api/payment/request — 결제 요청 (orderId 발급)
 *
 * prismedu.kr `app/api/payment/request/route.ts` 패턴을 한국 상품 카탈로그용으로 어댑트:
 *   1. requireAuth
 *   2. enforceRateLimit (1분 20회) — 결제창 반복 오픈 억제
 *   3. PaymentRequestSchema 검증
 *   4. PRODUCTS_KR 단일 소스에서 가격 조회 (클라 amount 무시)
 *   5. P-001 게이트 — canPurchaseProductKr (표본 부족 학과 단건 차단)
 *   6. orderId 생성 (lib/admission/order-id.ts)
 *   7. orders/{orderId} pending 도큐먼트 작성 (confirm 라우트 멱등성과 호환)
 *   8. { orderId, amount, orderName, clientKey } 응답
 *
 * 보안:
 *   - amount는 클라에서 안 받음 — 서버 단일 소스(PRODUCTS_KR.priceKrw).
 *   - orderId의 uid는 세션 uid 강제 — 타인 명의 주문 생성 불가.
 *   - returnUrl은 동일 출처만 허용 (open redirect 차단).
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase-server";
import { requireAuth, zodErrorResponse } from "@/lib/api-auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { PaymentRequestSchema } from "@/lib/schemas/api/payment";
import {
  PRODUCTS_KR,
  canPurchaseProductKr,
  getProductKr,
} from "@/lib/plans";
import { reportRouteError } from "@/lib/sentry-report";
import { buildKrOrderId } from "@/lib/admission/order-id";

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. 인증
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  // 2. Rate limit — 결제창 반복 오픈 억제
  const rateErr = await enforceRateLimit({
    bucket: "payment_request",
    uid: auth.uid,
    windowMs: 60_000,
    limit: 20,
  });
  if (rateErr) return rateErr;

  // 3. 입력 검증
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "유효하지 않은 JSON 본문" }, { status: 400 });
  }
  const parsed = PaymentRequestSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const { productKind, period, returnUrl, targetingInsufficientSampleDept } = parsed.data;

  // 4. 상품 메타 + 가격 (서버 단일 소스)
  const product = getProductKr(productKind);
  if (!product || !product.enabled) {
    return NextResponse.json(
      { error: "상품을 찾을 수 없거나 결제가 일시 중지됐습니다." },
      { status: 400 },
    );
  }
  // period 일치 검증 — 카탈로그의 period와 다른 입력 차단
  if (product.period !== period) {
    return NextResponse.json(
      { error: `${product.displayName}의 결제 주기는 ${product.period}만 가능합니다.` },
      { status: 400 },
    );
  }

  // 5. P-001 게이트
  const gate = canPurchaseProductKr(productKind, {
    targetingInsufficientSampleDept: targetingInsufficientSampleDept ?? false,
  });
  if (!gate.allowed) {
    return NextResponse.json({ error: gate.reason }, { status: 400 });
  }

  // 5b. returnUrl 동일 출처 검증 (open redirect 차단)
  if (returnUrl) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (!siteUrl) {
      console.error("[payment/request] NEXT_PUBLIC_SITE_URL 미설정 — returnUrl 검증 불가");
      return NextResponse.json({ error: "결제 설정 오류" }, { status: 500 });
    }
    try {
      const target = new URL(returnUrl);
      const allowed = new URL(siteUrl);
      if (target.origin !== allowed.origin) {
        return NextResponse.json(
          { error: "허용되지 않은 이동 경로입니다." },
          { status: 400 },
        );
      }
    } catch {
      return NextResponse.json({ error: "유효하지 않은 returnUrl" }, { status: 400 });
    }
  }

  // 6. orderId 생성
  let orderId: string;
  try {
    orderId = buildKrOrderId(auth.uid, productKind, period);
  } catch (e) {
    console.error("[payment/request] orderId 생성 실패:", e);
    return NextResponse.json({ error: "결제 준비 실패 (uid 형식 오류)" }, { status: 500 });
  }

  // 7. orders 테이블에 pending row 작성
  const amountKrw = product.priceKrw;
  try {
    const sb = getAdminSupabase();
    const { error } = await sb.from("orders").insert({
      id: orderId,
      user_id: auth.uid,
      product_kind: productKind,
      product_name: product.displayName,
      amount: amountKrw,
      status: "pending",
      period,
      // created_at / updated_at 은 Postgres default now() 가 채움
    });
    if (error) {
      reportRouteError("api.payment.request.db", error, { uid: auth.uid, orderId });
      return NextResponse.json(
        { error: "결제 준비에 실패했어요. 잠시 후 다시 시도해주세요." },
        { status: 503 },
      );
    }
  } catch (e) {
    reportRouteError("api.payment.request.db", e, { uid: auth.uid, orderId });
    return NextResponse.json(
      { error: "결제 준비에 실패했어요. 잠시 후 다시 시도해주세요." },
      { status: 503 },
    );
  }

  // 8. 응답 — 클라가 토스 SDK 호출 시 사용
  // clientKey는 NEXT_PUBLIC_TOSS_CLIENT_KEY로 클라가 직접 가지지만, 일관성 위해 응답에도 동봉.
  return NextResponse.json({
    orderId,
    amount: amountKrw,
    orderName: product.displayName,
    customerKey: auth.uid, // 토스 SDK customerKey 인자
    clientKey: process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? "",
    // 가격 placeholder 알림 (P-002, P-014) — 클라 UI에서 ⚠️ 마커 표시
    isPricePlaceholder: product.isPricePlaceholder,
  });
}

// PRODUCTS_KR 사용 보장 — Vercel build의 unused import 보호
void PRODUCTS_KR;
