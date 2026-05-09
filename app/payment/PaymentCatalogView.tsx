"use client";

/**
 * PaymentCatalogView — /payment 페이지 본체 (클라이언트)
 *
 * 흐름:
 *   1. PRODUCTS_KR 활성 상품 카드 그리드
 *   2. 카드 CTA 클릭 → POST /api/payment/request → { orderId, amount, ..., clientKey }
 *   3. loadTossPayments(clientKey) → widget.requestPayment({ orderId, ..., successUrl, failUrl })
 *   4. 토스 결제창 → 사용자 액션 → success 또는 fail 페이지로 redirect
 *
 * 토스 SDK는 동적 import — 결제 페이지 진입 시에만 번들 로드.
 *
 * 회귀 (P-002):
 *   - "확정 합격" 표현 0건
 *   - placeholder 가격 마커 카드별 노출
 */

import * as React from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { listEnabledProductsKr, type ProductDefKr } from "@/lib/plans";
import { ProductCard } from "@/components/payment/ProductCard";

export function PaymentCatalogView(): React.ReactElement {
  const products = React.useMemo(() => listEnabledProductsKr(), []);
  const [pendingKind, setPendingKind] = React.useState<ProductDefKr["kind"] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function handlePurchase(kind: ProductDefKr["kind"]): Promise<void> {
    setError(null);
    setPendingKind(kind);
    try {
      const product = products.find((p) => p.kind === kind);
      if (!product) throw new Error("상품을 찾을 수 없어요.");

      // 1. 서버에 orderId·amount 발급 요청
      const reqRes = await fetch("/api/payment/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productKind: kind,
          period: product.period,
          targetingInsufficientSampleDept: false,
        }),
      });
      if (!reqRes.ok) {
        const data = (await reqRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `결제 준비 실패 (${reqRes.status})`);
      }
      const reqData = (await reqRes.json()) as {
        orderId: string;
        amount: number;
        orderName: string;
        customerKey: string;
        clientKey: string;
      };

      // 2. 토스 SDK 동적 로드 + 결제창 호출
      const { loadTossPayments } = await import("@tosspayments/tosspayments-sdk");
      if (!reqData.clientKey) {
        throw new Error("결제 설정이 아직 완료되지 않았어요. 잠시 후 다시 시도해주세요.");
      }
      const tossPayments = await loadTossPayments(reqData.clientKey);
      const widgets = tossPayments.widgets({ customerKey: reqData.customerKey });
      await widgets.setAmount({ value: reqData.amount, currency: "KRW" });

      const origin = typeof window !== "undefined" ? window.location.origin : "";
      await widgets.requestPayment({
        orderId: reqData.orderId,
        orderName: reqData.orderName,
        successUrl: `${origin}/payment/success`,
        failUrl: `${origin}/payment/fail`,
      });
      // requestPayment는 새 창/리다이렉트 — 정상 흐름은 success 또는 fail 페이지로 이동.
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPendingKind(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">결제</h1>
        <p className="text-sm text-muted-foreground">
          단건 결제와 시즌권 모두 토스페이먼츠로 안전하게 결제됩니다. 환불은 결제일로부터
          14일 이내 가능합니다.
        </p>
      </header>

      {/* 정직성 안내 — 가격 placeholder + 환불 정책 */}
      <section className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/15 dark:text-amber-200">
        <div className="mb-1 flex items-center gap-1.5 font-medium">
          <AlertCircle aria-hidden className="h-4 w-4" />
          출시 전 임시 가격 안내
        </div>
        <p>
          본 화면의 모든 가격은 출시 전 임시값입니다. 클라이언트와 협의 후 P-014 정책으로
          확정될 예정입니다 (
          <Link href="/orders" className="underline">결제 이력</Link>에서 환불 가능).
        </p>
      </section>

      {error && (
        <div
          role="alert"
          data-testid="payment-catalog-error"
          className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive"
        >
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {products.map((p) => (
          <ProductCard
            key={p.kind}
            product={p}
            pending={pendingKind === p.kind}
            onPurchase={handlePurchase}
          />
        ))}
      </div>

      <footer className="border-t pt-4 text-2xs text-muted-foreground">
        결제 후 자동 권한 부여 — 결제 완료 즉시 분석·상담 기능이 활성화됩니다.
        문제 발생 시 <Link href="/orders" className="underline">결제 이력</Link>에서 환불 요청 또는 고객센터 문의.
      </footer>
    </div>
  );
}
