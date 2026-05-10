/**
 * GET /api/admin/orders — 주문 목록 (운영자)
 *
 * 마스터 전용. orders 컬렉션 + uid join (email/name).
 *
 * 응답: { items, summary, source: "firestore"|"mock", nextCursor? }
 *
 * 정직성:
 *   - paymentKey 는 응답에서 항상 제거 (서버 전용 — rules + 본 라우트 양쪽 가드)
 *   - 결제 시스템 미가동(Toss 키 미등록) 시 orders 컬렉션 비어있음 → mock 모드 fallback
 *
 * 페이지네이션: createdAt desc + limit 기반 cursor (마지막 도큐먼트 path).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireMasterAuth, zodErrorResponse } from "@/lib/api-auth";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { AdminOrdersListQuerySchema } from "@/lib/schemas/api/admin";
import { getProductKr } from "@/lib/plans";
import { reportRouteError } from "@/lib/sentry-report";
import type { Order, OrderStatus, ProductKind } from "@/types/admission";

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
  /** 결제 수단 — paymentKey 는 절대 노출 X */
  method?: string;
  idempotencyKey?: string;
}

interface AdminOrdersSummary {
  total: number;
  byStatus: Record<OrderStatus, number>;
  /** 오늘(KST) 승인된 주문 합산 KRW */
  todayApprovedRevenue: number;
  /** 환불 대기 (status=cancelled) — 운영자가 처리해야 할 카운트 */
  refundPending: number;
}

interface ApiResponse {
  items: AdminOrderItem[];
  summary: AdminOrdersSummary;
  source: "firestore" | "mock";
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
    const db = getAdminDb();
    let firestoreQ = db
      .collection("orders")
      .orderBy("createdAt", "desc")
      .limit(limit);

    if (status !== "all") {
      firestoreQ = firestoreQ.where("status", "==", status);
    }
    if (from) {
      firestoreQ = firestoreQ.where("createdAt", ">=", kstStartOfDay(from));
    }
    if (to) {
      firestoreQ = firestoreQ.where("createdAt", "<", kstStartOfDay(addDays(to, 1)));
    }
    if (cursor) {
      const cursorDoc = await db.doc(cursor).get();
      if (cursorDoc.exists) firestoreQ = firestoreQ.startAfter(cursorDoc);
    }

    const snap = await firestoreQ.get();

    if (snap.empty && !cursor) {
      const mockItems = listMockOrders();
      const filtered = filterOrdersInMemory(mockItems, { status, q, from, to });
      return NextResponse.json({
        items: filtered.slice(0, limit),
        summary: summarizeOrders(filtered),
        source: "mock",
      } satisfies ApiResponse);
    }

    const items: AdminOrderItem[] = [];
    const adminAuth = getAdminAuth();
    for (const d of snap.docs) {
      const order = d.data() as Order;
      // 검색 필터 (Firestore 텍스트 검색 어려워 메모리 필터)
      if (q) {
        const target = `${order.id} ${order.uid} ${order.productName}`.toLowerCase();
        if (!target.includes(q.toLowerCase())) continue;
      }

      let email: string | null = null;
      let name: string | null = null;
      try {
        const authUser = await adminAuth.getUser(order.uid);
        email = authUser.email ?? null;
        name = authUser.displayName ?? null;
      } catch {
        /* Auth user 없음 — 그대로 진행 (orphan order — Sentry 후보) */
      }
      if (!name) {
        try {
          const userDoc = await db.collection("users").doc(order.uid).get();
          if (userDoc.exists) {
            name = (userDoc.data() as { name?: string }).name ?? null;
          }
        } catch {
          /* skip */
        }
      }

      items.push(toItem(order, email, name));
    }

    const lastDoc = snap.docs[snap.docs.length - 1];
    const nextCursor = snap.size === limit ? lastDoc?.ref.path : undefined;

    return NextResponse.json({
      items,
      summary: summarizeOrders(items),
      source: "firestore",
      nextCursor,
    } satisfies ApiResponse);
  } catch (e) {
    reportRouteError("api.admin.orders", e, { uid: auth.uid });
    return NextResponse.json({ error: "주문 조회 중 오류가 발생했어요." }, { status: 500 });
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   변환 + 요약
   ═══════════════════════════════════════════════════════════════════════ */

function toItem(order: Order, email: string | null, name: string | null): AdminOrderItem {
  const createdAtMs = (order.createdAt as unknown as { toMillis?: () => number })?.toMillis?.() ?? 0;
  const refundedAtMs = order.refund
    ? (order.refund.refundedAt as unknown as { toMillis?: () => number })?.toMillis?.() ?? undefined
    : undefined;
  return {
    orderId: order.id,
    uid: order.uid,
    email,
    name,
    productKind: order.productKind,
    productName: order.productName,
    amount: order.amount,
    status: order.status,
    period: order.period,
    createdAtMs,
    approvedAt: order.payment?.approvedAt,
    method: order.payment?.method,
    refundedAtMs,
    refundAmount: order.refund?.amount,
    refundReason: order.refund?.reason,
    idempotencyKey: order.idempotencyKey,
  };
}

function summarizeOrders(items: AdminOrderItem[]): AdminOrdersSummary {
  const byStatus: Record<OrderStatus, number> = {
    pending: 0,
    approved: 0,
    failed: 0,
    refunded: 0,
    cancelled: 0,
  };
  let todayApprovedRevenue = 0;
  const todayStart = kstStartOfDay(formatKstDate(new Date()));
  const todayStartMs = todayStart.getTime();

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

/* ═══════════════════════════════════════════════════════════════════════
   Mock fallback — 결제 시스템 가동 전 staging 노출용
   ═══════════════════════════════════════════════════════════════════════ */

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
  if (filter.status !== "all") {
    out = out.filter((i) => i.status === filter.status);
  }
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

/* ═══════════════════════════════════════════════════════════════════════
   날짜 유틸 — KST 기준 (모든 운영 통계의 일자 분할은 KST)
   ═══════════════════════════════════════════════════════════════════════ */

function kstStartOfDay(yyyymmdd: string): Date {
  // YYYY-MM-DD KST → UTC ISO. KST는 UTC+9 라 KST 00:00 = UTC 전날 15:00.
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
