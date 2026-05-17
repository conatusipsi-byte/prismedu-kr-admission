"use client";

/**
 * PreviewLockOverlay — Free preview 컷 도달 안내 (섹션 단위)
 *
 * 결과 페이지 한 섹션(Reach/Match/Safety) 안에서 free preview 한도를 초과한
 * 학과 N개를 한 번에 안내. 카드마다 LockCard를 도배하면 시각 노이즈가 커서,
 * 섹션 끝에 단일 안내 카드로 묶는다.
 *
 * 정책 (P-001):
 *   - 표본 부족 학과에는 절대 미적용 (별도 InsufficientSampleCard로 처리)
 *   - 본 컴포넌트는 "표본 충족 + 무료 사용자 + preview 컷 외" 학과 N개만 카운트
 *
 * 회귀 게이트 (result-page-policy.test.tsx):
 *   - 표본 부족 학과 카운트는 본 컴포넌트의 lockedCount에 포함 안 됨
 *   - 본 카드의 텍스트에 "확정 합격" 표현 0건
 *
 * Gated.LockCard와 차이: LockCard는 단일 기능(분석 카드 1개)을 락,
 *   PreviewLockOverlay는 "이 섹션에 N개 학과가 더 있습니다" 안내.
 */

import * as React from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export interface PreviewLockOverlayProps {
  /** 이 섹션에서 잠긴 학과 수 (표본 부족 학과는 제외) */
  lockedCount: number;
  /** 결제 페이지 href — 미지정 시 /pricing */
  upgradeHref?: string;
  /** 어떤 섹션에 노출되는지 (Reach/Match/Safety) — 메시지 컨텍스트용 */
  sectionLabel?: string;
  className?: string;
}

export function PreviewLockOverlay({
  lockedCount,
  upgradeHref = "/pricing",
  sectionLabel,
  className,
}: PreviewLockOverlayProps): React.ReactElement | null {
  if (lockedCount <= 0) return null;

  return (
    <Card
      data-component="preview-lock-overlay"
      data-locked-count={lockedCount}
      className={cn(
        "border-brand-300 bg-brand-50/40 dark:border-brand-800/40 dark:bg-brand-950/20",
        className,
      )}
    >
      <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
        <div
          aria-hidden
          className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-500/10"
        >
          <Lock className="h-6 w-6 text-brand-600 dark:text-brand-400" />
        </div>

        <p className="text-sm font-medium">
          {sectionLabel ? `${sectionLabel}에 ` : ""}
          {lockedCount}개 학과 더 있어요
        </p>

        <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
          더 많은 학과의 합격 가능성을 보려면 업그레이드하세요. 결제 후 즉시 모든
          학과 분석이 열립니다.
        </p>

        <Button asChild size="sm" className="mt-2 bg-brand-600 hover:bg-brand-700">
          <Link href={upgradeHref}>업그레이드</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
