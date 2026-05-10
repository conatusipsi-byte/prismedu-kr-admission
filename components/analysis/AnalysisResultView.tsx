"use client";

/**
 * AnalysisResultView — /analysis/[id] 결과 페이지 본체
 *
 * 레이아웃:
 *   1. Hero — 입력 요약 + 재분석 CTA
 *   2. globalCaveats — preliminary 학과·표본 부족 학과 비율 안내
 *   3. Reach 섹션 — 도전 학과 카드 + (Free 사용자) PreviewLockOverlay
 *   4. Hard Target 섹션 — 상향 (있으면)
 *   5. Target 섹션 — 적정
 *   6. Safety 섹션 — 안정
 *   7. 표본 부족 별도 섹션 — InsufficientSampleCard (P-001 옵션 B 핵심)
 *   8. 하단 actions — 재분석 / 인쇄
 *
 * 정책 (P-001):
 *   - 표본 부족 학과는 "표본 부족" 별도 섹션에 회색 카드로만 노출
 *   - 결제 CTA는 표본 부족 섹션에 절대 미노출 (회귀 게이트)
 *   - 무료 사용자 free preview 컷 외 학과는 lockable=true → 카드 미노출 + LockOverlay
 *
 * 정책 (P-006):
 *   - 학종(susi_comprehensive) 결과는 ProbabilityChart가 1단계 × 2단계 분해 표시
 *
 * 정책 (P-002 정직성):
 *   - "확정 합격" 표현 차단 (회귀 게이트)
 *   - 결과는 참고용 안내 항상 노출
 */

import * as React from "react";
import Link from "next/link";
import {
  AlertCircle,
  GitCompare,
  MessageSquareHeart,
  Printer,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { InsufficientSampleCard } from "@/components/access/Gated";
import { DepartmentRecommendCard } from "./DepartmentRecommendCard";
import { PreviewLockOverlay } from "./PreviewLockOverlay";
import type { MatchResponse, MatchResultItem } from "@/lib/schemas/api/match";

export interface AnalysisResultViewProps {
  data: MatchResponse;
  className?: string;
}

type SectionId = "reach" | "hard_target" | "target" | "safety";

const SECTION_ORDER: SectionId[] = ["reach", "hard_target", "target", "safety"];

const SECTION_META: Record<
  SectionId,
  { label: string; description: string; tone: string }
> = {
  reach: {
    label: "도전 (Reach)",
    description: "현재 점수보다 다소 높은 곳 — 한 번 도전해볼 만한 학과들",
    tone: "border-rose-200 dark:border-rose-900/40",
  },
  hard_target: {
    label: "상향 (Hard Target)",
    description: "약간의 상향 지원 — 노력으로 도달 가능한 범위",
    tone: "border-amber-200 dark:border-amber-900/40",
  },
  target: {
    label: "적정 (Target)",
    description: "현재 점수와 가장 일치 — 메인 지원 후보",
    tone: "border-mint-300 dark:border-mint-800/40",
  },
  safety: {
    label: "안정 (Safety)",
    description: "합격 가능성이 비교적 높은 학과들",
    tone: "border-emerald-200 dark:border-emerald-900/40",
  },
};

export function AnalysisResultView({
  data,
  className,
}: AnalysisResultViewProps): React.ReactElement {
  // 1. 표본 부족 / 락 / 카테고리별 분기
  const visible = data.results.filter((r) => !r.lockable);
  const insufficient = visible.filter((r) => r.category === "insufficient_sample");
  const sufficient = visible.filter((r) => r.category !== "insufficient_sample");

  const sections = SECTION_ORDER.map((id) => ({
    id,
    items: sufficient.filter((r) => r.category === id),
  }));

  // 2. 섹션별 락 카운트 — lockable=true 학과를 카테고리별로 분배 (Free 사용자에게 어디서 N개 잠겼는지 안내).
  //    표본 부족 학과는 lockable=false라 자연스럽게 카운트 제외.
  const lockedByCategory: Record<SectionId, number> = {
    reach: 0,
    hard_target: 0,
    target: 0,
    safety: 0,
  };
  for (const r of data.results) {
    if (!r.lockable) continue;
    if (r.category === "insufficient_sample") continue; // 안전망
    lockedByCategory[r.category as SectionId] += 1;
  }

  return (
    <div data-component="analysis-result-view" className={cn("flex flex-col gap-6", className)}>
      {/* 1. Hero */}
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">분석 결과</h1>
        <p className="text-sm text-muted-foreground">
          {new Date(data.createdAt).toLocaleString("ko-KR", {
            year: "numeric", month: "long", day: "numeric",
            hour: "2-digit", minute: "2-digit",
          })}{" "}
          기준 매칭 — 총 {data.results.length}개 학과 분석
        </p>
        <p className="text-2xs text-muted-foreground">
          ⚠️ 본 분석은 참고용입니다. 매칭 알고리즘은 1차 시뮬레이션이며, 최종 지원·
          합격 여부는 모집요강과 본인 판단으로 결정하세요.
        </p>
      </header>

      {/* 2. globalCaveats */}
      {data.globalCaveats.length > 0 && (
        <section
          data-element="global-caveats"
          className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900/40 dark:bg-amber-900/15"
        >
          <div className="mb-1 flex items-center gap-1.5 text-sm font-medium text-amber-900 dark:text-amber-200">
            <AlertCircle aria-hidden className="h-4 w-4" />
            결과 해석 안내
          </div>
          <ul className="ml-1 flex flex-col gap-0.5 text-xs text-amber-900 dark:text-amber-200">
            {data.globalCaveats.map((c, i) => (
              <li key={i}>· {c}</li>
            ))}
          </ul>
        </section>
      )}

      {/* 3~6. 카테고리 섹션 */}
      {sections.map(({ id, items }) => {
        const lockedHere = lockedByCategory[id];
        // 빈 섹션이면 스킵 (락만 있는 섹션은 락카드만 노출)
        if (items.length === 0 && lockedHere === 0) return null;

        const meta = SECTION_META[id];
        return (
          <section
            key={id}
            data-section={id}
            className={cn("flex flex-col gap-3 rounded-lg border-l-4 pl-3", meta.tone)}
          >
            <div>
              <h2 className="text-base font-semibold">{meta.label}</h2>
              <p className="text-2xs text-muted-foreground">{meta.description}</p>
            </div>
            {items.length > 0 && (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
                {items.map((it) => (
                  <DepartmentRecommendCard key={cardKey(it)} result={it} />
                ))}
              </div>
            )}
            {lockedHere > 0 && (
              <PreviewLockOverlay
                lockedCount={lockedHere}
                sectionLabel={meta.label}
                upgradeHref="/pricing"
              />
            )}
          </section>
        );
      })}

      {/* 7. 표본 부족 별도 섹션 — P-001 옵션 B */}
      {insufficient.length > 0 && (
        <section
          data-section="insufficient-sample"
          className="flex flex-col gap-3 rounded-lg border-l-4 border-zinc-300 pl-3 dark:border-zinc-700"
        >
          <div>
            <h2 className="text-base font-semibold text-zinc-700 dark:text-zinc-300">
              표본 부족 학과
            </h2>
            <p className="text-2xs text-muted-foreground">
              합격 사례가 부족해 확률을 표시하지 않습니다. 모집요강·일정 등 정형 정보는
              학과 상세에서 확인하세요.
            </p>
          </div>
          <div
            data-element="insufficient-sample-grid"
            className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3"
          >
            {insufficient.map((it) => (
              <div key={cardKey(it)} data-result-row={cardKey(it)}>
                <div className="mb-1 text-xs text-muted-foreground">
                  <Link
                    href={`/admissions/${it.universityId}/${it.departmentId}`}
                    className="hover:underline"
                  >
                    {it.universityName} · {it.departmentName} · {it.trackName}
                  </Link>
                </div>
                <InsufficientSampleCard feature="analysis" sampleN={it.sampleN} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 8. actions */}
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <div className="text-2xs text-muted-foreground">
          매칭 ID: <code className="font-mono">{data.matchId}</code>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* AI 카운슬러 — Day 7 연동. 표본 부족 학과만 있어도 일반론 상담은 가능. */}
          <Button asChild size="sm" className="bg-mint-600 hover:bg-mint-700" data-testid="counselor-cta">
            <Link href={`/chat?matchId=${encodeURIComponent(data.matchId)}`}>
              <MessageSquareHeart className="mr-1.5 h-3.5 w-3.5" /> AI 카운슬러로 상담
            </Link>
          </Button>
          {/* Pro 기능 진입 CTA — baseSpecId 자동 연결. ProGate 가 Free 사용자엔 잠금 노출. */}
          <Button asChild variant="outline" size="sm" data-testid="what-if-cta">
            <Link href={`/what-if?baseSpecId=${encodeURIComponent(data.matchId)}`}>
              <Sparkles className="mr-1.5 h-3.5 w-3.5" /> What-If 시뮬레이션
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" data-testid="compare-cta">
            <Link href={`/compare?baseSpecId=${encodeURIComponent(data.matchId)}`}>
              <GitCompare className="mr-1.5 h-3.5 w-3.5" /> 학과 비교
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/analysis">
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> 새 분석
            </Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              if (typeof window !== "undefined") window.print();
            }}
          >
            <Printer className="mr-1.5 h-3.5 w-3.5" /> 인쇄
          </Button>
        </div>
      </footer>
    </div>
  );
}

function cardKey(it: MatchResultItem): string {
  return `${it.universityId}/${it.departmentId}/${it.trackKind}/${it.trackName}`;
}
