"use client";

/**
 * OrderRow — 주문 이력 한 행 (/orders 페이지)
 *
 * Order 도큐먼트 필드 표시:
 *   - 상품명 (productName)
 *   - 결제일 (createdAt)
 *   - 금액 (amount)
 *   - 상태 (status: pending/approved/refunded/cancelled/failed)
 *   - 환불 가능 시 환불 CTA
 *
 * paymentKey는 절대 표시 X (서버에서 stripPaymentKey로 제거됨).
 */

import * as React from "react";
import { CalendarClock, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface OrderRowData {
  id: string;
  productKind: string;
  productName: string;
  amount: number;
  status: "pending" | "approved" | "failed" | "refunded" | "cancelled";
  period: "once" | "monthly" | "yearly";
  /** ms since epoch — Firestore Timestamp가 직렬화되면 number 또는 ISO 가능성 */
  createdAtMs?: number;
  validUntilMs?: number;
}

const STATUS_LABEL: Record<OrderRowData["status"], string> = {
  pending: "결제 대기",
  approved: "결제 완료",
  failed: "결제 실패",
  refunded: "환불 완료",
  cancelled: "취소됨",
};

const STATUS_TONE: Record<OrderRowData["status"], string> = {
  pending: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300",
  approved: "border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-800/40 dark:bg-brand-950/20 dark:text-brand-400",
  failed: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300",
  refunded: "border-zinc-300 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-300",
  cancelled: "border-zinc-300 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-300",
};

const REFUND_WINDOW_DAYS = 14;

export interface OrderRowProps {
  order: OrderRowData;
  onRequestRefund?: (orderId: string) => void;
  refundPending?: boolean;
  className?: string;
}

export function OrderRow({
  order,
  onRequestRefund,
  refundPending,
  className,
}: OrderRowProps): React.ReactElement {
  const refundable =
    order.status === "approved" &&
    !!order.createdAtMs &&
    Date.now() - order.createdAtMs < REFUND_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  return (
    <div
      data-component="order-row"
      data-order-id={order.id}
      data-order-status={order.status}
      className={cn(
        "flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="flex flex-col gap-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-semibold">{order.productName}</h3>
          <Badge variant="outline" className={cn("shrink-0 text-2xs", STATUS_TONE[order.status])}>
            {STATUS_LABEL[order.status]}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <CalendarClock aria-hidden className="h-3 w-3" />
            {formatDate(order.createdAtMs)}
          </span>
          <span>·</span>
          <span className="tabular-nums">{order.amount.toLocaleString("ko-KR")}원</span>
          <span>·</span>
          <span className="font-mono text-2xs opacity-70">{order.id.slice(0, 24)}…</span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {refundable && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={refundPending}
            onClick={() => onRequestRefund?.(order.id)}
          >
            <RotateCcw aria-hidden className="mr-1 h-3.5 w-3.5" />
            {refundPending ? "처리 중…" : "환불 요청"}
          </Button>
        )}
      </div>
    </div>
  );
}

function formatDate(ms?: number): string {
  if (!ms || !Number.isFinite(ms)) return "-";
  return new Date(ms).toLocaleString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
