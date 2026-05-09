/**
 * GET /api/match/[id] — 분석 결과 단일 조회 (Day 2 실 구현)
 *
 * 처리 단계:
 *   1. 인증 (requireAuth)
 *   2. matches/{id} 조회
 *   3. doc.userId === auth.uid 검증 — 본인 결과만 노출 (그 외 404, "있다" 정보 미노출)
 *   4. 응답 (저장 시점 결과 + preview 메타)
 *
 * 본인 외 접근에 대해 403 대신 404를 반환해 matchId 추측·열거를 차단.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { requireAuth } from "@/lib/api-auth";
import type { MatchResultItem } from "@/lib/schemas/api/match";

interface MatchDocPayload {
  id: string;
  userId: string;
  results: MatchResultItem[];
  preview: {
    plan: "free" | "pro" | "elite";
    freePreviewQuota: number;
    freePreviewUsed: number;
    lockedCount: number;
  };
  globalCaveats: string[];
  createdAt?: { toDate: () => Date };
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!id || !/^match_[a-zA-Z0-9_]+$/.test(id)) {
    return NextResponse.json({ error: "유효하지 않은 분석 ID" }, { status: 400 });
  }

  try {
    const db = getAdminDb();
    const snap = await db.collection("matches").doc(id).get();
    if (!snap.exists) {
      return NextResponse.json({ error: "분석 결과를 찾을 수 없습니다" }, { status: 404 });
    }
    const data = snap.data() as MatchDocPayload;

    // 본인 결과만 노출 — 타인 ID로는 "찾을 수 없습니다" 응답 (열거 차단)
    if (data.userId !== auth.uid) {
      return NextResponse.json({ error: "분석 결과를 찾을 수 없습니다" }, { status: 404 });
    }

    return NextResponse.json({
      matchId: data.id,
      createdAt: data.createdAt?.toDate?.()?.toISOString() ?? new Date().toISOString(),
      results: data.results,
      preview: data.preview,
      globalCaveats: data.globalCaveats,
    });
  } catch (e) {
    console.error("[/api/match/[id]] error:", e);
    return NextResponse.json(
      { error: "조회 중 오류가 발생했습니다" },
      { status: 500 },
    );
  }
}
