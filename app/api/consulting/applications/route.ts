/**
 * POST /api/consulting/applications — 컨설팅 신청서 제출 (Day 3).
 *
 * 흐름:
 *   1. 인증 (requireAuth)
 *   2. entitlement 확인 (consult_one 잔여 ≥ 1) — getConsultingEntitlement
 *   3. zod 검증 (ConsultingApplicationCreateSchema)
 *   4. consulting_applications INSERT (service_role)
 *   5. 응답 { id, createdAt }
 *
 * ⚠️ 본 라우트는 **신청서만** 저장. 예약(time_slot 결합 + entitlement 차감)은 Day 4 의
 *   POST /api/consulting/bookings 가 처리. 본 라우트로는 슬롯이 점유되지 않으므로
 *   사용자가 신청서만 제출하고 예약을 안 마치면 같은 슬롯을 다른 사용자가 가져갈 수 있음.
 *
 * 정직성 (P-002):
 *   - 표본 부족 학과·합격률 거짓 추정 같은 가공 X — 입력 그대로 저장.
 *   - entitlement 없는 사용자에게 신청서 저장만 허용 X (구매 사전 확인).
 *
 * GET /api/consulting/applications — 본인 신청 이력 (옵션, Day 3 추가). UI 미사용이지만
 *   본인 검수·관리자 디버깅용. RLS 정책이 본인 row 만 허용.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, zodErrorResponse } from "@/lib/api-auth";
import { getAdminSupabase } from "@/lib/supabase-server";
import { getConsultingEntitlement } from "@/lib/consulting/entitlement";
import { ConsultingApplicationCreateSchema } from "@/lib/schemas/api/consulting";

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
  updated_at: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. 인증
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  // 2. entitlement
  const ent = await getConsultingEntitlement(auth.uid);
  if (!ent.hasAccess) {
    return NextResponse.json(
      {
        error: "컨설팅 이용권이 없습니다. 결제 후 다시 시도해주세요.",
        code: "no_entitlement",
      },
      { status: 403 },
    );
  }

  // 3. 입력 검증
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "요청 본문이 유효한 JSON 이 아닙니다" }, { status: 400 });
  }
  const parsed = ConsultingApplicationCreateSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const {
    studentName,
    studentGrade,
    highSchool,
    consultationTopics,
    currentGrades,
    targetUniversities,
    questions,
  } = parsed.data;

  // 4. INSERT
  try {
    const sb = getAdminSupabase();
    const { data, error } = await sb
      .from("consulting_applications")
      .insert({
        user_id: auth.uid,
        student_name: studentName,
        student_grade: studentGrade,
        high_school: highSchool && highSchool.length > 0 ? highSchool : null,
        consultation_topics: consultationTopics,
        current_grades: currentGrades && currentGrades.length > 0 ? currentGrades : null,
        target_universities:
          targetUniversities && targetUniversities.length > 0 ? targetUniversities : null,
        questions,
      })
      .select("id, created_at")
      .single();
    if (error) {
      console.error("[/api/consulting/applications] insert error:", error.message);
      return NextResponse.json(
        { error: "신청서 저장 중 오류가 발생했어요." },
        { status: 500 },
      );
    }
    const row = data as { id: string; created_at: string };
    return NextResponse.json(
      { id: row.id, createdAt: row.created_at },
      { status: 201 },
    );
  } catch (e) {
    console.error("[/api/consulting/applications] threw:", e);
    return NextResponse.json(
      { error: "신청서 저장 중 오류가 발생했어요." },
      { status: 500 },
    );
  }
}

/**
 * GET /api/consulting/applications — 본인 신청 이력. limit 기본 20.
 *
 * Day 3 단계엔 UI 에서 사용 X (제출 후 같은 페이지가 토스트만 표시). 본인 검수·관리자
 * 디버깅용. Day 4 의 my-bookings 페이지가 본 엔드포인트를 함께 사용할 예정.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const limitParam = req.nextUrl.searchParams.get("limit");
  const limit = Math.max(1, Math.min(50, Number(limitParam) || 20));

  try {
    const sb = getAdminSupabase();
    const { data, error } = await sb
      .from("consulting_applications")
      .select("*")
      .eq("user_id", auth.uid)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      console.error("[/api/consulting/applications GET] error:", error.message);
      return NextResponse.json(
        { error: "신청 이력 조회 중 오류가 발생했어요." },
        { status: 500 },
      );
    }
    const rows = (data ?? []) as ApplicationRow[];
    const items = rows.map((r) => ({
      id: r.id,
      studentName: r.student_name,
      studentGrade: r.student_grade,
      highSchool: r.high_school,
      consultationTopics: r.consultation_topics,
      currentGrades: r.current_grades,
      targetUniversities: r.target_universities,
      questions: r.questions,
      createdAt: r.created_at,
    }));
    return NextResponse.json({ items });
  } catch (e) {
    console.error("[/api/consulting/applications GET] threw:", e);
    return NextResponse.json(
      { error: "신청 이력 조회 중 오류가 발생했어요." },
      { status: 500 },
    );
  }
}
