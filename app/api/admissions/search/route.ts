/**
 * GET /api/admissions/search — 학과 검색 (공개, Supabase).
 *
 * P-001: 비로그인 접근 가능. 응답에 합격률·확률 미포함 (정형 정보만).
 * P-013: jaeoegukmin 트랙은 명시적 trackKind 필터일 때만 노출.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase-server";
import {
  AdmissionsSearchQuerySchema,
  type AdmissionsSearchQuery,
} from "@/lib/schemas/api/admissions";
import { matchesSearchQuery } from "@/lib/admission/labels";
import { checkSampleSufficiency } from "@/lib/admission/sample-gate";
import { zodErrorResponse } from "@/lib/api-auth";
import type {
  AdmissionTrackKind,
  Department,
  University,
  AdmissionSampleStats,
} from "@/types/admission";

interface SearchResultItem {
  department: Department;
  university: University;
  sampleSufficient: boolean;
  availableTracks: AdmissionTrackKind[];
}

interface SearchResponse {
  results: SearchResultItem[];
  nextCursor?: string;
  totalEstimate?: number;
}

const CACHE_HEADERS_PUBLIC = {
  "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800",
};
const CACHE_HEADERS_DEFAULT = {
  "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
};

export async function GET(req: NextRequest): Promise<NextResponse> {
  const params: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => {
    params[k] = v;
  });
  const parsed = AdmissionsSearchQuerySchema.safeParse(params);
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const query = parsed.data;

  const allowJaeoegukmin = query.trackKind === "jaeoegukmin";

  try {
    const result = await searchDepartments(query, allowJaeoegukmin);
    const cacheHeaders =
      query.q || query.region || query.trackKind || query.category
        ? CACHE_HEADERS_PUBLIC
        : CACHE_HEADERS_DEFAULT;
    return NextResponse.json(result, { headers: cacheHeaders });
  } catch (e) {
    console.error("[/api/admissions/search] error:", e);
    return NextResponse.json(
      { error: "검색 중 오류가 발생했습니다" },
      { status: 500 },
    );
  }
}

async function searchDepartments(
  query: AdmissionsSearchQuery,
  allowJaeoegukmin: boolean,
): Promise<SearchResponse> {
  const sb = getAdminSupabase();
  const year = new Date().getFullYear() + 1;

  // 임베드 select — departments + universities + department_admissions
  let q = sb
    .from("departments")
    .select(`
      *,
      universities!inner ( * ),
      department_admissions ( year, available_track_kinds )
    `)
    .eq("active", true)
    .eq("universities.active", true)
    .order("updated_at", { ascending: false })
    .limit(query.limit);

  if (query.track) {
    q = q.eq("track", query.track);
  }
  if (query.cursor) {
    // cursor 는 마지막 row 의 updated_at ISO
    q = q.lt("updated_at", query.cursor);
  }

  const { data, error } = await q;
  if (error || !data) {
    if (error) console.error("[/api/admissions/search] query error:", error.message);
    return { results: [] };
  }

  type Row = {
    id: string;
    university_id: string;
    campus_id: string;
    name: string;
    name_en: string | null;
    unit_type: Department["unitType"];
    track: Department["track"];
    total_quota: number;
    sub_departments: string[] | null;
    is_professional: boolean | null;
    professional_type: Department["professionalType"] | null;
    active: boolean;
    updated_at: string;
    universities: {
      id: string;
      n: string;
      name_en: string | null;
      short_name: string | null;
      d: string | null;
      category: University["category"];
      campuses: University["campuses"];
      rank_order: number | null;
      admission_guide_url: string | null;
      logo_url: string | null;
      website_url: string | null;
      active: boolean;
    };
    department_admissions: Array<{
      year: number;
      available_track_kinds: AdmissionTrackKind[];
    }>;
  };

  const items: SearchResultItem[] = [];

  for (const raw of data as unknown as Row[]) {
    const univ = raw.universities;
    if (query.category && univ.category !== query.category) continue;

    if (query.q) {
      const targetText = `${univ.n} ${univ.short_name ?? ""} ${raw.name}`;
      if (!matchesSearchQuery(targetText, query.q)) continue;
    }

    // 해당 연도 admissions
    const adm = raw.department_admissions.find((a) => a.year === year);
    let availableTracks: AdmissionTrackKind[] = adm?.available_track_kinds ?? [];
    if (!allowJaeoegukmin) {
      availableTracks = availableTracks.filter((k) => k !== "jaeoegukmin");
    }
    if (query.trackKind && !availableTracks.includes(query.trackKind)) continue;

    const primaryTrack: AdmissionTrackKind | undefined = availableTracks[0];
    let sampleSufficient = false;
    if (primaryTrack) {
      const statsId = `${univ.id}_${raw.id}_${year}_${primaryTrack}`;
      const { data: statsRow } = await sb
        .from("admission_sample_stats")
        .select("verified_count, weighted_count, accepted_count, stage1_passed_count, stage2_accepted_count")
        .eq("id", statsId)
        .maybeSingle();
      if (statsRow) {
        const stats: AdmissionSampleStats = {
          id: statsId,
          universityId: univ.id,
          departmentId: raw.id,
          year,
          trackKind: primaryTrack,
          verifiedCount: (statsRow as Record<string, unknown>).verified_count as number,
          weightedCount: (statsRow as Record<string, unknown>).weighted_count as number,
          acceptedCount: (statsRow as Record<string, unknown>).accepted_count as number,
          stage1PassedCount: (statsRow as Record<string, unknown>).stage1_passed_count as number | undefined,
          stage2AcceptedCount: (statsRow as Record<string, unknown>).stage2_accepted_count as number | undefined,
          updatedAt: new Date().toISOString() as unknown as AdmissionSampleStats["updatedAt"],
        };
        sampleSufficient = checkSampleSufficiency(stats).sufficient;
      }
    }

    items.push({
      department: rowToDepartment(raw),
      university: rowToUniversity(univ),
      sampleSufficient,
      availableTracks,
    });
  }

  const lastRow = (data as unknown as Row[])[(data as unknown as Row[]).length - 1];
  const nextCursor = data.length === query.limit ? lastRow?.updated_at : undefined;

  return {
    results: items,
    nextCursor,
    totalEstimate: items.length,
  };
}

function rowToDepartment(r: {
  id: string; university_id: string; campus_id: string; name: string; name_en: string | null;
  unit_type: Department["unitType"]; track: Department["track"]; total_quota: number;
  sub_departments: string[] | null; is_professional: boolean | null;
  professional_type: Department["professionalType"] | null; active: boolean; updated_at: string;
}): Department {
  return {
    id: r.id,
    universityId: r.university_id,
    campusId: r.campus_id,
    name: r.name,
    nameEn: r.name_en ?? undefined,
    unitType: r.unit_type,
    track: r.track,
    totalQuota: r.total_quota,
    subDepartments: r.sub_departments ?? undefined,
    isProfessional: r.is_professional ?? undefined,
    professionalType: r.professional_type ?? undefined,
    active: r.active,
    updatedAt: new Date(r.updated_at).toISOString() as unknown as Department["updatedAt"],
  };
}

function rowToUniversity(r: {
  id: string; n: string; name_en: string | null; short_name: string | null; d: string | null;
  category: University["category"]; campuses: University["campuses"]; rank_order: number | null;
  admission_guide_url: string | null; logo_url: string | null; website_url: string | null; active: boolean;
}): University {
  return {
    id: r.id,
    n: r.n,
    nameEn: r.name_en ?? undefined,
    shortName: r.short_name ?? undefined,
    d: r.d ?? undefined,
    category: r.category,
    campuses: r.campuses,
    rankOrder: r.rank_order ?? undefined,
    admissionGuideUrl: r.admission_guide_url ?? undefined,
    logoUrl: r.logo_url ?? undefined,
    websiteUrl: r.website_url ?? undefined,
    active: r.active,
    updatedAt: new Date().toISOString() as unknown as University["updatedAt"],
  };
}
