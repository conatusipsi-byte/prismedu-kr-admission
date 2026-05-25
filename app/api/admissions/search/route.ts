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
  ADMISSIONS_SEARCH_EXCLUDE_NIGHT,
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

/**
 * ILIKE 특수문자 이스케이프 — `%` `_` `\` 를 리터럴로 처리.
 * 사용자 입력을 SQL pattern 으로 쓰기 전 필수.
 */
function escapeIlike(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * PostgREST `.or()` 값 안에서 안전한 문자열 — 콤마/괄호는 PostgREST 문법 충돌.
 * `*` 를 ILIKE wildcard 로 변환하기 전이라서, 사용자 입력 그대로 ILIKE 패턴에 끼우기.
 * 콤마는 OR 구분자라 escape 가 없는 PostgREST .or() 문법에서 사용자 입력을 보호하려면
 * 쿼리 단계에서 콤마를 미리 제거하거나 분리한다. 입력 q 는 max 100자 (zod) 라
 * 콤마 포함 시 search 의미가 모호하므로 콤마는 공백으로 치환.
 */
function safeForPostgrestOr(s: string): string {
  return s.replace(/[,()]/g, " ").trim();
}

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
     1) 키워드 검색 시 학교명·단축명·영문명 매칭 univ ID 사전 풀링.
        PostgREST 가 foreign-table OR (예: `name.ilike OR universities.n.ilike`)
        를 지원하지 않으므로 두 쿼리 패턴 사용.
     ───────────────────────────────────────────────────────────────────── */
  let universityIdsForKeyword: string[] | null = null;
  let keywordPattern: string | null = null;
  if (query.q) {
    const raw = safeForPostgrestOr(query.q);
    if (raw.length > 0) {
      keywordPattern = `%${escapeIlike(raw)}%`;
      const { data: univIds, error: univErr } = await sb
        .from("universities")
        .select("id")
        .eq("active", true)
        .or(
          `n.ilike.${keywordPattern},short_name.ilike.${keywordPattern},name_en.ilike.${keywordPattern}`,
        )
        .limit(500); // 한 검색어가 500개 학교를 가리킬 일은 없음 — 안전 캡
      if (univErr) {
        console.error("[/api/admissions/search] univ keyword lookup:", univErr.message);
        return { results: [] };
      }
      universityIdsForKeyword = (univIds ?? []).map((r) => r.id as string);
    }
  }

  /* ─────────────────────────────────────────────────────────────────────
     2) departments 메인 쿼리 — 모든 필터 DB-side.
        trackKind 가 있으면 department_admissions inner join + year + overlaps
        (QA round 3, 2026-05-25). 없으면 좌측 임베드 (admissions 없는 dept 도 노출).
     ───────────────────────────────────────────────────────────────────── */
  const wantsTrackKindFilter = Boolean(query.trackKind && query.trackKind.length > 0);
  const admEmbed = wantsTrackKindFilter
    ? "department_admissions!inner ( year, available_track_kinds )"
    : "department_admissions ( year, available_track_kinds )";

  let q = sb
    .from("departments")
    .select(`
      *,
      universities!inner ( * ),
      ${admEmbed}
    `)
    .eq("active", true)
    .eq("universities.active", true)
    // BUG-019 (QA round 3, 2026-05-25): KCUE 메타 분류 학과 제외.
    // "기타(소속학과없음)" (315건) + "기타모집단위" (140+건) — 사용자에게 무의미한 placeholder.
    // 전체 9개 패턴 모두 "기타" prefix. 실제 한국어 학과 중 "기타" prefix 인 정상 학과는 없음.
    // 데이터 자체는 보존 (admin 페이지에서는 여전히 접근 가능).
    .not("name", "ilike", "기타%")
    // 결정적 순서 — updated_at 동일 묶음 안에서도 같은 순서 보장.
    .order("updated_at", { ascending: false })
    .order("university_id", { ascending: true })
    .order("id", { ascending: true })
    .range(offset, offset + query.limit - 1);

  // QA round 3 — trackKind 필터 DB pushdown (JS post-filter 제거).
  // department_admissions.year = current year + 1 + available_track_kinds && ARRAY[...].
  // GIN 인덱스 dept_admissions_track_kinds_idx 사용 → overlaps O(log N).
  if (wantsTrackKindFilter) {
    q = q
      .eq("department_admissions.year", year)
      .overlaps("department_admissions.available_track_kinds", query.trackKind!);
  }

  // 학위과정 필터 — 'all' 이면 미적용, default '학사'
  if (query.degreeCourse !== "all") {
    q = q.or(`degree_course.eq.${query.degreeCourse},degree_course.is.null`);
  }
  // 주야 필터 — 야간 학과는 항상 제외 (입시 추천 도메인 외).
  if (ADMISSIONS_SEARCH_EXCLUDE_NIGHT) {
    q = q.or("daytime.eq.주간,daytime.is.null");
  }

  // 대학 카테고리 필터 — 임베드된 universities 컬럼 IN.
  if (query.category && query.category.length > 0) {
    q = q.in("universities.category", query.category);
  }
  if (query.track) {
    q = q.eq("track", query.track);
  }
  if (query.trackCategory && query.trackCategory.length > 0) {
    const validTracks = query.trackCategory.filter((c) =>
      ["humanities", "social", "natural", "engineering", "medical", "arts", "interdisciplinary"].includes(c),
    );
    if (validTracks.length > 0) {
      q = q.in("track", validTracks);
    }
  }

  /* 키워드 필터 — DB pushdown (BUG #1 fix):
     departments.name ILIKE  OR  university_id IN (universities matching 학교명/단축명/영문명).
     키워드가 있는데 매칭 학교 0개 + departments.name 매칭도 0개 → 결과 0건.
     PostgREST 는 .or() 안에서 .in. 을 지원: `in.(id1,id2,...)`. */
  if (query.q && keywordPattern) {
    const safeIds = (universityIdsForKeyword ?? [])
      .filter((id) => /^[A-Za-z0-9_-]{1,64}$/.test(id)) // PostgREST .in() 안전성 보장
      .slice(0, 200);
    const conditions: string[] = [`name.ilike.${keywordPattern}`];
    if (safeIds.length > 0) {
      conditions.push(`university_id.in.(${safeIds.join(",")})`);
    }
    q = q.or(conditions.join(","));
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
