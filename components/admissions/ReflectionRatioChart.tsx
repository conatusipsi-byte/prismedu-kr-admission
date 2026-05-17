/**
 * ReflectionRatioChart — 영역별 수능 반영비율 시각화
 *
 * 가산 모델(ratio>0): 수평 막대 그래프
 * 감점 모델(ratio=0 + gradeMap 음수): 별도 "감점 적용" 영역에 표시 (P-010)
 *
 * Tailwind div 기반 (의존성 없는 단순 구현).
 */

import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ReflectionRatio } from "@/types/admission";

export interface ReflectionRatioChartProps {
  ratio: ReflectionRatio;
  className?: string;
}

interface AreaRow {
  label: string;
  ratio: number;
  scoreType?: "standard" | "percentile" | "converted_standard";
  isDeduction: boolean;
}

const SCORE_TYPE_LABEL: Record<string, string> = {
  standard: "표준점수",
  percentile: "백분위",
  converted_standard: "변환점수",
};

export function ReflectionRatioChart({
  ratio: r,
  className,
}: ReflectionRatioChartProps) {
  const rows: AreaRow[] = [
    { label: "국어", ratio: r.korean.ratio, scoreType: r.korean.scoreType, isDeduction: false },
    { label: "수학", ratio: r.math.ratio, scoreType: r.math.scoreType, isDeduction: false },
    { label: "영어", ratio: r.english.ratio, isDeduction: r.english.ratio === 0 && Boolean(r.english.gradeMap) },
    { label: "탐구", ratio: r.investigation.ratio, scoreType: r.investigation.scoreType, isDeduction: false },
    ...(r.history
      ? [{ label: "한국사", ratio: r.history.ratio, isDeduction: r.history.ratio === 0 && Boolean(r.history.gradeMap) }]
      : []),
  ];

  // 정규화: 비율 합 (가산 모델만) 기준 막대 max — 모집요강 원본 합이 100 ≠ 인 경우 대비
  const totalGain = rows
    .filter((row) => !row.isDeduction)
    .reduce((s, row) => s + row.ratio, 0);
  const denominator = totalGain > 0 ? totalGain : 100;

  return (
    <Card data-component="reflection-ratio-chart" className={className}>
      <CardContent className="flex flex-col gap-4 py-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">영역별 수능 반영비율</h3>
          <Badge variant="outline" className="text-xs">
            합산 {totalGain}
          </Badge>
        </div>

        {/* 가산 영역 막대 */}
        <ul className="flex flex-col gap-2">
          {rows
            .filter((row) => !row.isDeduction)
            .map((row) => {
              const pct = denominator > 0 ? (row.ratio / denominator) * 100 : 0;
              return (
                <li
                  key={row.label}
                  data-area={row.label}
                  className="flex items-center gap-3"
                >
                  <span className="w-12 text-xs font-medium text-muted-foreground">
                    {row.label}
                  </span>
                  <div className="relative h-5 flex-1 overflow-hidden rounded-md bg-muted">
                    <div
                      className="h-full bg-brand-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-16 text-right text-xs font-medium tabular-nums">
                    {row.ratio}
                    {row.scoreType && (
                      <span className="ml-1 text-[10px] text-muted-foreground">
                        ({SCORE_TYPE_LABEL[row.scoreType]})
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
        </ul>

        {/* 감점 영역 — P-010 polarity 반영 (감점 음수 gradeMap) */}
        {rows.some((row) => row.isDeduction) && (
          <div className="rounded-md border border-zinc-200 bg-zinc-50/50 p-3 dark:border-zinc-800 dark:bg-zinc-900/30">
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">
              감점 적용 영역
            </p>
            <ul className="flex flex-col gap-1">
              {rows
                .filter((row) => row.isDeduction)
                .map((row) => (
                  <li
                    key={row.label}
                    data-area={row.label}
                    data-deduction="true"
                    className="text-xs leading-relaxed text-foreground"
                  >
                    <span className="font-medium">{row.label}</span>
                    : 등급별 차등 감점 (1등급 0점 기준)
                  </li>
                ))}
            </ul>
          </div>
        )}

        {/* 과탐 조합 가산 (B4) */}
        {r.investigationCombinationBonus && (
          <div className="rounded-md bg-brand-50/50 p-3 dark:bg-brand-950/20">
            <p className="mb-1.5 text-xs font-medium text-brand-700 dark:text-brand-400">
              과탐 조합 가산
            </p>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {Object.entries(r.investigationCombinationBonus).map(
                ([combo, bonus]) => (
                  <li key={combo} className="tabular-nums">
                    <span className="font-medium">{combo}</span>: +{bonus}
                  </li>
                ),
              )}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
