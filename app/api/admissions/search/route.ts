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
  ADMISSIONS_SEARCH_EXCLUDE_NIGHT,
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

  // P-013 진입점 분리 — 호출자가 trackKind 목록에 jaeoegukmin 을 명시했을 때만 노출.
  const allowJaeoegukmin = query.trackKind?.includes("jaeoegukmin") ?? false;

  try {
    const result = await searchDepartments(query, allowJaeoegukmin);
    const cacheHeaders =
      query.q || query.category || query.trackKind || query.trackCategory
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

  // 학위과정 필터 — 'all' 이면 미적용, default '학사'
  if (query.degreeCourse !== "all") {
    // NULL 인 legacy row 도 학사로 간주 — 마이그레이션에서 backfill 완료
    q = q.or(`degree_course.eq.${query.degreeCourse},degree_course.is.null`);
  }
  // 주야 필터 — 야간 학과는 항상 제외 (입시 추천 도메인 외).
  // DB 에는 보존되지만 검색 결과 노출 X. 정책: ADMISSIONS_SEARCH_EXCLUDE_NIGHT.
  if (ADMISSIONS_SEARCH_EXCLUDE_NIGHT) {
    q = q.or("daytime.eq.주간,daytime.is.null");
  }

  // 대학 카테고리 필터 — RegionFilter (서울권/경기권/지방국립/지방사립/특수대학) UI 에서
  // REGION_GROUP_TO_CATEGORIES 매핑을 거쳐 들어온 UniversityCategory 배열.
  // 임베드된 universities 테이블 컬럼에 대해 PostgREST `universities.category` 문법으로 IN 필터.
  // 한도 적용(limit) 이전에 DB 단계에서 거르므로, "특수대학 5곳" 같은 좁은 카테고리도
  // 결과가 빈 채로 도착하지 않는다 (이전 post-filter 방식의 잠재 결함 동시 수정).
  if (query.category && query.category.length > 0) {
    q = q.in("universities.category", query.category);
  }
  if (query.track) {
    q = q.eq("track", query.track);
  }
  // 계열 다중 필터 — trackCategory (콤마 구분) 가 있으면 departments.track 의 OR 매칭.
  // 'business'/'language' 는 직접 매칭 안 되므로 제외 (후속 PR 에서 메타데이터 분리).
  if (query.trackCategory && query.trackCategory.length > 0) {
    const validTracks = query.trackCategory.filter((c) =>
      ["humanities", "social", "natural", "engineering", "medical", "arts", "interdisciplinary"].includes(c),
    );
    if (validTracks.length > 0) {
      q = q.in("track", validTracks);
    }
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
    kedi_mjr_id: string | null;
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
  // (university_id, kedi_mjr_id) 중복 차단 — legacy row 우선.
  // KCUE-imported row 의 id 는 `<lowercase>-ba-d` 패턴 (긴 hex+suffix), legacy 는 짧은 slug.
  // 같은 (univ, kediMjrId) 의 row 가 multiple 등장하면 KCUE 패턴 row 들을 skip.
  const isKcueImportedId = (id: string): boolean => /^u\d{8,}-(ba|ma|phd|ass)-[dnx]$/.test(id);
  const rawRows = data as unknown as Row[];
  // (univ, kediMjrId) 중 legacy(=KCUE 패턴 아닌 id) row 가 존재하는 키 집합 미리 산출
  const legacyOwned = new Set<string>();
  for (const raw of rawRows) {
    if (raw.kedi_mjr_id && !isKcueImportedId(raw.id)) {
      legacyOwned.add(`${raw.university_id}/${raw.kedi_mjr_id}`);
    }
  }
  const dedupSeen = new Set<string>();

  for (const raw of rawRows) {
    if (raw.kedi_mjr_id) {
      const dedupKey = `${raw.university_id}/${raw.kedi_mjr_id}`;
      // legacy 가 이 키를 소유하는데 현재 row 가 KCUE 패턴이면 skip
      if (isKcueImportedId(raw.id) && legacyOwned.has(dedupKey)) continue;
      if (dedupSeen.has(dedupKey)) continue;
      dedupSeen.add(dedupKey);
    }
    const univ = raw.universities;

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
    // 다중 trackKind — OR 매칭 (1개라도 학과 트랙에 포함되면 통과).
    if (query.trackKind && query.trackKind.length > 0) {
      const anyMatch = query.trackKind.some((tk) => availableTracks.includes(tk));
      if (!anyMatch) continue;
    }

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
