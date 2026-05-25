/**
 * PATCH /api/consulting/bookings/[id] — Day 4 예약 취소 (2026-05-25).
 *
 * RPC `cancel_consulting_booking` 호출 — 24시간 전 정책 검증 + slot 복귀 + entitlement
 * 환불 (시기 지정 슬롯 usedAt 제거) 트랜잭션.
 *
 * 결과 코드:
 *   - 200 + { bookingId, status, refundedTimeSlot }
 *   - 400 zod / 401 unauth / 403 not_owner / 404 booking_not_found / 409 invalid_status·cancellation_window_expired
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, zodErrorResponse } from "@/lib/api-auth";
import { getAdminSupabase } from "@/lib/supabase-server";
import { ConsultingBookingCancelSchema } from "@/lib/schemas/api/consulting";

export const dynamic = "force-dynamic";

interface RpcOk {
  ok: true;
  bookingId: string;
  status: string;
  refundedTimeSlot: string | null;
}
interface RpcErr {
  ok: false;
  code: string;
  [k: string]: unknown;
}

const RPC_CODE_TO_HTTP: Record<string, number> = {
  booking_not_found: 404,
  not_owner: 403,
  invalid_status: 409,
  cancellation_window_expired: 409,
};
const RPC_CODE_TO_MESSAGE: Record<string, string> = {
  booking_not_found: "예약을 찾을 수 없습니다.",
  not_owner: "본인 예약만 취소할 수 있습니다.",
  invalid_status: "이미 처리된 예약입니다.",
  cancellation_window_expired: "예약 24시간 전까지만 취소할 수 있어요.",
};

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id)) {
    return NextResponse.json({ error: "유효하지 않은 예약 ID 형식입니다." }, { status: 400 });
  }

  let body: unknown = {};
  try {
    const txt = await req.text();
    if (txt.length > 0) body = JSON.parse(txt);
  } catch {
    return NextResponse.json({ error: "요청 본문이 유효한 JSON 이 아닙니다" }, { status: 400 });
  }
  const parsed = ConsultingBookingCancelSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  const sb = getAdminSupabase();
  const { data, error } = await sb.rpc("cancel_consulting_booking", {
    p_user_id: auth.uid,
    p_booking_id: id,
    p_reason: parsed.data.reason ?? null,
  });
  if (error) {
    console.error("[/api/consulting/bookings PATCH] rpc error:", error.message);
    return NextResponse.json(
      { error: "예약 취소 처리 중 오류가 발생했어요." },
      { status: 500 },
    );
  }

  const result = data as RpcOk | RpcErr;
  if (!result.ok) {
    const status = RPC_CODE_TO_HTTP[result.code] ?? 400;
    const message = RPC_CODE_TO_MESSAGE[result.code] ?? "예약을 취소할 수 없습니다.";
    return NextResponse.json({ error: message, code: result.code, details: result }, { status });
  }

  return NextResponse.json({
    bookingId: result.bookingId,
    status: result.status,
    refundedTimeSlot: result.refundedTimeSlot,
  });
}
