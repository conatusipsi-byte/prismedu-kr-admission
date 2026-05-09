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
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-12 text-center">
          <p className="text-sm text-muted-foreground">아직 결제 이력이 없어요.</p>
          <Button asChild>
            <Link href="/payment">결제 페이지로</Link>
          </Button>
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
