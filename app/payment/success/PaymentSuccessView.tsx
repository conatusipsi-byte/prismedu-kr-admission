"use client";

/**
 * PaymentSuccessView — /payment/success 페이지 본체
 *
 * 흐름:
 *   1. searchParams 추출 — paymentKey, orderId, amount
 *   2. POST /api/payment/confirm 자동 호출 (멱등 보장)
 *   3. 결과별 분기:
 *      - 성공 → "결제 완료" + /analysis CTA
 *      - 실패 → 에러 메시지 + /payment 재시도
 *      - DB_WRITE_FAILED → recoveryId + 고객센터 안내
 */

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type ConfirmState =
  | { kind: "loading" }
  | { kind: "ok"; orderId: string; productName: string }
  | { kind: "error"; message: string; recoveryId?: string };

export function PaymentSuccessView(): React.ReactElement {
  const params = useSearchParams();
  const paymentKey = params.get("paymentKey");
  const orderId = params.get("orderId");
  const amountStr = params.get("amount");
  const amount = amountStr ? Number.parseInt(amountStr, 10) : NaN;

  const [state, setState] = React.useState<ConfirmState>({ kind: "loading" });

  // 단일 호출 보장 — paymentKey/orderId 동일하면 멱등이지만 React StrictMode에선 useEffect 2회.
  const calledRef = React.useRef(false);

  React.useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;

    if (!paymentKey || !orderId || !Number.isFinite(amount)) {
      setState({ kind: "error", message: "필수 파라미터가 누락됐습니다." });
      return;
    }

    void confirmPayment({ paymentKey, orderId, amount }).then((res) => {
      if (res.ok) {
        setState({ kind: "ok", orderId: res.orderId, productName: res.productName });
      } else {
        setState({ kind: "error", message: res.message, recoveryId: res.recoveryId });
      }
    });
  }, [paymentKey, orderId, amount]);

  return (
    <div className="mx-auto max-w-content py-12">
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          {state.kind === "loading" && (
            <>
              <Loader2 aria-hidden className="h-12 w-12 animate-spin text-mint-600" />
              <h1 className="text-xl font-semibold">결제 승인 중…</h1>
              <p className="text-sm text-muted-foreground">
                잠시만 기다려주세요. 토스페이먼츠 응답을 확인하고 있어요.
              </p>
            </>
          )}

          {state.kind === "ok" && (
            <>
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-mint-100 dark:bg-mint-950/40">
                <CheckCircle2 aria-hidden className="h-10 w-10 text-mint-600" />
              </div>
              <h1 data-testid="success-headline" className="text-xl font-semibold">결제가 완료됐어요</h1>
              <p className="text-sm text-muted-foreground">
                <strong>{state.productName}</strong> 권한이 즉시 활성화됐습니다. 이제 분석을 시작해보세요.
              </p>
              <p className="text-2xs text-muted-foreground">
                주문번호: <code className="font-mono">{state.orderId}</code>
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <Button asChild>
                  <Link href="/analysis">분석 시작</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/orders">결제 이력</Link>
                </Button>
              </div>
            </>
          )}

          {state.kind === "error" && (
            <>
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-950/40">
                <AlertCircle aria-hidden className="h-10 w-10 text-rose-600" />
              </div>
              <h1 data-testid="error-headline" className="text-xl font-semibold">결제 처리 중 문제가 발생했어요</h1>
              <p className="text-sm text-muted-foreground">{state.message}</p>
              {state.recoveryId && (
                <p className="rounded-md bg-muted px-3 py-2 text-2xs">
                  복구 번호 (고객센터에 알려주세요): <code className="font-mono">{state.recoveryId}</code>
                </p>
              )}
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <Button asChild variant="outline">
                  <Link href="/payment">결제 페이지로</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/orders">결제 이력</Link>
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

async function confirmPayment(args: {
  paymentKey: string;
  orderId: string;
  amount: number;
}): Promise<
  | { ok: true; orderId: string; productName: string }
  | { ok: false; message: string; recoveryId?: string }
> {
  try {
    const res = await fetch("/api/payment/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(args),
    });
    const data = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      orderId?: string;
      productName?: string;
      error?: string;
      code?: string;
      recoveryId?: string;
    };
    if (!res.ok || !data.success) {
      return {
        ok: false,
        message: data.error ?? `결제 승인 실패 (${res.status})`,
        recoveryId: data.recoveryId,
      };
    }
    return {
      ok: true,
      orderId: data.orderId ?? args.orderId,
      productName: data.productName ?? "결제 상품",
    };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}
