/**
 * GET /api/admin/consulting/applications — Day 6 (2026-05-25).
 *
 * 미예약 신청서 조회 — booking 이 없는 application row 들. filter=all 이면 전체.
 * 운영자가 7일 이상 미예약 상태 신청서를 시각적으로 식별 → 정리 또는 follow-up.
 *
 * 본 라우트는 조회만. 정리(삭제) 동작은 별도 PR (or 운영자가 Supabase 콘솔 직접).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireMasterAuth, zodErrorResponse } from "@/lib/api-auth";
import { getAdminSupabase } from "@/lib/supabase-server";
import { AdminConsultingApplicationsQuerySchema } from "@/lib/schemas/api/admin";

export const dynamic = "force-dynamic";

interface ApplicationRow {
  id: string;
  user_id: string;
  student_name: string;
  student_grade: 1 | 2 | 3;
  high_school: string | null;
  consultation_topics: string[];
  current_grades: string | null;
  target_universities: string[] | null;
  questions: string;
  created_at: string;
  consulting_bookings: Array<{ id: string }>;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireMasterAuth(req);
  if (!auth.ok) return auth.response;

  const params: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => {
    params[k] = v;
  });
  const parsed = AdminConsultingApplicationsQuerySchema.safeParse(params);
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const { filter, olderThanDays, limit, offset } = parsed.data;

  const sb = getAdminSupabase();
  // applications 에 bookings (FK reverse) 임베드 → length 검사로 미예약 식별
  let query = sb
    .from("consulting_applications")
    .select(
      `id, user_id, student_name, student_grade, high_school, consultation_topics,
       current_grades, target_universities, questions, created_at,
       consulting_bookings ( id )`,
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (olderThanDays !== undefined && olderThanDays > 0) {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
    query = query.lt("created_at", cutoff);
  }

  const { data, error, count } = await query;
  if (error) {
    console.error("[/api/admin/consulting/applications] error:", error.message);
    return NextResponse.json({ error: "신청서 조회 중 오류" }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as ApplicationRow[];
  let filtered = rows;
  if (filter === "unbooked") {
    filtered = rows.filter((r) => (r.consulting_bookings ?? []).length === 0);
  }

  // 사용자 이메일 매핑
  const userIds = Array.from(new Set(filtered.map((r) => r.user_id)));
  const emailMap = new Map<string, string | null>();
  await Promise.all(
    userIds.map(async (uid) => {
      const { data: u } = await sb.auth.admin.getUserById(uid);
      emailMap.set(uid, u?.user?.email ?? null);
    }),
  );

  const items = filtered.map((r) => ({
    id: r.id,
    studentName: r.student_name,
    studentGrade: r.student_grade,
    highSchool: r.high_school,
    consultationTopics: r.consultation_topics,
    currentGrades: r.current_grades,
    targetUniversities: r.target_universities,
    questions: r.questions,
    createdAt: r.created_at,
    user: { id: r.user_id, email: emailMap.get(r.user_id) ?? null },
    hasBooking: (r.consulting_bookings ?? []).length > 0,
  }));

  return NextResponse.json({
    items,
    total: count ?? rows.length,
    filtered: filtered.length,
  });
}
