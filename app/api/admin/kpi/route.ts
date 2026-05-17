/**
 * GET /api/admin/kpi — 운영자 대시보드 KPI (Supabase).
 *
 * 카운트:
 *   - 오늘 가입자 (profiles.created_at >= 오늘 0시)
 *   - 오늘 분석 요청 (matches.created_at >= 오늘 0시)
 *   - 오늘 결제 (orders.status='approved' AND created_at >= 오늘 0시)
 *   - 표본 부족 학과 비율 (admission_sample_stats.verified_count < 5 비율)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireMasterAuth } from "@/lib/api-auth";
import { getAdminSupabase } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireMasterAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const todayStart = startOfTodayKst();
    const sinceIso = todayStart.toISOString();

    const [signups, matches, paidOrders, sampleStats] = await Promise.all([
      countSince("profiles", sinceIso).catch(() => null),
      countSince("matches", sinceIso).catch(() => null),
      paidOrdersToday(sinceIso).catch(() => null),
      sampleInsufficientRatio().catch(() => null),
    ]);

    return NextResponse.json({
      todoSignupCount: signups,
      todayMatchCount: matches,
      todayPaidOrderCount: paidOrders,
      sampleInsufficientPercent: sampleStats,
      generatedAt: new Date().toISOString(),
      window: { from: todayStart.toISOString(), to: new Date().toISOString() },
    });
  } catch (e) {
    console.error("[/api/admin/kpi] error:", e);
    return NextResponse.json({ error: "KPI 집계 실패" }, { status: 500 });
  }
}

function startOfTodayKst(): Date {
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  kstNow.setUTCHours(0, 0, 0, 0);
  return new Date(kstNow.getTime() - 9 * 60 * 60 * 1000);
}

async function countSince(table: string, sinceIso: string): Promise<number> {
  const sb = getAdminSupabase();
  const { count, error } = await sb
    .from(table)
    .select("*", { count: "exact", head: true })
    .gte("created_at", sinceIso);
  if (error) throw error;
  return count ?? 0;
}

async function paidOrdersToday(sinceIso: string): Promise<number> {
  const sb = getAdminSupabase();
  const { count, error } = await sb
    .from("orders")
    .select("*", { count: "exact", head: true })
    .eq("status", "approved")
    .gte("created_at", sinceIso);
  if (error) throw error;
  return count ?? 0;
}

async function sampleInsufficientRatio(): Promise<number | null> {
  const sb = getAdminSupabase();
  const { count: total } = await sb
    .from("admission_sample_stats")
    .select("*", { count: "exact", head: true });
  if (!total || total === 0) return null;
  const { count: insufficient } = await sb
    .from("admission_sample_stats")
    .select("*", { count: "exact", head: true })
    .lt("verified_count", 5);
  return Math.round(((insufficient ?? 0) / total) * 100);
}
