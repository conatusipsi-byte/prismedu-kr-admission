/**
 * GET /api/orders — 본인 주문 내역 조회
 *
 * - requireAuth
 * - Firestore: orders where uid == auth.uid orderBy createdAt desc
 * - 페이지네이션: cursor (마지막 도큐먼트 path)
 * - paymentKey는 응답에서 제외 (서버 전용 필드)
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { requireAuth, zodErrorResponse } from "@/lib/api-auth";
import { OrdersListQuerySchema } from "@/lib/schemas/api/payment";
import type { Order } from "@/types/admission";

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
    const db = getAdminDb();
    let query = db
      .collection("orders")
      .where("uid", "==", auth.uid)
      .orderBy("createdAt", "desc")
      .limit(limit);

    if (status) {
      query = query.where("status", "==", status);
    }

    if (cursor) {
      const cursorDoc = await db.doc(cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snap = await query.get();
    const items = snap.docs.map((d) => stripPaymentKey(d.data() as Order));
    const lastDoc = snap.docs[snap.docs.length - 1];
    const nextCursor = snap.size === limit ? lastDoc?.ref.path : undefined;

    return NextResponse.json({ items, nextCursor });
  } catch (e) {
    console.error("[/api/orders] error:", e);
    return NextResponse.json(
      { error: "주문 내역 조회 중 오류가 발생했어요." },
      { status: 500 },
    );
  }
}

/**
 * paymentKey는 클라 노출 X — Firestore rules와 별개로 서버에서도 한 번 더 제거.
 * (rules가 잘못 설정되어 read 통과해도 paymentKey 누출 안 되게.)
 */
function stripPaymentKey(order: Order): Omit<Order, "payment"> & {
  payment?: Omit<NonNullable<Order["payment"]>, "paymentKey">;
} {
  const { payment, ...rest } = order;
  if (!payment) return rest;
  const safe: Omit<NonNullable<Order["payment"]>, "paymentKey"> = {
    method: payment.method,
    approvedAt: payment.approvedAt,
  };
  return { ...rest, payment: safe };
}
