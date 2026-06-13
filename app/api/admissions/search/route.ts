/**
 * GET /api/admissions/search — 학과 검색 (공개, Supabase).
 *
 * P-001: 비로그인 접근 가능. 응답에 합격률·확률 미포함 (정형 정보만).
 * P-013: jaeoegukmin 트랙은 명시적 trackKind 필터일 때만 노출.
 *
 * 2026-05-25 QA round 2 P0 재설계 — 4중 결함 수정:
 *   #1 키워드 매칭을 DB 로 push (ILIKE) — JS 후처리 제거.
 *   #2 cursor 를 offset 인코딩으로 전환 — 동일 updated_at 묶음 문제 회피.
 *   #3 ORDER BY 에 (university_id, id) tiebreak 추가 — 결정적 동작 보장.
 *   #4 키워드 검색 시 학교명·단축명 매칭 ID 를 사전 풀링 → departments.name
 *      OR university_id.in.(...) 결합 — PostgREST foreign-table OR 미지원 우회.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase-server";
import {
  AdmissionsSearchQuerySchema,
  type AdmissionsSearchQuery,
} from "@/lib/schemas/api/admissions";
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
      query.q || query.category || query.trackKind || query.trackCategory || query.specialType
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

/**
 * cursor 디코딩 — 신규 offset 인코딩 `o:<n>` 우선, legacy timestamp 는 무시 (offset 0).
 *
 * Legacy 호환: prior version 은 cursor 로 ISO timestamp 를 발급했다. 신규 클라이언트가
 * 받는 cursor 는 항상 `o:<n>` 형식. 옛 cursor 가 그대로 재전송돼도 안전하게 무시 (첫 페이지).
 */
function decodeOffset(cursor: string | undefined): number {
  if (!cursor) return 0;
  const m = /^o:(\d+)$/.exec(cursor);
  if (!m) return 0;
  return Math.max(0, parseInt(m[1], 10));
}

async function searchDepartments(
  query: AdmissionsSearchQuery,
  allowJaeoegukmin: boolean,
): Promise<SearchResponse> {
  const sb = getAdminSupabase();
  const year = new Date().getFullYear() + 1;
  const offset = decodeOffset(query.cursor);

  /* ─────────────────────────────────────────────────────────────────────
     BUG-020 (QA round 3, 2026-05-25): RPC 단일 호출로 라운드로빈 정렬.
     ROW_NUMBER OVER (PARTITION BY university_id) 가 PostgREST 표현 불가 →
     SECURITY INVOKER RPC search_admissions_v2 가 모든 필터 + 라운드로빈 처리.
     PostgREST 시절의 ILIKE 이스케이프 / 키워드 사전 풀링 / category·trackKind·
     degreeCourse·daytime 필터는 RPC 내부에서 동일 의미로 재구현.

     dedup (legacy vs KCUE pattern) 과 jaeoegukmin display strip / sample_stats
     lookup 은 페이지별 동작이라 RPC 외부 (아래 JS) 유지.
     ───────────────────────────────────────────────────────────────────── */
  const trackCategoryFiltered = query.trackCategory?.filter((c) =>
    ["humanities", "social", "natural", "engineering", "medical", "arts", "interdisciplinary"].includes(c),
  );
  const { data, error } = await sb.rpc("search_admissions_v2", {
    p_category: query.category ?? null,
    p_track: query.track ?? null,
    p_track_category: trackCategoryFiltered && trackCategoryFiltered.length > 0 ? trackCategoryFiltered : null,
    p_track_kind: query.trackKind ?? null,
    p_special_type: query.specialType ?? null,
    p_keyword: query.q ?? null,
    p_degree_course: query.degreeCourse ?? "학사",
    p_year: year,
    p_limit: query.limit,
    p_offset: offset,
  });
  if (error || !data) {
    if (error) console.error("[/api/admissions/search] rpc error:", error.message);
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
  const isKcueImportedId = (id: string): boolean => /^u\d{8,}-(ba|ma|phd|ass)-[dnx]$/.test(id);
  const rawRows = data as unknown as Row[];
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
      if (isKcueImportedId(raw.id) && legacyOwned.has(dedupKey)) continue;
      if (dedupSeen.has(dedupKey)) continue;
      dedupSeen.add(dedupKey);
    }
    const univ = raw.universities;

    // 해당 연도 admissions
    const adm = raw.department_admissions.find((a) => a.year === year);
    let availableTracks: AdmissionTrackKind[] = adm?.available_track_kinds ?? [];
    if (!allowJaeoegukmin) {
      // P-013 — 응답 display 에서 jaeoegukmin 숨김 (사용자가 명시적으로 trackKind 에 포함시키지 않은 한).
      availableTracks = availableTracks.filter((k) => k !== "jaeoegukmin");
    }
    // QA round 3 — trackKind 필터는 DB-side (overlaps + inner join). JS 후처리 제거.

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

  // 다음 페이지 cursor — DB 가 limit 만큼 채워서 돌려줬으면 다음 offset 발급.
  const nextCursor = data.length === query.limit ? `o:${offset + query.limit}` : undefined;

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
