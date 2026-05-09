"use client";

/**
 * ProbabilityChart — 합격 확률 시각화 (자체 SVG)
 *
 * recharts·d3 미사용 — 단일 막대 SVG로 번들 크기 보호 (분석 결과는 한 페이지에
 * 수십 개 카드 렌더 가능 → 차트 라이브러리 의존 시 번들·CPU 모두 부담).
 *
 * 분기 (P-006):
 *   - 일반 트랙: 단일 막대 + low/high 마진 영역
 *   - 학종(susi_comprehensive) + sampleSufficient=true: 1단계·2단계·합산 3 막대
 *   - 학종 + 분해 표본 부족: 1단계×2단계 행 자체 미렌더 + 일반 막대만 (combined fallback)
 *   - insufficient_sample: 차트 자체 미렌더 (호출자가 InsufficientSampleCard로 분기)
 *
 * 표본 부족 학과는 호출 자체를 안 함 — 본 컴포넌트는 항상 sampleSufficient=true 가정.
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import type { MatchResultItem } from "@/lib/schemas/api/match";

export interface ProbabilityChartProps {
  result: MatchResultItem;
  className?: string;
}

const CHART_WIDTH = 280;
const CHART_HEIGHT = 18;
const MARGIN_OPACITY = 0.25;

export function ProbabilityChart({
  result,
  className,
}: ProbabilityChartProps): React.ReactElement | null {
  if (result.category === "insufficient_sample" || result.probability == null) {
    // 호출자가 InsufficientSampleCard로 처리 — 본 컴포넌트에서는 그릴 게 없음.
    return null;
  }

  // 학종 + 분해 표본 충족 → 3 막대 (1단계 / 2단계 / 합산)
  if (result.hakjong?.sampleSufficient && result.hakjong.combined != null) {
    return (
      <div data-component="probability-chart" data-mode="hakjong" className={cn("flex flex-col gap-1.5", className)}>
        <BarRow
          label="1단계 통과"
          value={Math.round((result.hakjong.stage1Pass ?? 0) * 100)}
          color="indigo"
        />
        <BarRow
          label="면접 통과"
          value={Math.round((result.hakjong.stage2Pass ?? 0) * 100)}
          color="indigo"
        />
        <BarRow
          label="최종 합격"
          value={Math.round(result.hakjong.combined * 100)}
          low={
            result.hakjong.combinedLow != null
              ? Math.round(result.hakjong.combinedLow * 100)
              : undefined
          }
          high={
            result.hakjong.combinedHigh != null
              ? Math.round(result.hakjong.combinedHigh * 100)
              : undefined
          }
          color="mint"
          emphasize
        />
        <p className="mt-1 text-2xs text-muted-foreground">
          1단계 × 2단계 분해 (P-006). 각 단계 별 표본 ≥ 임계치.
        </p>
      </div>
    );
  }

  // 일반 트랙 (또는 학종 분해 표본 부족 → 단일 fallback 막대)
  return (
    <div data-component="probability-chart" data-mode="single" className={cn("flex flex-col gap-1", className)}>
      <BarRow
        label="합격 가능성"
        value={result.probability}
        low={result.low ?? undefined}
        high={result.high ?? undefined}
        color="mint"
        emphasize
      />
      {result.hakjong && !result.hakjong.sampleSufficient && (
        <p className="mt-1 text-2xs text-muted-foreground">
          학종 1단계·2단계 분해는 표본 누적 후 표시 (P-006).
        </p>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   하위 — BarRow
   ═══════════════════════════════════════════════════════════════════════ */

interface BarRowProps {
  label: string;
  value: number; // 0~100
  low?: number;
  high?: number;
  color: "mint" | "indigo";
  /** 메인 합격 확률 막대인지 (라벨 굵게) */
  emphasize?: boolean;
}

function BarRow({ label, value, low, high, color, emphasize }: BarRowProps): React.ReactElement {
  const v = clamp(value, 0, 100);
  const lo = low != null ? clamp(low, 0, 100) : null;
  const hi = high != null ? clamp(high, 0, 100) : null;

  const barColor = color === "mint" ? "#00A88B" : "#6366F1";
  const marginColor = color === "mint" ? "#00C9A7" : "#818CF8";

  return (
    <div className="grid grid-cols-[6rem_1fr_auto] items-center gap-2 text-xs">
      <span className={cn("text-right", emphasize ? "font-semibold" : "text-muted-foreground")}>
        {label}
      </span>
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        width="100%"
        height={CHART_HEIGHT}
        role="img"
        aria-label={`${label} ${v}%${lo != null && hi != null ? ` (${lo}~${hi}%)` : ""}`}
        className="block"
      >
        {/* 트랙 */}
        <rect x={0} y={6} width={CHART_WIDTH} height={6} rx={3} fill="hsl(var(--muted))" />
        {/* 신뢰 구간 */}
        {lo != null && hi != null && (
          <rect
            x={(lo / 100) * CHART_WIDTH}
            y={4}
            width={((hi - lo) / 100) * CHART_WIDTH}
            height={10}
            rx={3}
            fill={marginColor}
            opacity={MARGIN_OPACITY}
          />
        )}
        {/* 메인 */}
        <rect
          x={0}
          y={6}
          width={(v / 100) * CHART_WIDTH}
          height={6}
          rx={3}
          fill={barColor}
        />
        {/* tick */}
        <line
          x1={(v / 100) * CHART_WIDTH}
          y1={2}
          x2={(v / 100) * CHART_WIDTH}
          y2={CHART_HEIGHT - 2}
          stroke={barColor}
          strokeWidth={2}
        />
      </svg>
      <span className={cn("tabular-nums", emphasize ? "font-semibold" : "text-muted-foreground")}>
        {v}%
      </span>
    </div>
  );
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
