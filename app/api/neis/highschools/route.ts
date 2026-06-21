/**
 * GET /api/neis/highschools?q=<검색어>
 *
 * 고등학교 자동완성 — high_schools 테이블(NEIS 학교기본정보 적재본)에서 검색.
 *
 * BUG fix (2026-06-21): 기존엔 매 요청마다 live NEIS Open API 호출 → Vercel 서버리스
 *   egress IP(icn1/AWS-Seoul)가 NEIS 의 클라우드 IP rate-limit 에 걸려 HTTP 500 →
 *   searchHighSchools 가 [] 반환 → 사용자에게 "검색 결과 0건". 키·리전 모두 정상이었음.
 *   → high_schools 테이블에서 서빙(live NEIS 의존 제거). 테이블 미적재(seed 전)일 때만
 *     live NEIS 로 graceful fallback. seed: scripts/etl/seed-highschools.ts.
 *
 * P-001 (비로그인 접근 가능): 인증 무관 — 가입 폼에서도 호출. 공개 데이터.
 * 정직성 (P-002): 결과 없음/오류 모두 빈 results (가짜 결과 X). source 로 출처 명시.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { searchHighSchools, type NeisHighSchool } from "@/lib/api/neis";
import { getAdminSupabase } from "@/lib/supabase-server";
import { zodErrorResponse } from "@/lib/api-auth";

/** icn1(Seoul) — 한국 사용자 근접 + NEIS fallback 시 한국 내부 호출. */
export const preferredRegion = "icn1";

const QuerySchema = z.object({
  q: z.string().min(1).max(50),
});

const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
};

/**
 * high_schools 테이블 검색.
 *   - 매칭 결과 있으면 반환.
 *   - 0건이지만 테이블에 데이터 있으면(seed 됨) [] 반환(진짜 무매칭).
 *   - 테이블이 비어 있으면(seed 전) null 반환 → 호출측이 live NEIS 로 fallback.
 */
async function searchFromDb(query: string): Promise<NeisHighSchool[] | null> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const sb = getAdminSupabase();
  // 사용자 입력의 LIKE 와일드카드(%, _) 는 리터럴로 escape.
  const pattern = `%${trimmed.replace(/[%_\\]/g, "\\$&")}%`;
  const { data, error } = await sb
    .from("high_schools")
    .select("code,name,region,office,address,name_en")
    .ilike("name", pattern)
    .order("name")
    .limit(100);
  if (error) {
    console.warn("[highschools] DB 조회 오류:", error.message);
    return null; // 오류 → fallback 시도
  }
  if (data && data.length > 0) {
    return data.map((r) => ({
      code: r.code,
      name: r.name,
      region: r.region ?? "",
      office: r.office ?? "",
      kind: "고등학교",
      address: r.address ?? undefined,
      nameEn: r.name_en ?? undefined,
    }));
  }
  // 0 매칭 — 테이블에 데이터가 있으면 진짜 무매칭, 없으면 seed 전(→ fallback)
  const { count } = await sb
    .from("high_schools")
    .select("code", { count: "exact", head: true });
  if ((count ?? 0) > 0) return [];
  return null;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const params: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => {
    params[k] = v;
  });
  const parsed = QuerySchema.safeParse(params);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  try {
    const fromDb = await searchFromDb(parsed.data.q);
    if (fromDb !== null) {
      return NextResponse.json(
        { source: "db", results: fromDb },
        { headers: CACHE_HEADERS },
      );
    }
    // 테이블 미적재(seed 전) — live NEIS 로 graceful fallback.
    const results = await searchHighSchools(parsed.data.q);
    return NextResponse.json(
      { source: "neis", results },
      { headers: CACHE_HEADERS },
    );
  } catch (e) {
    console.error("[/api/neis/highschools] error:", e);
    return NextResponse.json(
      { source: "db", results: [], error: "검색 중 오류가 발생했습니다" },
      { status: 200, headers: CACHE_HEADERS },
    );
  }
}
