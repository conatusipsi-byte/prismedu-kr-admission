"use client";

/**
 * EtlStatusOverview — 통계 카드 (Day 10)
 *
 * - 총 staging 항목 수
 * - 검수 대기 (promoted=false)
 * - 승격 완료
 * - trustLevel 분포 (suspicious 빨간 강조)
 * - 최근 7일 일별 업로드 (자체 SVG 막대 차트)
 *
 * P-002:
 *   - suspicious 카운트 0일 때만 mint 톤. 1+ 시 rose 강조 — 운영자가 즉시 인식.
 */

import * as React from "react";
import { AlertTriangle, CheckCircle2, Clock, FileBarChart } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import type { EtlStatusSummary } from "@/lib/admission/mock-etl-staging";

export interface EtlStatusOverviewProps {
  summary: EtlStatusSummary;
  className?: string;
}

export function EtlStatusOverview({
  summary,
  className,
}: EtlStatusOverviewProps): React.ReactElement {
  const suspiciousCount = summary.trustLevelCounts.suspicious;
  const hasSuspicious = suspiciousCount > 0;

  return (
    <div
      data-component="etl-status-overview"
      data-suspicious-count={suspiciousCount}
      className={cn("flex flex-col gap-3", className)}
    >
      {/* 카운터 4개 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={<FileBarChart className="h-4 w-4" />}
          label="전체 staging"
          value={summary.totalStaging}
          tone="neutral"
        />
        <StatCard
          icon={<Clock className="h-4 w-4" />}
          label="검수 대기"
          value={summary.pendingReview}
          tone={summary.pendingReview > 0 ? "amber" : "neutral"}
        />
        <StatCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="승격 완료"
          value={summary.promotedCount}
          tone="mint"
        />
        <StatCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="OCR 의심"
          value={suspiciousCount}
          tone={hasSuspicious ? "rose" : "neutral"}
        />
      </div>

      {/* trustLevel 분포 */}
      <Card>
        <CardContent className="flex flex-col gap-2 py-3">
          <h3 className="text-xs font-semibold">trustLevel 분포</h3>
          <div data-element="trust-level-bars" className="flex flex-col gap-1.5">
            <TrustBar
              label="신뢰 (UTF-8)"
              count={summary.trustLevelCounts.trusted}
              total={summary.totalStaging}
              tone="mint"
            />
            <TrustBar
              label="신뢰 (Adobe-Korea1 fallback)"
              count={summary.trustLevelCounts["trusted-fallback"]}
              total={summary.totalStaging}
              tone="amber"
            />
            <TrustBar
              label="검수 필요 (OCR)"
              count={summary.trustLevelCounts.suspicious}
              total={summary.totalStaging}
              tone="rose"
            />
          </div>
        </CardContent>
      </Card>

      {/* 최근 7일 시계열 (자체 SVG) */}
      <Card>
        <CardContent className="flex flex-col gap-2 py-3">
          <h3 className="text-xs font-semibold">최근 7일 업로드</h3>
          <Last7DaysChart data={summary.last7DaysUploads} />
        </CardContent>
      </Card>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   하위 — StatCard
   ═══════════════════════════════════════════════════════════════════════ */

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "neutral" | "mint" | "amber" | "rose";
}

const TONE_CLASS: Record<StatCardProps["tone"], string> = {
  neutral: "border-border bg-card",
  mint: "border-brand-200 bg-brand-50/30 dark:border-brand-800/40 dark:bg-brand-950/15",
  amber: "border-amber-200 bg-amber-50/30 dark:border-amber-900/40 dark:bg-amber-900/10",
  rose: "border-rose-300 bg-rose-50/40 dark:border-rose-900/40 dark:bg-rose-950/15",
};

function StatCard({ icon, label, value, tone }: StatCardProps): React.ReactElement {
  return (
    <div
      data-stat-card={label}
      data-tone={tone}
      className={cn("rounded-lg border p-3", TONE_CLASS[tone])}
    >
      <div className="mb-1 flex items-center gap-1.5 text-2xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   하위 — TrustBar
   ═══════════════════════════════════════════════════════════════════════ */

interface TrustBarProps {
  label: string;
  count: number;
  total: number;
  tone: "mint" | "amber" | "rose";
}

function TrustBar({ label, count, total, tone }: TrustBarProps): React.ReactElement {
  const pct = total === 0 ? 0 : Math.round((count / total) * 100);
  const fillClass: Record<TrustBarProps["tone"], string> = {
    mint: "bg-brand-500",
    amber: "bg-amber-500",
    rose: "bg-rose-500",
  };
  return (
    <div className="grid grid-cols-[10rem_1fr_auto] items-center gap-2 text-2xs">
      <span className="text-muted-foreground">{label}</span>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full transition-all", fillClass[tone])}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="tabular-nums">
        {count} <span className="text-muted-foreground">({pct}%)</span>
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   하위 — Last7DaysChart (자체 SVG 막대)
   ═══════════════════════════════════════════════════════════════════════ */

const CHART_W = 480;
const CHART_H = 80;
const BAR_GAP = 4;

function Last7DaysChart({ data }: { data: EtlStatusSummary["last7DaysUploads"] }): React.ReactElement {
  const max = Math.max(1, ...data.map((d) => d.count));
  const barW = (CHART_W - BAR_GAP * (data.length - 1)) / data.length;

  return (
    <svg
      viewBox={`0 0 ${CHART_W} ${CHART_H + 14}`}
      width="100%"
      height={CHART_H + 20}
      role="img"
      aria-label="최근 7일 ETL 업로드 시계열"
      data-element="last7days-chart"
    >
      {data.map((d, i) => {
        const h = (d.count / max) * CHART_H;
        const x = i * (barW + BAR_GAP);
        const y = CHART_H - h;
        return (
          <g key={d.date}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={h}
              rx={2}
              fill="hsl(var(--brand-500, 180 100% 39%))"
              className="fill-brand-500"
            />
            <text
              x={x + barW / 2}
              y={CHART_H + 12}
              fontSize="9"
              textAnchor="middle"
              className="fill-muted-foreground"
            >
              {d.date.slice(5)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
