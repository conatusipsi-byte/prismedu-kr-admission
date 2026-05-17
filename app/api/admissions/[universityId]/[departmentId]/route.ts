/**
 * GET /api/admissions/[universityId]/[departmentId] — 학과 상세 (공개, P-001).
 *
 * 비로그인 무료 노출: 모집요강·일정·반영비·응시영역기준.
 * 합격률 분석 카드만 별도 게이트 (/api/match 결과 페이지).
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase-server";
import { checkSampleSufficiency } from "@/lib/admission/sample-gate";
import type {
  AdmissionSampleStats,
  AdmissionTrackKind,
  DepartmentAdmissions,
} from "@/types/admission";

const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800",
};

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ universityId: string; departmentId: string }> },
): Promise<NextResponse> {
  const { universityId, departmentId } = await ctx.params;
  if (!/^[a-zA-Z0-9_-]{1,50}$/.test(universityId) || !/^[a-zA-Z0-9_-]{1,50}$/.test(departmentId)) {
    return NextResponse.json({ error: "유효하지 않은 ID" }, { status: 400 });
  }

  const year = new Date().getFullYear() + 1;
  const sb = getAdminSupabase();

  // 임베드 select — 한 쿼리로 모든 정보
  const { data, error } = await sb
    .from("departments")
    .select(`
      *,
      universities!inner ( * ),
      department_admissions!inner ( * )
    `)
    .eq("university_id", universityId)
    .eq("id", departmentId)
    .eq("department_admissions.year", year)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "학과를 찾을 수 없습니다" }, { status: 404 });
  }

  type Row = {
    id: string;
    name: string;
    track: string;
    universities: Record<string, unknown>;
    department_admissions: Array<{
      tracks: DepartmentAdmissions["tracks"];
      available_track_kinds: AdmissionTrackKind[];
      prev_year_result: DepartmentAdmissions["prevYearResult"];
    }>;
  };
  const row = data as unknown as Row;
  const adm = row.department_admissions[0];
  if (!adm) {
    return NextResponse.json({ error: `${year}학년도 모집요강이 등록되지 않았습니다` }, { status: 404 });
  }

  // 트랙별 sample sufficient 정보
  const tracksWithStats: Record<string, { sampleSufficient: boolean; tracks: unknown[] }> = {};
  for (const kind of adm.available_track_kinds) {
    const statsId = `${universityId}_${departmentId}_${year}_${kind}`;
    const { data: statsRow } = await sb
      .from("admission_sample_stats")
      .select("verified_count, weighted_count, accepted_count, stage1_passed_count, stage2_accepted_count")
      .eq("id", statsId)
      .maybeSingle();
    let sufficient = false;
    if (statsRow) {
      const r = statsRow as Record<string, unknown>;
      const stats: AdmissionSampleStats = {
        id: statsId,
        universityId,
        departmentId,
        year,
        trackKind: kind,
        verifiedCount: r.verified_count as number,
        weightedCount: r.weighted_count as number,
        acceptedCount: r.accepted_count as number,
        stage1PassedCount: r.stage1_passed_count as number | undefined,
        stage2AcceptedCount: r.stage2_accepted_count as number | undefined,
        updatedAt: new Date().toISOString() as unknown as AdmissionSampleStats["updatedAt"],
      };
      sufficient = checkSampleSufficiency(stats).sufficient;
    }
    tracksWithStats[kind] = {
      sampleSufficient: sufficient,
      tracks: adm.tracks[kind] ?? [],
    };
  }

  return NextResponse.json(
    {
      university: row.universities,
      department: { id: row.id, name: row.name, track: row.track },
      year,
      availableTrackKinds: adm.available_track_kinds,
      tracksByKind: tracksWithStats,
      prevYearResult: adm.prev_year_result,
    },
    { headers: CACHE_HEADERS },
  );
}
