"use client";

/**
 * SampleStatsOverview — 합격사례 표본 통계 카드 (Day 11)
 *
 * - sufficient·insufficient 카운터
 * - 사유별 분포 (no_data·below_threshold·weighted_below·no_accepted)
 * - 표본 부족 비율 → 운영자 ETL 캠페인 우선순위 결정
 *
 * P-002:
 *   - insufficient > 0 → rose 강조 (운영자 즉시 인식)
 *   - 사유별 분포로 어떤 학과가 데이터 모으면 좋은지 안내
 */

import * as React from "react";
import { AlertCircle, CheckCircle2, FileBarChart } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import type { SampleStatsSummary } from "@/lib/admission/sample-stats-summary";

const REASON_LABEL: Record<keyof SampleStatsSummary["byReason"], string> = {
  no_data: "집계 도큐먼트 없음",
  below_threshold: "합격 사례 부족 (5건 미만)",
  weighted_below: "검증 가중치 부족 (자가보고 위주)",
  no_accepted: "합격자 0건",
};

export interface SampleStatsOverviewProps {
  summary: SampleStatsSummary;
  className?: string;
}

export function SampleStatsOverview({
  summary,
  className,
}: SampleStatsOverviewProps): React.ReactElement {
  const insufficientPct =
    summary.total === 0 ? 0 : Math.round((summary.insufficient / summary.total) * 100);

  return (
    <div
      data-component="sample-stats-overview"
      data-insufficient-count={summary.insufficient}
      className={cn("flex flex-col gap-3", className)}
    >
      {/* 카운터 3개 */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          icon={<FileBarChart className="h-4 w-4" />}
          label="전체 학과·트랙"
          value={summary.total}
          tone="neutral"
        />
        <StatCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="표본 충족"
          value={summary.sufficient}
          tone="mint"
        />
        <StatCard
          icon={<AlertCircle className="h-4 w-4" />}
          label="표본 부족"
          value={summary.insufficient}
          subLabel={summary.insufficient > 0 ? `${insufficientPct}%` : undefined}
          tone={summary.insufficient > 0 ? "rose" : "neutral"}
        />
      </div>

      {/* 사유별 분포 */}
      <Card>
        <CardContent className="flex flex-col gap-2 py-3">
          <h3 className="text-xs font-semibold">표본 부족 사유 분포</h3>
          {summary.insufficient === 0 ? (
            <p className="text-2xs text-muted-foreground">표본 부족 학과 없음 — 모든 학과 분석 활성.</p>
          ) : (
            <ul data-element="reason-list" className="flex flex-col gap-1">
              {(Object.keys(REASON_LABEL) as Array<keyof SampleStatsSummary["byReason"]>).map((k) => (
                <ReasonBar
                  key={k}
                  label={REASON_LABEL[k]}
                  count={summary.byReason[k]}
                  total={summary.insufficient}
                  reasonKey={k}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  subLabel?: string;
  tone: "neutral" | "mint" | "rose";
}

const TONE_CLASS: Record<StatCardProps["tone"], string> = {
  neutral: "border-border bg-card",
  mint: "border-mint-200 bg-mint-50/30 dark:border-mint-800/40 dark:bg-mint-950/15",
  rose: "border-rose-300 bg-rose-50/40 dark:border-rose-900/40 dark:bg-rose-950/15",
};

function StatCard({ icon, label, value, subLabel, tone }: StatCardProps): React.ReactElement {
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
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold tabular-nums">{value}</span>
        {subLabel && <span className="text-2xs text-muted-foreground">{subLabel}</span>}
      </div>
    </div>
  );
}

interface ReasonBarProps {
  label: string;
  count: number;
  total: number;
  reasonKey: keyof SampleStatsSummary["byReason"];
}

function ReasonBar({ label, count, total, reasonKey }: ReasonBarProps): React.ReactElement {
  const pct = total === 0 ? 0 : Math.round((count / total) * 100);
  return (
    <li
      data-reason={reasonKey}
      className="grid grid-cols-[14rem_1fr_auto] items-center gap-2 text-2xs"
    >
      <span className="text-muted-foreground">{label}</span>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-rose-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="tabular-nums">
        {count} <span className="text-muted-foreground">({pct}%)</span>
      </span>
    </li>
  );
}
