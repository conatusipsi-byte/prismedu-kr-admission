"use client";

/**
 * DepartmentRecommendCard — 분석 결과 추천 학과 카드
 *
 * DepartmentCard(검색용)와의 차이:
 *   - 합격률 노출 — 단, sampleSufficient=true 일 때만.
 *   - 학종 1단계×2단계 분해 표시 (P-006).
 *   - caveat 있으면 ⚠️ 마커 + 텍스트 노출.
 *   - 클릭 시 /admissions/[uid]/[did] 이동 (DepartmentCard와 동일).
 *
 * 분기:
 *   - sampleSufficient=true → ProbabilityChart 노출 + 합격률 텍스트.
 *   - sampleSufficient=false → InsufficientSampleCard로 위임 (호출자 책임 — 본 컴포넌트는
 *     항상 sufficient 가정. 호출자가 표본 부족 학과는 별도 섹션으로 분리).
 *
 * 회귀 게이트 (result-page-policy.test.tsx):
 *   - "확정 합격" 표현 0건
 *   - sampleSufficient=true 카드만 합격률 % 노출
 */

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Building2, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AdmissionTrackBadge } from "@/components/admissions/AdmissionTrackBadge";
import { ProbabilityChart } from "./ProbabilityChart";
import type { MatchResultItem } from "@/lib/schemas/api/match";
import type { ProbabilityCategory } from "@/types/admission";

const CATEGORY_LABEL: Record<ProbabilityCategory, string> = {
  reach: "도전",
  hard_target: "상향",
  target: "적정",
  safety: "안정",
  insufficient_sample: "표본 부족",
};

const CATEGORY_TONE: Record<ProbabilityCategory, string> = {
  reach: "border-rose-200 bg-rose-50/40 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300",
  hard_target: "border-amber-200 bg-amber-50/40 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300",
  target: "border-brand-300 bg-brand-50/40 text-brand-700 dark:border-brand-800/40 dark:bg-brand-950/20 dark:text-brand-400",
  safety: "border-emerald-200 bg-emerald-50/40 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300",
  insufficient_sample: "border-zinc-300 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-300",
};

export interface DepartmentRecommendCardProps {
  result: MatchResultItem;
  className?: string;
}

export function DepartmentRecommendCard({
  result,
  className,
}: DepartmentRecommendCardProps): React.ReactElement {
  const href = `/admissions/${result.universityId}/${result.departmentId}`;

  return (
    <Link
      href={href}
      data-component="department-recommend-card"
      data-category={result.category}
      data-sample-sufficient={result.sampleSufficient}
      data-university-id={result.universityId}
      data-department-id={result.departmentId}
      className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
    >
      <Card className={cn("h-full transition hover:shadow-md hover:border-brand-300", className)}>
        <CardContent className="flex flex-col gap-3 py-5">
          {/* 헤더: 대학·학과 + 카테고리 뱃지 */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col gap-1 min-w-0">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Building2 aria-hidden className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate font-medium">{result.universityName}</span>
              </div>
              <h3 className="truncate text-base font-semibold">{result.departmentName}</h3>
            </div>
            <Badge
              variant="outline"
              data-category-badge={result.category}
              className={cn("shrink-0 border", CATEGORY_TONE[result.category])}
            >
              {CATEGORY_LABEL[result.category]}
            </Badge>
          </div>

          {/* 트랙 뱃지 */}
          <div className="flex flex-wrap gap-1.5">
            <AdmissionTrackBadge kind={result.trackKind} />
            <Badge variant="outline" className="text-xs text-muted-foreground">
              {result.trackName}
            </Badge>
          </div>

          {/* 합격률 차트 — sampleSufficient=true 일 때만. 표본 부족은 호출자가 별도 섹션 처리. */}
          {result.sampleSufficient && result.probability != null && (
            <ProbabilityChart result={result} />
          )}

          {/* caveat — 자격 미달, preliminary 변환표 등 (P-002, P-012) */}
          {result.caveats.length > 0 && (
            <ul
              data-element="caveats"
              className="flex flex-col gap-1 rounded-md border border-amber-200 bg-amber-50/60 p-2 text-2xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/15 dark:text-amber-200"
            >
              {result.caveats.map((c, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <AlertTriangle aria-hidden className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          )}

          {/* 표본 수 (정직성 안내) */}
          <div className="flex items-center justify-between text-2xs text-muted-foreground">
            <span>합격 사례 {result.sampleN}건 (가중 {result.weightedSampleN.toFixed(1)})</span>
            <span className="flex items-center gap-0.5">
              상세 <ChevronRight aria-hidden className="h-3 w-3" />
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
