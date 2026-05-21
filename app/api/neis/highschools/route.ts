/**
 * GET /api/neis/highschools?q=<검색어>
 *
 * NEIS 학교기본정보 API 프록시 — NEIS_API_KEY 를 클라이언트에 노출하지 않기
 * 위한 서버 라우트. 고등학교만 반환.
 *
 * P-001 (비로그인 접근 가능):
 *   본 라우트는 인증 무관 — 가입 폼에서도 호출됨. NEIS 데이터는 공개 정보.
 *
 * 캐싱:
 *   - lib/api/neis.ts 의 in-memory 캐시 (서버 인스턴스당 30분 TTL).
 *   - HTTP 응답에 Cache-Control 추가 — CDN/브라우저 캐시도 활용.
 *
 * 정직성 (P-002):
 *   - 결과 없음 / 키 미설정 / 네트워크 오류 모두 빈 results 반환 (가짜 결과 X).
 *   - source 필드로 출처(NEIS) 명시.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { searchHighSchools } from "@/lib/api/neis";
import { zodErrorResponse } from "@/lib/api-auth";

/**
 * Region — Seoul (icn1).
 *
 * NEIS (open.neis.go.kr) 는 외국 IP egress 차단 → 미국 region (iad1) 에서
 * 호출 시 HTTP 500 응답. icn1 강제로 한국 내부에서 호출되도록 한다.
 */
export const preferredRegion = "icn1";

const QuerySchema = z.object({
  q: z.string().min(1).max(50),
});

const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
};

export async function GET(req: NextRequest): Promise<NextResponse> {
  const params: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => {
    params[k] = v;
  });
  const parsed = QuerySchema.safeParse(params);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  try {
    const results = await searchHighSchools(parsed.data.q);
    return NextResponse.json(
      { source: "neis", results },
      { headers: CACHE_HEADERS },
    );
  } catch (e) {
    console.error("[/api/neis/highschools] error:", e);
    return NextResponse.json(
      { source: "neis", results: [], error: "검색 중 오류가 발생했습니다" },
      { status: 200, headers: CACHE_HEADERS },
    );
  }
}
