/**
 * GET /api/match/[id] — 분석 결과 단일 조회 (Supabase).
 *
 *   1. 인증 (requireAuth)
 *   2. matches 테이블에서 id 조회
 *   3. user_id === auth.uid 검증 — 본인 결과만 (그 외 404, 열거 차단)
 *   4. 응답 (저장 시점 결과 + preview 메타)
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase-server";
import { requireAuth } from "@/lib/api-auth";
import type { MatchResultItem } from "@/lib/schemas/api/match";

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
    const sb = getAdminSupabase();
    const { data, error } = await sb
      .from("matches")
      .select("id, user_id, results, preview, global_caveats, created_at")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) {
      return NextResponse.json({ error: "분석 결과를 찾을 수 없습니다" }, { status: 404 });
    }
    const row = data as {
      id: string;
      user_id: string;
      results: MatchResultItem[];
      preview: {
        plan: "free" | "pro" | "elite";
        freePreviewQuota: number;
        freePreviewUsed: number;
        lockedCount: number;
      };
      global_caveats: string[];
      created_at: string;
    };

    if (row.user_id !== auth.uid) {
      return NextResponse.json({ error: "분석 결과를 찾을 수 없습니다" }, { status: 404 });
    }

    return NextResponse.json({
      matchId: row.id,
      createdAt: row.created_at,
      results: row.results,
      preview: row.preview,
      globalCaveats: row.global_caveats,
    });
  } catch (e) {
    console.error("[/api/match/[id]] error:", e);
    return NextResponse.json(
      { error: "조회 중 오류가 발생했습니다" },
      { status: 500 },
    );
  }
}
