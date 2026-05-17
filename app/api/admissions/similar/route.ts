/**
 * POST /api/admissions/similar — 유사 학과 추천 (코사인 유사도 + fallback).
 *
 * 실 운영: admission_results 의 feature_vector 활용 코사인 유사도.
 * 본 단계: 학과 정보 임베드 select 로 같은 university.category + 같은 track 인 학과 N개 반환.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, zodErrorResponse } from "@/lib/api-auth";
import { getAdminSupabase } from "@/lib/supabase-server";
import { reportRouteError } from "@/lib/sentry-report";
import { AdmissionsSimilarSchema } from "@/lib/schemas/api/admissions";
import type { Department, University } from "@/types/admission";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "유효하지 않은 JSON" }, { status: 400 });
  }
  const parsed = AdmissionsSimilarSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const { universityId, departmentId, year, trackKind, limit } = parsed.data;

  try {
    const sb = getAdminSupabase();

    // 기준 학과 카테고리·트랙 조회
    const { data: baseDept } = await sb
      .from("departments")
      .select("track, universities!inner(category)")
      .eq("university_id", universityId)
      .eq("id", departmentId)
      .maybeSingle();
    if (!baseDept) {
      return NextResponse.json({ error: "기준 학과를 찾을 수 없습니다" }, { status: 404 });
    }
    const base = baseDept as unknown as {
      track: Department["track"];
      universities: { category: University["category"] };
    };

    // 같은 카테고리 + 같은 track 인 학과들 (자기 자신 제외, 해당 trackKind 운영)
    const { data: similar, error } = await sb
      .from("departments")
      .select(`
        id, university_id, name, track,
        universities!inner ( id, n, category, rank_order ),
        department_admissions!inner ( year, available_track_kinds )
      `)
      .eq("active", true)
      .eq("track", base.track)
      .eq("universities.category", base.universities.category)
      .eq("department_admissions.year", year)
      .contains("department_admissions.available_track_kinds", [trackKind])
      .neq("university_id", universityId)
      .limit(limit);

    if (error || !similar) {
      console.error("[/api/admissions/similar] query:", error?.message);
      return NextResponse.json({ items: [] });
    }

    type Row = {
      id: string;
      university_id: string;
      name: string;
      track: string;
      universities: { id: string; n: string; category: string; rank_order: number | null };
    };

    const items = (similar as unknown as Row[]).map((r) => ({
      universityId: r.university_id,
      universityName: r.universities.n,
      universityCategory: r.universities.category,
      departmentId: r.id,
      departmentName: r.name,
      track: r.track,
      rankOrder: r.universities.rank_order,
      similarityMethod: "category+track",
    }));

    return NextResponse.json({
      base: { universityId, departmentId, year, trackKind },
      items,
      method: "fallback_category_track",
      caveat: "본 추천은 학과 카테고리·트랙 기반 fallback입니다. 합격사례 누적 후 코사인 유사도 기반 추천으로 업그레이드 예정.",
    });
  } catch (e) {
    reportRouteError("api.admissions.similar", e, { uid: auth.uid });
    return NextResponse.json({ error: "유사 학과 조회 실패" }, { status: 500 });
  }
}
