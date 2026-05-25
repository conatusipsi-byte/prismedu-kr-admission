/**
 * /api/consulting/bookings — Day 4 (2026-05-25).
 *
 * POST: 예약 생성 — slot + application 결합. RPC `create_consulting_booking` 호출 →
 *   slot 잠금 / 동시 예약 차단 / entitlement 차감 (시기 슬롯 자동 매칭) 한번에 처리.
 *
 * GET: 본인 예약 이력 — { upcoming, past, cancelled } 로 분기.
 *
 * 결과 코드:
 *   - 201 + { bookingId, slotStartAt, slotEndAt, consumedTimeSlot }
 *   - 400 zod / 401 unauth / 403 entitlement·소유권 / 409 slot 충돌·기간
 *
 * 정직성 (P-002):
 *   - 슬롯 충돌은 UNIQUE 제약 → unique_violation → RPC 가 'slot_unavailable' 반환 → 409.
 *   - season_consult_3 시기 미도래면 'no_consulting_credit' (entitlement read 측 책임 X).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, zodErrorResponse } from "@/lib/api-auth";
import { getAdminSupabase } from "@/lib/supabase-server";
import { ConsultingBookingCreateSchema } from "@/lib/schemas/api/consulting";

export const dynamic = "force-dynamic";

interface RpcOk {
  ok: true;
  bookingId: string;
  slotStartAt: string;
  slotEndAt: string;
  consumedTimeSlot: string | null;
}
interface RpcErr {
  ok: false;
  code: string;
  [k: string]: unknown;
}
type RpcResult = RpcOk | RpcErr;

const RPC_CODE_TO_HTTP: Record<string, number> = {
  slot_not_found: 404,
  slot_unavailable: 409,
  slot_in_past: 409,
  application_not_owned: 403,
  no_consulting_credit: 403,
};
const RPC_CODE_TO_MESSAGE: Record<string, string> = {
  slot_not_found: "선택한 시간을 찾을 수 없습니다.",
  slot_unavailable: "방금 다른 분이 예약한 시간입니다. 다른 시간을 선택해주세요.",
  slot_in_past: "지난 시간은 예약할 수 없습니다.",
  application_not_owned: "본인 명의 신청서만 예약에 사용할 수 있습니다.",
  no_consulting_credit:
    "사용 가능한 컨설팅 권한이 없습니다. (시기 지정 컨설팅은 해당 시기가 도래해야 사용 가능)",
};

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "요청 본문이 유효한 JSON 이 아닙니다" }, { status: 400 });
  }
  const parsed = ConsultingBookingCreateSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const { timeSlotId, applicationId } = parsed.data;

  const sb = getAdminSupabase();
  const { data, error } = await sb.rpc("create_consulting_booking", {
    p_user_id: auth.uid,
    p_time_slot_id: timeSlotId,
    p_application_id: applicationId,
  });
  if (error) {
    console.error("[/api/consulting/bookings POST] rpc error:", error.message);
    return NextResponse.json(
      { error: "예약 처리 중 오류가 발생했어요. 잠시 후 다시 시도해주세요." },
      { status: 500 },
    );
  }

  const result = data as RpcResult;
  if (!result.ok) {
    const status = RPC_CODE_TO_HTTP[result.code] ?? 400;
    const message = RPC_CODE_TO_MESSAGE[result.code] ?? "예약을 처리할 수 없습니다.";
    return NextResponse.json({ error: message, code: result.code, details: result }, { status });
  }

  return NextResponse.json(
    {
      bookingId: result.bookingId,
      slotStartAt: result.slotStartAt,
      slotEndAt: result.slotEndAt,
      consumedTimeSlot: result.consumedTimeSlot,
    },
    { status: 201 },
  );
}

/* ─────────────────────────────────────────────────────────────────────
   GET /api/consulting/bookings — 본인 예약 이력
   ───────────────────────────────────────────────────────────────────── */

interface BookingRow {
  id: string;
  time_slot_id: string;
  application_id: string | null;
  status: "confirmed" | "cancelled" | "completed" | "no_show";
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
  consulting_time_slots: {
    id: string;
    start_at: string;
    end_at: string;
    duration_minutes: number;
  };
  consulting_applications: {
    id: string;
    student_name: string;
    student_grade: 1 | 2 | 3;
    consultation_topics: string[];
  } | null;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const sb = getAdminSupabase();
  const { data, error } = await sb
    .from("consulting_bookings")
    .select(`
      id, time_slot_id, application_id, status, cancelled_at, cancellation_reason, created_at,
      consulting_time_slots!inner ( id, start_at, end_at, duration_minutes ),
      consulting_applications ( id, student_name, student_grade, consultation_topics )
    `)
    .eq("user_id", auth.uid)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[/api/consulting/bookings GET] error:", error.message);
    return NextResponse.json(
      { error: "예약 이력 조회 중 오류가 발생했어요." },
      { status: 500 },
    );
  }

  const rows = (data ?? []) as unknown as BookingRow[];
  const now = Date.now();
  const items = rows.map((r) => ({
    id: r.id,
    status: r.status,
    slotStartAt: r.consulting_time_slots.start_at,
    slotEndAt: r.consulting_time_slots.end_at,
    durationMinutes: r.consulting_time_slots.duration_minutes,
    application: r.consulting_applications
      ? {
          id: r.consulting_applications.id,
          studentName: r.consulting_applications.student_name,
          studentGrade: r.consulting_applications.student_grade,
          consultationTopics: r.consulting_applications.consultation_topics,
        }
      : null,
    cancelledAt: r.cancelled_at,
    cancellationReason: r.cancellation_reason,
    createdAt: r.created_at,
  }));

  const upcoming = items.filter(
    (i) => i.status === "confirmed" && Date.parse(i.slotStartAt) > now,
  );
  const past = items.filter(
    (i) =>
      (i.status === "confirmed" && Date.parse(i.slotStartAt) <= now) ||
      i.status === "completed" ||
      i.status === "no_show",
  );
  const cancelled = items.filter((i) => i.status === "cancelled");

  return NextResponse.json({ upcoming, past, cancelled });
}
