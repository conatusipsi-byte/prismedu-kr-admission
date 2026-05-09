/**
 * SanitizeStatsCards — 4개 통계 카드 (sanitize 모니터링 상단)
 *
 * P-002: 회귀 의심(unresolved) 임계 초과 시 빨간 뱃지 시각 강조.
 */

import {
  AlertCircle,
  AlertTriangle,
  ShieldCheck,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  REGRESSION_ALERT_THRESHOLD,
  type SanitizeStats,
  type StatPeriod,
} from "@/lib/admission/sanitize-events";

export interface SanitizeStatsCardsProps {
  stats: SanitizeStats;
  className?: string;
}

export function SanitizeStatsCards({ stats, className }: SanitizeStatsCardsProps) {
  const alertThreshold = REGRESSION_ALERT_THRESHOLD[stats.period];
  const isOverAlert = stats.unresolvedRegressionCount >= alertThreshold;
  const periodLabel = PERIOD_LABEL[stats.period];

  return (
    <div
      data-component="sanitize-stats-cards"
      className={cn(
        "grid grid-cols-2 gap-3 md:grid-cols-4",
        className,
      )}
    >
      <StatCard
        icon={Activity}
        label={`${periodLabel} 발동률`}
        value={`${(stats.triggerRate * 100).toFixed(2)}%`}
        sub={`${stats.totalTriggers}건 / 채팅 ${Math.round(
          stats.triggerRate > 0 ? stats.totalTriggers / stats.triggerRate : 0,
        )}회`}
        accent="default"
      />
      <StatCard
        icon={ShieldCheck}
        label="차단 키워드 종류"
        value={String(stats.uniqueKeywords)}
        sub="unique 키워드 수"
        accent="default"
      />
      <StatCard
        icon={AlertTriangle}
        label="표본 부족 트리거"
        value={String(stats.insufficientSampleCount)}
        sub="P-001 정직성 발동"
        accent="default"
      />
      <StatCard
        icon={AlertCircle}
        label="회귀 의심"
        value={String(stats.regressionSuspectCount)}
        sub={
          stats.unresolvedRegressionCount > 0
            ? `미해결 ${stats.unresolvedRegressionCount}건`
            : "전부 검수 완료"
        }
        accent={isOverAlert ? "alert" : "default"}
        data-alert={isOverAlert ? "true" : "false"}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   서브 — StatCard
   ═══════════════════════════════════════════════════════════════════════ */

const PERIOD_LABEL: Record<StatPeriod, string> = {
  "24h": "24시간",
  "7d": "7일",
  "30d": "30일",
};

interface StatCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub: string;
  accent: "default" | "alert";
  "data-alert"?: string;
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
  ...rest
}: StatCardProps) {
  const isAlert = accent === "alert";
  return (
    <Card
      data-element="stat-card"
      data-accent={accent}
      {...rest}
      className={cn(
        isAlert &&
          "border-rose-300 bg-rose-50/40 dark:border-rose-900 dark:bg-rose-950/20",
      )}
    >
      <CardContent className="flex flex-col gap-2 py-4">
        <div className="flex items-center justify-between">
          <Icon
            aria-hidden
            className={cn(
              "h-4 w-4",
              isAlert ? "text-rose-600" : "text-muted-foreground",
            )}
          />
          {isAlert && (
            <Badge className="bg-rose-600 text-white text-[10px]">
              임계 초과
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold tabular-nums">{value}</p>
        <p
          className={cn(
            "text-xs tabular-nums",
            isAlert ? "text-rose-700 dark:text-rose-400" : "text-muted-foreground",
          )}
        >
          {sub}
        </p>
      </CardContent>
    </Card>
  );
}
