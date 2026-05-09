"use client";

/**
 * JaeoegukminResultCard — 자격 분류 결과 카드 (P-013 + P-002)
 *
 * 분기:
 *   - jaeoegukmin / foreigner / both → 적합 카드 (purple) + 추천 대학 안내 트리거
 *   - not_eligible → 일반 전형 안내 (이탈 방지 — /admissions CTA)
 *
 * P-002 정직성: 모든 결과에 "참고용" + "대학별 모집요강 확인" 안내 필수.
 */

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, AlertCircle, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ELIGIBILITY_TYPE_LABEL,
  type JaeoegukminResult,
} from "@/lib/admission/jaeoegukmin-eligibility";

export interface JaeoegukminResultCardProps {
  result: JaeoegukminResult;
  /** 자격 충족 시 추천 대학 보기 트리거 */
  onShowRecommendations?: () => void;
  /** 다시 진단 */
  onRestart?: () => void;
  className?: string;
}

export function JaeoegukminResultCard({
  result,
  onShowRecommendations,
  onRestart,
  className,
}: JaeoegukminResultCardProps) {
  const isEligible = result.type !== "not_eligible";

  return (
    <Card
      data-component="jaeoegukmin-result"
      data-eligibility-type={result.type}
      className={cn(
        isEligible
          ? "border-purple-300 bg-purple-50/40 dark:border-purple-800 dark:bg-purple-950/20"
          : "border-zinc-300 bg-zinc-50/40 dark:border-zinc-700 dark:bg-zinc-900/30",
        className,
      )}
    >
      <CardContent className="flex flex-col gap-4 py-6">
        {/* 헤더 */}
        <div className="flex items-center gap-2">
          {isEligible ? (
            <CheckCircle2 className="h-6 w-6 text-purple-600" />
          ) : (
            <AlertCircle className="h-6 w-6 text-zinc-500" />
          )}
          <h2 className="text-lg font-semibold">
            {isEligible ? "자격 충족 가능성 있음" : "재외국민·외국인 전형 자격 미달"}
          </h2>
        </div>

        <Badge
          variant="outline"
          className={cn(
            isEligible
              ? "border-purple-300 bg-white/80 text-purple-700 dark:border-purple-800"
              : "border-zinc-300 bg-white/80 text-zinc-700",
            "self-start",
          )}
        >
          {ELIGIBILITY_TYPE_LABEL[result.type]}
        </Badge>

        {/* 사유 */}
        <p className="text-sm leading-relaxed text-foreground">{result.reason}</p>

        {/* 가이드 — 다음 단계 안내 */}
        <p className="text-sm leading-relaxed text-muted-foreground">{result.guidance}</p>

        {/* Caveats — 위험 신호 (P-002 정직성) */}
        {result.caveats.length > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900/40 dark:bg-amber-950/20">
            <p className="mb-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
              ⚠️ 주의사항
            </p>
            <ul className="space-y-1 text-xs leading-relaxed text-amber-900 dark:text-amber-200">
              {result.caveats.map((c, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span aria-hidden>·</span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 정직성 고지 (P-002) — 모든 결과에 일관 노출 */}
        <p className="text-xs leading-relaxed text-muted-foreground">
          본 자가진단은 <strong>1차 분류 가이드</strong>입니다. 정확한 자격은 학교마다
          다르며, 결과를 "확정 합격 가능"으로 해석하지 마세요. 반드시 대학별 모집요강을
          확인하시기 바랍니다.
        </p>

        {/* 액션 — 분기별 다른 CTA */}
        <div className="flex flex-wrap gap-2 border-t pt-4">
          {isEligible ? (
            <>
              <Button
                type="button"
                size="sm"
                onClick={onShowRecommendations}
                className="bg-purple-600 hover:bg-purple-700"
              >
                추천 대학 보기
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
              {onRestart && (
                <Button type="button" variant="outline" size="sm" onClick={onRestart}>
                  다시 진단
                </Button>
              )}
            </>
          ) : (
            <>
              {/* not_eligible — 일반 전형 안내 (이탈 방지) */}
              <Button asChild size="sm">
                <Link href="/admissions">
                  일반 전형 학과 검색
                  <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Link>
              </Button>
              {onRestart && (
                <Button type="button" variant="outline" size="sm" onClick={onRestart}>
                  다시 진단
                </Button>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
