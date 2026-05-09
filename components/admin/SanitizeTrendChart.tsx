"use client";

/**
 * SanitizeTrendChart — 시계열 발동 횟수 (자체 SVG 라인차트)
 *
 * 의존성 없는 단순 SVG. recharts 등 무거운 라이브러리 회피.
 * 24h: hourly bucket / 7d·30d: daily bucket.
 *
 * 트리거 타입별 색상 분리:
 *   - insufficient_sample: amber
 *   - blocked_keyword:     blue
 *   - regression_suspect:  rose (가장 강조)
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type {
  StatPeriod,
  TrendPoint,
  SanitizeTriggerType,
} from "@/lib/admission/sanitize-events";

export interface SanitizeTrendChartProps {
  period: StatPeriod;
  data: TrendPoint[];
  onPeriodChange: (period: StatPeriod) => void;
  className?: string;
}

const TYPE_COLORS: Record<SanitizeTriggerType, string> = {
  insufficient_sample: "#f59e0b", // amber-500
  blocked_keyword: "#3b82f6", // blue-500
  regression_suspect: "#e11d48", // rose-600
};

const TYPE_LABEL: Record<SanitizeTriggerType, string> = {
  insufficient_sample: "표본 부족",
  blocked_keyword: "차단 키워드",
  regression_suspect: "회귀 의심",
};

const PERIOD_OPTIONS: StatPeriod[] = ["24h", "7d", "30d"];
const PERIOD_LABEL: Record<StatPeriod, string> = {
  "24h": "24시간",
  "7d": "7일",
  "30d": "30일",
};

const CHART_W = 760;
const CHART_H = 220;
const PADDING = { top: 16, right: 24, bottom: 28, left: 36 };

export function SanitizeTrendChart({
  period,
  data,
  onPeriodChange,
  className,
}: SanitizeTrendChartProps) {
  // y축 — count 최대값 기반 nice scale
  const maxCount = Math.max(1, ...data.map((d) => d.count));
  const yMax = niceCeil(maxCount);

  // x좌표 매핑
  const innerW = CHART_W - PADDING.left - PADDING.right;
  const innerH = CHART_H - PADDING.top - PADDING.bottom;
  const stepX = data.length > 1 ? innerW / (data.length - 1) : 0;

  const xy = (i: number, count: number) => ({
    x: PADDING.left + i * stepX,
    y: PADDING.top + innerH * (1 - count / yMax),
  });

  // 트리거 타입별 line path
  const linePathByType = (type: SanitizeTriggerType): string => {
    if (data.length === 0) return "";
    return data
      .map((d, i) => {
        const { x, y } = xy(i, d.byType[type]);
        return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  };

  // x축 라벨 — 5개 정도만 표시
  const xLabelStep = Math.max(1, Math.floor(data.length / 5));

  return (
    <Card data-component="sanitize-trend-chart" className={className}>
      <CardContent className="flex flex-col gap-3 py-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">시간별 발동 추이</h3>
          <div className="flex gap-1">
            {PERIOD_OPTIONS.map((p) => (
              <Button
                key={p}
                size="sm"
                variant={p === period ? "default" : "outline"}
                onClick={() => onPeriodChange(p)}
                data-period={p}
                data-active={p === period}
                className="h-7 px-2 text-xs"
              >
                {PERIOD_LABEL[p]}
              </Button>
            ))}
          </div>
        </div>

        {/* 범례 */}
        <ul className="flex flex-wrap gap-3 text-xs">
          {(Object.keys(TYPE_COLORS) as SanitizeTriggerType[]).map((t) => (
            <li key={t} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block h-2 w-3 rounded-sm"
                style={{ backgroundColor: TYPE_COLORS[t] }}
              />
              <span className="text-muted-foreground">{TYPE_LABEL[t]}</span>
            </li>
          ))}
        </ul>

        {/* SVG 차트 */}
        <div data-element="chart-svg-wrapper" className="overflow-x-auto">
          <svg
            role="img"
            aria-label={`${PERIOD_LABEL[period]} 동안의 sanitize 발동 추이`}
            viewBox={`0 0 ${CHART_W} ${CHART_H}`}
            width="100%"
            height={CHART_H}
            className="text-muted-foreground"
          >
            {/* y축 grid */}
            {[0, 0.25, 0.5, 0.75, 1].map((p) => {
              const y = PADDING.top + innerH * (1 - p);
              return (
                <g key={p}>
                  <line
                    x1={PADDING.left}
                    x2={CHART_W - PADDING.right}
                    y1={y}
                    y2={y}
                    stroke="currentColor"
                    strokeOpacity={0.1}
                  />
                  <text
                    x={PADDING.left - 6}
                    y={y + 3}
                    fontSize="10"
                    textAnchor="end"
                    fill="currentColor"
                    fillOpacity={0.6}
                  >
                    {Math.round(yMax * p)}
                  </text>
                </g>
              );
            })}

            {/* x축 라벨 */}
            {data.map((d, i) =>
              i % xLabelStep === 0 || i === data.length - 1 ? (
                <text
                  key={i}
                  x={PADDING.left + i * stepX}
                  y={CHART_H - 8}
                  fontSize="9"
                  textAnchor="middle"
                  fill="currentColor"
                  fillOpacity={0.6}
                >
                  {formatBucketLabel(d.bucketStart, period)}
                </text>
              ) : null,
            )}

            {/* 트리거 타입별 line */}
            {(Object.keys(TYPE_COLORS) as SanitizeTriggerType[]).map((t) => (
              <path
                key={t}
                d={linePathByType(t)}
                stroke={TYPE_COLORS[t]}
                strokeWidth="1.5"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                data-trigger-type={t}
              />
            ))}

            {/* 데이터 포인트 (회귀 의심만 마커) */}
            {data.map((d, i) => {
              const reg = d.byType.regression_suspect;
              if (reg === 0) return null;
              const { x, y } = xy(i, reg);
              return (
                <circle
                  key={`reg-${i}`}
                  cx={x}
                  cy={y}
                  r={3}
                  fill={TYPE_COLORS.regression_suspect}
                />
              );
            })}
          </svg>
        </div>

        {/* 빈 상태 */}
        {data.every((d) => d.count === 0) && (
          <p className="text-center text-xs text-muted-foreground">
            본 기간에 발동된 sanitize 이벤트가 없습니다.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   유틸
   ═══════════════════════════════════════════════════════════════════════ */

function niceCeil(n: number): number {
  if (n <= 1) return 1;
  if (n <= 5) return 5;
  if (n <= 10) return 10;
  const exp = Math.floor(Math.log10(n));
  const base = Math.pow(10, exp);
  return Math.ceil(n / base) * base;
}

function formatBucketLabel(iso: string, period: StatPeriod): string {
  const d = new Date(iso);
  if (period === "24h") {
    return `${d.getUTCHours().toString().padStart(2, "0")}:00`;
  }
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}
