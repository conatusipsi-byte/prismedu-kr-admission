"use client";

/**
 * OrdersListView — /orders 페이지 본체
 *
 * - GET /api/orders → 본인 결제 이력
 * - 환불 가능 주문은 환불 CTA → POST /api/payment/cancel
 * - 페이지네이션 (cursor)
 */

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { OrderRow, type OrderRowData } from "@/components/payment/OrderRow";

interface ApiOrderItem {
  id: string;
  productKind: string;
  productName: string;
  amount: number;
  status: OrderRowData["status"];
  period: OrderRowData["period"];
  createdAt?: { _seconds?: number; seconds?: number } | string | number;
  validUntil?: number;
}

function toRowData(o: ApiOrderItem): OrderRowData {
  let createdAtMs: number | undefined;
  if (typeof o.createdAt === "number") createdAtMs = o.createdAt;
  else if (typeof o.createdAt === "string") createdAtMs = Date.parse(o.createdAt);
  else if (o.createdAt && typeof o.createdAt === "object") {
    const sec = o.createdAt._seconds ?? o.createdAt.seconds;
    if (sec) createdAtMs = sec * 1000;
  }
  return {
    id: o.id,
    productKind: o.productKind,
    productName: o.productName,
    amount: o.amount,
    status: o.status,
    period: o.period,
    createdAtMs,
    validUntilMs: o.validUntil,
  };
}

export function OrdersListView(): React.ReactElement {
  const [items, setItems] = React.useState<OrderRowData[]>([]);
  const [cursor, setCursor] = React.useState<string | undefined>(undefined);
  const [loading, setLoading] = React.useState(true);
  const [hasMore, setHasMore] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [refundPending, setRefundPending] = React.useState<string | null>(null);

  React.useEffect(() => {
    void fetchPage(undefined, true);
  }, []);

  async function fetchPage(next?: string, replace = false): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("limit", "20");
      if (next) params.set("cursor", next);
      const res = await fetch(`/api/orders?${params.toString()}`);
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `주문 이력 조회 실패 (${res.status})`);
      }
      const data = (await res.json()) as { items: ApiOrderItem[]; nextCursor?: string };
      const rows = (data.items ?? []).map(toRowData);
      setItems((prev) => (replace ? rows : [...prev, ...rows]));
      setCursor(data.nextCursor);
      setHasMore(!!data.nextCursor);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRefund(orderId: string): Promise<void> {
    if (!confirm("정말 환불을 요청하시겠습니까? 환불된 후에는 결제된 권한이 즉시 회수됩니다.")) {
      return;
    }
    setRefundPending(orderId);
    setError(null);
    try {
      const res = await fetch("/api/payment/cancel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId, reason: "사용자 환불 요청" }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `환불 실패 (${res.status})`);
      }
      // 갱신 — 본 주문만 status='refunded'로 표시
      setItems((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: "refunded" } : o)),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefundPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">결제 이력</h1>
        <p className="text-sm text-muted-foreground">
          본인 계정의 결제 이력입니다. 결제일로부터 14일 이내에는 환불을 요청할 수 있어요.
        </p>
      </header>

      {error && (
        <div
          role="alert"
          data-testid="orders-error"
          className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive"
        >
          {error}
        </div>
      )}

      {loading && items.length === 0 && (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      )}

      {!loading && items.length === 0 && !error && (
        <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-mint-50 via-background to-emerald-50/40 dark:from-mint-950/40 dark:via-background dark:to-emerald-950/30 p-10 lg:p-14 text-center">
          <div
            aria-hidden="true"
            className="absolute top-0 right-0 -translate-y-1/3 translate-x-1/4 w-64 h-64 rounded-full bg-mint-300/20 blur-3xl"
          />
          <div className="relative flex flex-col items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-mint-500 text-white flex items-center justify-center shadow-lg shadow-mint-500/30">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-6 w-6"
                aria-hidden="true"
              >
                <path d="M16 11V7a4 4 0 0 0-8 0v4" />
                <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
              </svg>
            </div>
            <div className="space-y-1.5 max-w-md">
              <h2 className="text-lg font-bold text-foreground">
                아직 결제 이력이 없어요
              </h2>
              <p className="text-sm text-muted-foreground break-keep-all leading-relaxed">
                단건 분석 리포트(₩9,900) 또는 시즌권(₩99,000)으로 학과별 합격률 분석을 무제한으로 사용해보세요.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 mt-2">
              <Button asChild size="lg" className="bg-mint-600 hover:bg-mint-700 text-white shadow-lg shadow-mint-500/25">
                <Link href="/pricing">요금제 보기 →</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/payment">바로 결제</Link>
              </Button>
            </div>
          </div>
        </div>
      )}

      {items.length > 0 && (
        <div className="flex flex-col gap-3">
          {items.map((o) => (
            <OrderRow
              key={o.id}
              order={o}
              onRequestRefund={handleRefund}
              refundPending={refundPending === o.id}
            />
          ))}
          {hasMore && (
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => void fetchPage(cursor, false)}
            >
              {loading ? "불러오는 중…" : "더 보기"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
