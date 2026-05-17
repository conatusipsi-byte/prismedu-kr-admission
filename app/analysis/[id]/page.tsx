/**
 * /analysis/[id] — 분석 결과 페이지
 *
 * Server Component 패턴:
 *   1. cookies → verifySessionCookie → uid (직접 검증, /api/match/[id]를 자기 호출하지 않음)
 *   2. matches/{id} Firestore 조회
 *   3. 본인 외 → notFound() (열거 차단)
 *   4. 결과 데이터를 AnalysisResultView (Client Component)로 hydrate
 *
 * 본인 외 접근에 대해 403 대신 notFound() — matchId 추측 차단을 위해 "있다" 정보 미노출.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getRouteSupabase, getAdminSupabase } from "@/lib/supabase-server";
import { AnalysisResultView } from "@/components/analysis/AnalysisResultView";
import type { MatchResponse, MatchResultItem } from "@/lib/schemas/api/match";

export const dynamic = "force-dynamic";

async function loadMatch(matchId: string): Promise<MatchResponse | null> {
  if (!matchId || !/^match_[a-zA-Z0-9_]+$/.test(matchId)) return null;

  // 1. Supabase 세션 → uid
  let uid: string;
  try {
    const sb = await getRouteSupabase();
    const { data: { user }, error } = await sb.auth.getUser();
    if (error || !user) return null;
    uid = user.id;
  } catch {
    return null;
  }

  // 2. matches 조회 + 본인 검증
  try {
    const sb = getAdminSupabase();
    const { data, error } = await sb
      .from("matches")
      .select("id, user_id, results, preview, global_caveats, created_at")
      .eq("id", matchId)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as unknown as {
      id: string;
      user_id: string;
      results: MatchResultItem[];
      preview: MatchResponse["preview"];
      global_caveats: string[];
      created_at: string;
    };
    if (row.user_id !== uid) return null;

    const response: MatchResponse = {
      matchId: row.id,
      createdAt: row.created_at,
      results: row.results,
      preview: row.preview,
      globalCaveats: row.global_caveats,
    };
    return response;
  } catch (e) {
    console.error("[/analysis/[id]] DB error:", e);
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `분석 결과 — conatusipsi`,
    description: "내신·수능·비교과 입력 기반 학과별 합격 가능성 분석 결과",
    // 본인 결과 페이지 — 검색 색인 차단
    robots: { index: false, follow: false },
    alternates: { canonical: `/analysis/${id}` },
  };
}

export default async function AnalysisResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactElement> {
  const { id } = await params;
  const data = await loadMatch(id);
  if (!data) notFound();

  return (
    <div
      data-page="analysis-result"
      className="mx-auto max-w-content-wide px-gutter-sm md:px-gutter lg:px-gutter-lg py-6"
    >
      <AnalysisResultView data={data} />
    </div>
  );
}
