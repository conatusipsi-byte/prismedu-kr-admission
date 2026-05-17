"use client";

/**
 * OrdersView — /admin/orders 페이지 본체 (Client)
 *
 * GET /api/admin/orders → 목록 + summary
 * 필터: status / 검색(orderId·uid·이메일·상품) / 날짜 범위
 *
 * 환불 처리는 본 PR 단계 X (POST /api/admin/orders/[id]/refund 후속).
 * 표시만 담당.
 */

import * as React from "react";
import {
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  ShoppingBag,
  XCircle,
} from "lucide-react";
import { fetchWithAuth, ApiError } from "@/lib/api-client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type OrderStatus = "pending" | "approved" | "failed" | "refunded" | "cancelled";

interface AdminOrderItem {
  orderId: string;
  uid: string;
  email: string | null;
  name: string | null;
  productKind: string;
  productName: string;
  amount: number;
  status: OrderStatus;
  period: "once" | "monthly" | "yearly";
  createdAtMs: number;
  approvedAt?: string;
  refundedAtMs?: number;
  refundAmount?: number;
  refundReason?: string;
  method?: string;
  idempotencyKey?: string;
}

interface AdminOrdersSummary {
  total: number;
  byStatus: Record<OrderStatus, number>;
  todayApprovedRevenue: number;
  refundPending: number;
}

interface ApiResponse {
  items: AdminOrderItem[];
  summary: AdminOrdersSummary;
  source: "firestore" | "mock";
  nextCursor?: string;
}

const STATUS_OPTIONS: Array<{ value: "all" | OrderStatus; label: string }> = [
  { value: "all", label: "전체" },
  { value: "approved", label: "결제 완료" },
  { value: "pending", label: "결제 대기" },
  { value: "cancelled", label: "환불 요청" },
  { value: "refunded", label: "환불 완료" },
  { value: "failed", label: "결제 실패" },
];

export function OrdersView(): React.ReactElement {
  const [statusFilter, setStatusFilter] = React.useState<"all" | OrderStatus>("all");
  const [q, setQ] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");

  const [data, setData] = React.useState<ApiResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [debouncedQ, setDebouncedQ] = React.useState("");
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (debouncedQ) params.set("q", debouncedQ);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      params.set("limit", "100");

      const res = await fetchWithAuth<ApiResponse>(`/api/admin/orders?${params.toString()}`);
      setData(res);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, debouncedQ, from, to]);

  React.useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return (
    <div className="flex flex-col gap-section-lg">
      <header>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <ShoppingBag className="h-5 w-5 text-brand-600 dark:text-brand-400" />
          주문 관리
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground break-keep-all">
          단건권·시즌권 결제 내역.
          {data?.source === "mock" && " (현재 mock — orders 컬렉션 비어있음. 결제 시스템 가동 시 자동 전환)"}
        </p>
      </header>

      {data && <SummaryCards summary={data.summary} />}

      <section className="grid gap-3 sm:grid-cols-4" aria-label="필터">
        <div className="flex flex-col gap-1 sm:col-span-2">
          <Label htmlFor="orders-q" className="text-xs">검색 (orderId·uid·이메일·상품명)</Label>
          <Input
            id="orders-q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="검색어"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="status-filter" className="text-xs">상태</Label>
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
          >
            <SelectTrigger id="status-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => void fetchData()}
            className="text-xs inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 hover:bg-accent transition-colors"
            aria-label="새로고침"
          >
            <RefreshCw className={loading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
            새로고침
          </button>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="from" className="text-xs">From (KST)</Label>
          <Input
            id="from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="to" className="text-xs">To (KST)</Label>
          <Input
            id="to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
      </section>

      {error && (
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
          ⚠️ {error}
        </div>
      )}

      <section aria-label="주문 목록">
        <h2 className="text-sm font-semibold text-foreground mb-3">
          주문 ({data?.items.length ?? 0})
        </h2>
        <Card className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b">
                <tr>
                  <th className="text-left p-3 font-medium">주문 ID</th>
                  <th className="text-left p-3 font-medium">사용자</th>
                  <th className="text-left p-3 font-medium">상품</th>
                  <th className="text-right p-3 font-medium">금액</th>
                  <th className="text-left p-3 font-medium">상태</th>
                  <th className="text-left p-3 font-medium">시각</th>
                </tr>
              </thead>
              <tbody>
                {loading && !data ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-muted-foreground text-sm">
                      <Loader2 className="inline h-4 w-4 animate-spin mr-2" /> 조회 중…
                    </td>
                  </tr>
                ) : !data || data.items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-muted-foreground text-sm">
                      조건에 맞는 주문 0건
                    </td>
                  </tr>
                ) : (
                  data.items.map((it) => <OrderRow key={it.orderId} item={it} />)
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </section>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   하위
   ═══════════════════════════════════════════════════════════════════════ */

function SummaryCards({ summary }: { summary: AdminOrdersSummary }): React.ReactElement {
  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
      <SummaryCard label="총 주문" value={summary.total} hint="현재 필터 기준" />
      <SummaryCard
        label="결제 완료"
        value={summary.byStatus.approved ?? 0}
        hint="status=approved"
      />
      <SummaryCard
        label="환불 대기"
        value={summary.refundPending}
        hint="status=cancelled — 처리 필요"
        tone={summary.refundPending > 0 ? "rose" : "neutral"}
      />
      <SummaryCard
        label="오늘 매출 (KST)"
        value={`₩${summary.todayApprovedRevenue.toLocaleString("ko-KR")}`}
        hint="approved + 오늘 KST"
      />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: number | string;
  hint: string;
  tone?: "neutral" | "rose";
}): React.ReactElement {
  return (
    <Card
      className={
        tone === "rose"
          ? "p-card-lg border-rose-300 bg-rose-50/40 dark:border-rose-900/40 dark:bg-rose-950/15"
          : "p-card-lg"
      }
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{value}</p>
      <p className="mt-1 text-2xs text-muted-foreground/70">{hint}</p>
    </Card>
  );
}

const STATUS_BADGE: Record<OrderStatus, { label: string; cls: string; Icon: React.ComponentType<{ className?: string }> }> = {
  approved: {
    label: "결제 완료",
    cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
    Icon: CheckCircle2,
  },
  pending: {
    label: "대기",
    cls: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
    Icon: Clock,
  },
  cancelled: {
    label: "환불 요청",
    cls: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
    Icon: XCircle,
  },
  refunded: {
    label: "환불 완료",
    cls: "bg-muted text-muted-foreground",
    Icon: XCircle,
  },
  failed: {
    label: "실패",
    cls: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
    Icon: XCircle,
  },
};

function OrderRow({ item }: { item: AdminOrderItem }): React.ReactElement {
  const badge = STATUS_BADGE[item.status];
  const Icon = badge.Icon;
  return (
    <tr className="border-b border-border/40 last:border-0">
      <td className="p-3 font-mono text-2xs">{item.orderId}</td>
      <td className="p-3 text-xs">
        <div className="font-medium text-foreground">{item.name ?? "(이름 없음)"}</div>
        <div className="text-muted-foreground">{item.email ?? item.uid}</div>
      </td>
      <td className="p-3 text-xs">
        <div className="font-medium text-foreground">{item.productName}</div>
        <div className="text-muted-foreground text-2xs">{item.productKind}</div>
      </td>
      <td className="p-3 text-right tabular-nums">
        ₩{item.amount.toLocaleString("ko-KR")}
      </td>
      <td className="p-3">
        <span
          className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs font-medium ${badge.cls}`}
        >
          <Icon className="h-3 w-3" />
          {badge.label}
        </span>
      </td>
      <td className="p-3 text-2xs text-muted-foreground tabular-nums">
        {new Date(item.createdAtMs).toLocaleString("ko-KR", {
          timeZone: "Asia/Seoul",
          dateStyle: "short",
          timeStyle: "short",
        })}
      </td>
    </tr>
  );
}
