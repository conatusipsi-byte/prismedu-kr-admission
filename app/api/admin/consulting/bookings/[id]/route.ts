/**
 * PATCH /api/admin/consulting/bookings/[id] — Day 6 (2026-05-25).
 *
 * 운영자 전용 booking mutation:
 *   - adminNotes 갱신 (audit: admin_notes_updated_at + admin_notes_updated_by)
 *   - setStatus: confirmed → completed | no_show
 *   - forceCancel: 24h 우회 + entitlement 환불 (cancel_consulting_booking RPC p_force=true)
 *
 * 3개 동작이 동시 전송될 수 있음 (예: 강제 취소 + 사유 메모). 순서:
 *   forceCancel 먼저 → setStatus → adminNotes
 *   (forceCancel 후 setStatus 는 cancelled 가 final 이라 의미 없음 → 무시)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireMasterAuth, zodErrorResponse } from "@/lib/api-auth";
import { getAdminSupabase } from "@/lib/supabase-server";
import { AdminConsultingBookingPatchSchema } from "@/lib/schemas/api/admin";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export async function PATCH(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const auth = await requireMasterAuth(req);
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "유효하지 않은 예약 ID 형식입니다." }, { status: 400 });
  }

  let body: unknown = {};
  try {
    const txt = await req.text();
    if (txt.length > 0) body = JSON.parse(txt);
  } catch {
    return NextResponse.json({ error: "요청 본문이 유효한 JSON 이 아닙니다" }, { status: 400 });
  }
  const parsed = AdminConsultingBookingPatchSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const { adminNotes, setStatus, forceCancel, cancellationReason } = parsed.data;

  const sb = getAdminSupabase();
  const events: Array<{ kind: string; result: unknown }> = [];

  // 1. forceCancel — RPC 호출 (가장 먼저, 이후 setStatus 무효화)
  let cancelledHere = false;
  if (forceCancel === true) {
    const { data, error } = await sb.rpc("cancel_consulting_booking", {
      p_user_id: auth.uid, // RPC 내부에서 p_force=true 면 user_id 검증 우회
      p_booking_id: id,
      p_reason: cancellationReason ?? null,
      p_force: true,
    });
    if (error) {
      console.error("[/api/admin/consulting/bookings PATCH force_cancel] rpc:", error.message);
      return NextResponse.json({ error: "강제 취소 처리 중 오류" }, { status: 500 });
    }
    const result = data as { ok: boolean; code?: string };
    if (!result.ok) {
      const httpStatus = result.code === "booking_not_found" ? 404 : 409;
      return NextResponse.json({ error: "강제 취소 실패", code: result.code, details: result }, {
        status: httpStatus,
      });
    }
    events.push({ kind: "force_cancel", result: data });
    cancelledHere = true;
  }

  // 2. setStatus — forceCancel 안 했고 (or forceCancel 후 무관) confirmed → completed/no_show 직접 전환
  if (!cancelledHere && setStatus !== undefined) {
    const { data, error } = await sb
      .from("consulting_bookings")
      .update({ status: setStatus })
      .eq("id", id)
      .eq("status", "confirmed")
      .select("id, status")
      .maybeSingle();
    if (error) {
      console.error("[/api/admin/consulting/bookings PATCH setStatus] error:", error.message);
      return NextResponse.json({ error: "상태 변경 중 오류" }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json(
        { error: "예약을 찾을 수 없거나 confirmed 상태가 아닙니다.", code: "invalid_status" },
        { status: 409 },
      );
    }
    events.push({ kind: "set_status", result: data });
  }

  // 3. adminNotes — audit 컬럼 함께 갱신
  if (adminNotes !== undefined) {
    const trimmed = adminNotes.trim();
    const update = trimmed.length === 0
      ? { admin_notes: null, admin_notes_updated_at: null, admin_notes_updated_by: null }
      : {
          admin_notes: trimmed,
          admin_notes_updated_at: new Date().toISOString(),
          admin_notes_updated_by: auth.uid,
        };
    const { data, error } = await sb
      .from("consulting_bookings")
      .update(update)
      .eq("id", id)
      .select("id, admin_notes, admin_notes_updated_at")
      .maybeSingle();
    if (error) {
      console.error("[/api/admin/consulting/bookings PATCH adminNotes] error:", error.message);
      return NextResponse.json({ error: "메모 저장 중 오류" }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "예약을 찾을 수 없습니다." }, { status: 404 });
    }
    events.push({ kind: "admin_notes", result: data });
  }

  if (events.length === 0) {
    return NextResponse.json(
      { error: "변경된 항목이 없습니다." },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true, bookingId: id, events });
}
