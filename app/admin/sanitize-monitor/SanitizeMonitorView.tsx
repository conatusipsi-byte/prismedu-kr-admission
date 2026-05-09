"use client";

/**
 * SanitizeMonitorView — sanitize 모니터링 페이지 본체 (Client Component)
 *
 * 책임:
 *   - 기간 필터 (24h/7d/30d) 상태
 *   - 통계·트렌드·로그 데이터 fetch (TODO: /api/admin/sanitize-monitor)
 *   - 행 클릭 시 모달 open
 *
 * P-002:
 *   - 마스터 권한 미검증 시 fallback (TODO 라우트 가드)
 *   - 마스킹된 사용자 ID, 매칭 키워드만 직접 노출
 */

import * as React from "react";
import { SanitizeStatsCards } from "@/components/admin/SanitizeStatsCards";
import { SanitizeTrendChart } from "@/components/admin/SanitizeTrendChart";
import { SanitizeLogTable } from "@/components/admin/SanitizeLogTable";
import { SanitizeLogDetailModal } from "@/components/admin/SanitizeLogDetailModal";
import {
  computeStats,
  computeTrend,
  type SanitizeEvent,
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

export function SanitizeMonitorView() {
  const [period, setPeriod] = React.useState<StatPeriod>("7d");
  const [selectedLog, setSelectedLog] = React.useState<SanitizeEvent | null>(null);

  // TODO: /api/admin/sanitize-monitor 호출로 교체
  const allEvents = React.useMemo(() => getMockEvents(), []);

  // 기간 필터링
  const periodEvents = React.useMemo(() => {
    const cutoff = Date.now() - PERIOD_HOURS[period] * 3600_000;
    return allEvents.filter(
      (ev) => new Date(ev.occurredAt).getTime() >= cutoff,
    );
  }, [allEvents, period]);

  const stats = React.useMemo(
    () => computeStats(periodEvents, getMockTotalChatCalls(period), period),
    [periodEvents, period],
  );

  const trend = React.useMemo(
    () => computeTrend(periodEvents, period),
    [periodEvents, period],
  );

  return (
    <div data-component="sanitize-monitor-view" className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">카운슬러 가드 모니터링</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          AI 카운슬러의 sanitize 후처리 발동 추이와 회귀 의심 검수 — P-002
          정직성 운영 방어선.
        </p>
      </header>

      {/* mock 안내 — 운영 환경에서는 제거 */}
      <div
        data-element="mock-banner"
        className="rounded-md border border-amber-200 bg-amber-50/40 p-3 text-xs leading-relaxed text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200"
      >
        ⚠️ <strong>Mock 데이터 표시 중</strong> — Firestore 연결 후 실 데이터로 교체. 본 화면의
        통계·로그는 시연용입니다.
      </div>

      <SanitizeStatsCards stats={stats} />

      <SanitizeTrendChart
        period={period}
        data={trend}
        onPeriodChange={setPeriod}
      />

      <SanitizeLogTable logs={periodEvents} onRowClick={setSelectedLog} />

      <SanitizeLogDetailModal
        log={selectedLog}
        onClose={() => setSelectedLog(null)}
      />
    </div>
  );
}
