/**
 * GET /api/admin/orders — 주문 목록 (운영자, Supabase).
 *
 * paymentKey 는 응답에서 항상 제거.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireMasterAuth, zodErrorResponse } from "@/lib/api-auth";
import { getAdminSupabase } from "@/lib/supabase-server";
import { AdminOrdersListQuerySchema } from "@/lib/schemas/api/admin";
import { getProductKr } from "@/lib/plans";
import { reportRouteError } from "@/lib/sentry-report";
import type { OrderStatus, ProductKind } from "@/types/admission";

interface AdminOrderItem {
  orderId: string;
  uid: string;
  email: string | null;
  name: string | null;
  productKind: ProductKind;
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
  source: "supabase" | "mock";
  nextCursor?: string;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireMasterAuth(req);
  if (!auth.ok) return auth.response;

  const params: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => {
    params[k] = v;
  });
  const parsed = AdminOrdersListQuerySchema.safeParse(params);
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const { status, q, from, to, limit, cursor } = parsed.data;

  try {
    const sb = getAdminSupabase();
    let query = sb
      .from("orders")
      .select(`
        id, user_id, product_kind, product_name, amount, status, period,
        payment, refund, idempotency_key, created_at,
        profiles!inner ( email, name )
      `)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status !== "all") {
      query = query.eq("status", status);
    }
    if (from) {
      query = query.gte("created_at", kstStartOfDay(from).toISOString());
    }
    if (to) {
      query = query.lt("created_at", kstStartOfDay(addDays(to, 1)).toISOString());
    }
    if (cursor) {
      query = query.lt("created_at", cursor);
    }

    const { data, error } = await query;

    if (error || !data || (data.length === 0 && !cursor)) {
      const mockItems = listMockOrders();
      const filtered = filterOrdersInMemory(mockItems, { status, q, from, to });
      return NextResponse.json({
        items: filtered.slice(0, limit),
        summary: summarizeOrders(filtered),
        source: "mock",
      } satisfies ApiResponse);
    }

    const rows = data as unknown as Array<{
      id: string;
      user_id: string;
      product_kind: ProductKind;
      product_name: string;
      amount: number;
      status: OrderStatus;
      period: "once" | "monthly" | "yearly";
      payment: { method?: string; approvedAt?: string } | null;
      refund: { amount?: number; reason?: string; refundedAt?: string } | null;
      idempotency_key: string | null;
      created_at: string;
      // PostgREST 임베드는 1:N 가정으로 array 반환 — 1:1 인 경우 [0] 접근
      profiles: Array<{ email: string | null; name: string }> | { email: string | null; name: string } | null;
    }>;

    const items: AdminOrderItem[] = rows.flatMap((r) => {
      if (q) {
        const target = `${r.id} ${r.user_id} ${r.product_name}`.toLowerCase();
        if (!target.includes(q.toLowerCase())) return [];
      }
      const profile = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
      return [{
        orderId: r.id,
        uid: r.user_id,
        email: profile?.email ?? null,
        name: profile?.name ?? null,
        productKind: r.product_kind,
        productName: r.product_name,
        amount: r.amount,
        status: r.status,
        period: r.period,
        createdAtMs: new Date(r.created_at).getTime(),
        approvedAt: r.payment?.approvedAt,
        method: r.payment?.method,
        refundedAtMs: r.refund?.refundedAt ? new Date(r.refund.refundedAt).getTime() : undefined,
        refundAmount: r.refund?.amount,
        refundReason: r.refund?.reason,
        idempotencyKey: r.idempotency_key ?? undefined,
      }];
    });

    const nextCursor = rows.length === limit ? rows[rows.length - 1]?.created_at : undefined;

    return NextResponse.json({
      items,
      summary: summarizeOrders(items),
      source: "supabase",
      nextCursor,
    } satisfies ApiResponse);
  } catch (e) {
    reportRouteError("api.admin.orders", e, { uid: auth.uid });
    return NextResponse.json({ error: "주문 조회 중 오류가 발생했어요." }, { status: 500 });
  }
}

function summarizeOrders(items: AdminOrderItem[]): AdminOrdersSummary {
  const byStatus: Record<OrderStatus, number> = {
    pending: 0, approved: 0, failed: 0, refunded: 0, cancelled: 0,
  };
  let todayApprovedRevenue = 0;
  const todayStartMs = kstStartOfDay(formatKstDate(new Date())).getTime();

  for (const it of items) {
    byStatus[it.status] = (byStatus[it.status] ?? 0) + 1;
    if (it.status === "approved" && it.createdAtMs >= todayStartMs) {
      todayApprovedRevenue += it.amount;
    }
  }
  return {
    total: items.length,
    byStatus,
    todayApprovedRevenue,
    refundPending: byStatus.cancelled,
  };
}

function listMockOrders(): AdminOrderItem[] {
  const now = Date.now();
  const products: ProductKind[] = ["report_one", "season_pass", "consult_one"];
  const items: AdminOrderItem[] = [];
  for (let i = 0; i < 6; i++) {
    const kind = products[i % products.length];
    const def = getProductKr(kind);
    if (!def) continue;
    const status: OrderStatus =
      i === 0 ? "pending" : i === 1 ? "cancelled" : i === 5 ? "refunded" : "approved";
    items.push({
      orderId: `mock_${kind}_${i}`,
      uid: `mock_uid_${i}`,
      email: `mock${i}@example.com`,
      name: `테스트사용자${i}`,
      productKind: kind,
      productName: def.displayName,
      amount: def.priceKrw,
      status,
      period: def.period,
      createdAtMs: now - i * 60 * 60 * 1000,
      approvedAt: status === "approved" ? new Date(now - i * 60 * 60 * 1000).toISOString() : undefined,
      method: "카드",
    });
  }
  return items;
}

function filterOrdersInMemory(
  items: AdminOrderItem[],
  filter: { status: string; q?: string; from?: string; to?: string },
): AdminOrderItem[] {
  let out = items;
  if (filter.status !== "all") out = out.filter((i) => i.status === filter.status);
  if (filter.q) {
    const needle = filter.q.toLowerCase();
    out = out.filter((i) =>
      `${i.orderId} ${i.uid} ${i.email ?? ""} ${i.productName}`.toLowerCase().includes(needle),
    );
  }
  if (filter.from) {
    const t = kstStartOfDay(filter.from).getTime();
    out = out.filter((i) => i.createdAtMs >= t);
  }
  if (filter.to) {
    const t = kstStartOfDay(addDays(filter.to, 1)).getTime();
    out = out.filter((i) => i.createdAtMs < t);
  }
  return out;
}

function kstStartOfDay(yyyymmdd: string): Date {
  return new Date(`${yyyymmdd}T00:00:00+09:00`);
}
function addDays(yyyymmdd: string, days: number): string {
  const d = new Date(`${yyyymmdd}T00:00:00+09:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return formatKstDate(d);
}
function formatKstDate(d: Date): string {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}
