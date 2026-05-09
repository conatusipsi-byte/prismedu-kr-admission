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
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { SESSION_COOKIE_NAME } from "@/lib/api-auth";
import { AnalysisResultView } from "@/components/analysis/AnalysisResultView";
import type { MatchResponse, MatchResultItem } from "@/lib/schemas/api/match";

interface MatchDocPayload {
  id: string;
  userId: string;
  results: MatchResultItem[];
  preview: MatchResponse["preview"];
  globalCaveats: string[];
  createdAt?: { toDate?: () => Date };
}

export const dynamic = "force-dynamic";

async function loadMatch(matchId: string): Promise<MatchResponse | null> {
  // matchId 형식 검증 — POST /api/match와 동일한 정규식 (열거 차단)
  if (!matchId || !/^match_[a-zA-Z0-9_]+$/.test(matchId)) return null;

  // 1. 세션 쿠키 → uid
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!session) return null;

  let uid: string;
  try {
    const decoded = await getAdminAuth().verifySessionCookie(session, true);
    uid = decoded.uid;
  } catch {
    return null;
  }

  // 2. Firestore 조회 + 본인 검증
  try {
    const snap = await getAdminDb().collection("matches").doc(matchId).get();
    if (!snap.exists) return null;
    const data = snap.data() as MatchDocPayload;
    if (data.userId !== uid) return null;

    return {
      matchId: data.id,
      createdAt: data.createdAt?.toDate?.()?.toISOString() ?? new Date().toISOString(),
      results: data.results,
      preview: data.preview,
      globalCaveats: data.globalCaveats,
    };
  } catch (e) {
    console.error("[/analysis/[id]] firestore error:", e);
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
