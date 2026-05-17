/**
 * GET /api/orders — 본인 주문 내역 (Supabase).
 *
 * 페이지네이션: cursor = 마지막 행의 created_at ISO. 다음 페이지는 created_at < cursor.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase-server";
import { requireAuth, zodErrorResponse } from "@/lib/api-auth";
import { OrdersListQuerySchema } from "@/lib/schemas/api/payment";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const params: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => {
    params[k] = v;
  });
  const parsed = OrdersListQuerySchema.safeParse(params);
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const { status, limit, cursor } = parsed.data;

  try {
    const sb = getAdminSupabase();
    let query = sb
      .from("orders")
      .select("id, product_kind, product_name, amount, status, period, valid_from, valid_until, payment, created_at")
      .eq("user_id", auth.uid)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status) {
      query = query.eq("status", status);
    }
    if (cursor) {
      query = query.lt("created_at", cursor);
    }

    const { data, error } = await query;
    if (error) {
      console.error("[/api/orders] error:", error.message);
      return NextResponse.json(
        { error: "주문 내역 조회 중 오류가 발생했어요." },
        { status: 500 },
      );
    }

    const rows = (data ?? []) as Array<{
      id: string;
      product_kind: string;
      product_name: string;
      amount: number;
      status: string;
      period: string;
      valid_from: string | null;
      valid_until: string | null;
      payment: { paymentKey?: string; method?: string; approvedAt?: string } | null;
      created_at: string;
    }>;

    const items = rows.map((r) => ({
      id: r.id,
      productKind: r.product_kind,
      productName: r.product_name,
      amount: r.amount,
      status: r.status,
      period: r.period,
      validFrom: r.valid_from,
      validUntil: r.valid_until,
      // paymentKey 노출 차단 — method·approvedAt 만 응답
      payment: r.payment ? { method: r.payment.method, approvedAt: r.payment.approvedAt } : undefined,
      createdAt: r.created_at,
    }));

    const nextCursor =
      rows.length === limit ? rows[rows.length - 1]?.created_at : undefined;

    return NextResponse.json({ items, nextCursor });
  } catch (e) {
    console.error("[/api/orders] threw:", e);
    return NextResponse.json(
      { error: "주문 내역 조회 중 오류가 발생했어요." },
      { status: 500 },
    );
  }
}
