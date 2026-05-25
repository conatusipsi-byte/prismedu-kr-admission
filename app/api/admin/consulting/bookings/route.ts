/**
 * GET /api/admin/consulting/bookings — Day 6 (2026-05-25).
 *
 * 운영자 전용 예약 조회. requireMasterAuth — 비-master 는 403.
 *
 * 응답:
 *   {
 *     items: [{ booking, slot, application, user, order }, ...],
 *     total: number,
 *     nextOffset: number | null
 *   }
 *
 * status 필터:
 *   - upcoming : status='confirmed' AND slot.start_at > now
 *   - past     : status='confirmed' AND slot.start_at <= now, 또는 status IN (completed, no_show)
 *   - cancelled: status='cancelled'
 *   - all      : 전체
 */

import { NextRequest, NextResponse } from "next/server";
import { requireMasterAuth, zodErrorResponse } from "@/lib/api-auth";
import { getAdminSupabase } from "@/lib/supabase-server";
import { AdminConsultingBookingsQuerySchema } from "@/lib/schemas/api/admin";

export const dynamic = "force-dynamic";

interface BookingRow {
  id: string;
  user_id: string;
  time_slot_id: string;
  application_id: string | null;
  status: "confirmed" | "cancelled" | "completed" | "no_show";
  cancelled_at: string | null;
  cancellation_reason: string | null;
  admin_notes: string | null;
  admin_notes_updated_at: string | null;
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
    high_school: string | null;
    consultation_topics: string[];
    current_grades: string | null;
    target_universities: string[] | null;
    questions: string;
  } | null;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireMasterAuth(req);
  if (!auth.ok) return auth.response;

  const params: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => {
    params[k] = v;
  });
  const parsed = AdminConsultingBookingsQuerySchema.safeParse(params);
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const { status, from, to, q, limit, offset } = parsed.data;

  const sb = getAdminSupabase();

  // 1. 메인 쿼리 — bookings + slot + application
  let query = sb
    .from("consulting_bookings")
    .select(`
      id, user_id, time_slot_id, application_id, status,
      cancelled_at, cancellation_reason, admin_notes, admin_notes_updated_at, created_at,
      consulting_time_slots!inner ( id, start_at, end_at, duration_minutes ),
      consulting_applications ( id, student_name, student_grade, high_school, consultation_topics, current_grades, target_universities, questions )
    `, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  // status 필터
  const nowIso = new Date().toISOString();
  if (status === "upcoming") {
    query = query.eq("status", "confirmed").gt("consulting_time_slots.start_at", nowIso);
  } else if (status === "past") {
    query = query.in("status", ["confirmed", "completed", "no_show"]);
    // confirmed + past 만 필터링은 메모리에서 (PostgREST 가 OR 조합이 복잡함)
  } else if (status === "cancelled") {
    query = query.eq("status", "cancelled");
  }

  // 날짜 범위 — slot 시작 시각 기준
  if (from) query = query.gte("consulting_time_slots.start_at", `${from}T00:00:00+09:00`);
  if (to) query = query.lte("consulting_time_slots.start_at", `${to}T23:59:59+09:00`);

  const { data, error, count } = await query;
  if (error) {
    console.error("[/api/admin/consulting/bookings] error:", error.message);
    return NextResponse.json(
      { error: "예약 조회 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }

  const rows = (data ?? []) as unknown as BookingRow[];

  // 2. user_id 모음 → auth.admin 로 이메일 조회 (서비스 키 필요)
  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
  const emailMap = new Map<string, { email: string | null; name: string | null }>();
  if (userIds.length > 0) {
    // Supabase Admin API — 사용자별 1회 조회 (≤ 50건이라 직렬 처리 OK).
    // profiles 테이블 join 도 가능하지만 email 은 auth.users 가 권위.
    await Promise.all(
      userIds.map(async (uid) => {
        const { data: u } = await sb.auth.admin.getUserById(uid);
        emailMap.set(uid, {
          email: u?.user?.email ?? null,
          name: (u?.user?.user_metadata as { name?: string } | undefined)?.name ?? null,
        });
      }),
    );
  }

  // 3. order 정보 — orderId 가 booking 에 없으므로 orders 테이블에서 user_id + product_kind=consulting 계열 + 최근 항목 매칭은 어려움.
  //    booking.application_id 가 있으면 application.created_at 기준으로 같은 user 의 최근 order 찾기.
  //    본 PR 은 단순화 — order 정보 미포함 (admin 이 별도 /admin/orders 에서 조회).
  //    추후 booking.order_id 컬럼 추가 권장.

  // 4. status='past' + confirmed 의 시각 필터 (메모리)
  let filtered = rows;
  if (status === "past") {
    filtered = rows.filter(
      (r) =>
        r.status === "completed" ||
        r.status === "no_show" ||
        (r.status === "confirmed" && Date.parse(r.consulting_time_slots.start_at) <= Date.now()),
    );
  }

  // 5. 검색어 — 사용자 이메일 / 학생 이름 부분 매칭 (메모리)
  if (q && q.trim().length > 0) {
    const lower = q.trim().toLowerCase();
    filtered = filtered.filter((r) => {
      const userInfo = emailMap.get(r.user_id);
      const email = (userInfo?.email ?? "").toLowerCase();
      const name = (r.consulting_applications?.student_name ?? "").toLowerCase();
      return email.includes(lower) || name.includes(lower);
    });
  }

  const items = filtered.map((r) => ({
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
          highSchool: r.consulting_applications.high_school,
          consultationTopics: r.consulting_applications.consultation_topics,
          currentGrades: r.consulting_applications.current_grades,
          targetUniversities: r.consulting_applications.target_universities,
          questions: r.consulting_applications.questions,
        }
      : null,
    user: {
      id: r.user_id,
      email: emailMap.get(r.user_id)?.email ?? null,
      name: emailMap.get(r.user_id)?.name ?? null,
    },
    adminNotes: r.admin_notes,
    adminNotesUpdatedAt: r.admin_notes_updated_at,
    cancelledAt: r.cancelled_at,
    cancellationReason: r.cancellation_reason,
    createdAt: r.created_at,
  }));

  const total = count ?? rows.length;
  const nextOffset = offset + limit < total ? offset + limit : null;

  return NextResponse.json({ items, total, nextOffset });
}
