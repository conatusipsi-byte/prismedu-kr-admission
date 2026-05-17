"use client";

/**
 * SampleStatsTable — 학과·트랙별 표본 집계 테이블 (Day 11)
 *
 * 컬럼: 학교/학과/트랙·연도·합격수·가중수·검증수·게이트 결과
 * insufficient 행은 rose 톤 + 사유 라벨
 *
 * P-002 정직성 — 운영자가 어떤 학과가 표본 부족인지 즉시 식별 가능.
 */

import * as React from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { SampleStatsItem } from "@/lib/admission/sample-stats-summary";

const REASON_LABEL: Record<string, string> = {
  no_data: "집계 없음",
  below_threshold: "5건 미만",
  weighted_below: "가중치 부족",
  no_accepted: "합격 0건",
};

export interface SampleStatsTableProps {
  items: SampleStatsItem[];
  className?: string;
}

export function SampleStatsTable({
  items,
  className,
}: SampleStatsTableProps): React.ReactElement {
  if (items.length === 0) {
    return (
      <div
        data-component="sample-stats-table"
        data-empty="true"
        className={cn(
          "rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground",
          className,
        )}
      >
        조회 결과가 없어요. 연도 또는 트랙 필터를 변경해보세요.
      </div>
    );
  }

  // insufficient 우선 정렬
  const sorted = [...items].sort((a, b) => {
    if (a.gate.sufficient !== b.gate.sufficient) {
      return a.gate.sufficient ? 1 : -1;
    }
    return a.acceptedCount - b.acceptedCount;
  });

  return (
    <div data-component="sample-stats-table" className={cn("flex flex-col gap-2", className)}>
      <div className="grid grid-cols-[10rem_8rem_5rem_4rem_4rem_4rem_8rem] items-center gap-2 px-3 py-2 text-2xs font-semibold text-muted-foreground">
        <span>학교/학과</span>
        <span>트랙</span>
        <span>연도</span>
        <span className="text-right">합격</span>
        <span className="text-right">가중</span>
        <span className="text-right">검증</span>
        <span>게이트</span>
      </div>
      <ul className="flex flex-col gap-1">
        {sorted.map((it) => {
          const sufficient = it.gate.sufficient;
          return (
            <li
              key={it.id}
              data-stats-id={it.id}
              data-sufficient={sufficient ? "true" : "false"}
              className={cn(
                "grid grid-cols-[10rem_8rem_5rem_4rem_4rem_4rem_8rem] items-center gap-2 rounded-lg border px-3 py-2 text-xs",
                !sufficient && "border-rose-300 bg-rose-50/30 dark:border-rose-900/40 dark:bg-rose-950/10",
              )}
            >
              <span className="flex items-center gap-1 truncate">
                {!sufficient && (
                  <AlertTriangle aria-hidden className="h-3 w-3 shrink-0 text-rose-600" />
                )}
                {it.universityId}/{it.departmentId}
              </span>
              <span className="truncate text-2xs text-muted-foreground">{it.trackKind}</span>
              <span className="tabular-nums text-2xs">{it.year}</span>
              <span className="text-right tabular-nums">{it.acceptedCount}</span>
              <span className="text-right tabular-nums text-muted-foreground">
                {it.weightedCount.toFixed(1)}
              </span>
              <span className="text-right tabular-nums text-muted-foreground">
                {it.verifiedCount}
              </span>
              <span>
                {sufficient ? (
                  <Badge
                    variant="outline"
                    className="border-brand-300 bg-brand-50 text-brand-800 text-2xs dark:border-brand-800/40 dark:bg-brand-950/20 dark:text-brand-300"
                  >
                    <CheckCircle2 aria-hidden className="mr-0.5 h-2.5 w-2.5" />
                    충족
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    data-element="insufficient-badge"
                    data-reason={it.gate.reason}
                    className="border-rose-300 bg-rose-50 text-rose-800 text-2xs dark:border-rose-900/40 dark:bg-rose-950/15 dark:text-rose-300"
                  >
                    {REASON_LABEL[it.gate.reason] ?? "부족"}
                  </Badge>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
