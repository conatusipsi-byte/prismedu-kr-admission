/**
 * GET /api/admin/sanitize-monitor — 통계 + 트렌드 + 로그 페이지네이션
 *
 * P-002 마스터 전용 — requireMasterAuth.
 * P-002 정직성: 사용자 식별 정보(saltedUidHash 원본·email) 응답 X. 마스킹 적용.
 *
 * ⚠️ TODO: Firestore monitoring/sanitizeEvents 연결.
 *    현재는 mock-sanitize-events 로 동작 검증.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireMasterAuth, zodErrorResponse } from "@/lib/api-auth";
import { AdminSanitizeMonitorQuerySchema } from "@/lib/schemas/api/admin";
import {
  computeStats,
  computeTrend,
  type StatPeriod,
} from "@/lib/admission/sanitize-events";
import {
  getMockEvents,
  getMockTotalChatCalls,
} from "@/lib/admission/mock-sanitize-events";

const PERIOD_HOURS: Record<StatPeriod, number> = {
  "24h": 24,
  "7d": 24 * 7,
  "30d": 24 * 30,
};

export async function GET(req: NextRequest) {
  // 1. Master 권한 강제 (P-002)
  const auth = await requireMasterAuth(req);
  if (!auth.ok) return auth.response;

  // 2. 입력 검증
  const params: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => {
    params[k] = v;
  });
  const parsed = AdminSanitizeMonitorQuerySchema.safeParse(params);
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const { view, limit } = parsed.data;

  // 3. period 추출 — 기존 schema 가 view/limit/from/to 만 지원해서
  //    period 별도 query 로 받음 (없으면 7d 기본).
  const periodParam = req.nextUrl.searchParams.get("period");
  const period: StatPeriod =
    periodParam === "24h" || periodParam === "30d" ? periodParam : "7d";

  try {
    // TODO: Firestore monitoring/sanitizeEvents 컬렉션 조회로 교체.
    //   const events = await fetchSanitizeEvents({ period, limit });
    const allEvents = getMockEvents();
    const cutoff = Date.now() - PERIOD_HOURS[period] * 3600_000;
    const periodEvents = allEvents.filter(
      (ev) => new Date(ev.occurredAt).getTime() >= cutoff,
    );

    const stats = computeStats(periodEvents, getMockTotalChatCalls(period), period);
    const trend = computeTrend(periodEvents, period);

    if (view === "events") {
      // 로그 페이지네이션 — 마스킹은 클라이언트에서 (응답엔 saltedUidHash 그대로)
      return NextResponse.json({
        view,
        period,
        stats,
        events: periodEvents.slice(0, limit),
        totalEvents: periodEvents.length,
      });
    }

    // 기본 daily — 통계 + 트렌드만. 로그는 페이지네이션 없이 최근 N건.
    return NextResponse.json({
      view: "daily",
      period,
      stats,
      trend,
      recentEvents: periodEvents.slice(0, Math.min(limit, 20)),
    });
  } catch (e) {
    console.error("[/api/admin/sanitize-monitor] error:", e);
    return NextResponse.json(
      { error: "조회 중 오류가 발생했습니다" },
      { status: 500 },
    );
  }
}
