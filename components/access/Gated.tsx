"use client";

/**
 * Gated — 무료/유료 + 표본 부족 게이트 통합 wrapper
 *
 * 정책 (P-001 옵션 B):
 *   - reason="insufficient_sample" → 안내 카드 (회색 + 시계 + CTA 없음)
 *     · 어차피 분석 자체가 비공개이므로 결제 의미 없음 → 환불 분쟁 방지를 위해 락 X
 *
 *   - reason="free_plan_over_preview_quota" → 락 카드 (mint + 자물쇠 + 업그레이드 CTA)
 *     · 표본 충족 학과 + 무료 사용자 + free preview 컷 외 → 결제 유도
 *
 *   - reason="in_free_preview" → children 그대로 렌더 + preview 카운터 표시
 *
 *   - reason="paid_plan" 또는 reason 미지정 → children 그대로 렌더
 *
 * sample-gate.ts 의 LockDecision 과 1:1 호환:
 *   const decision = isLockable(ctx, sample);
 *   <Gated feature="analysis" reason={decision.reason}>...</Gated>
 *
 * 회귀 게이트 (Gated.test.tsx):
 *   - insufficient_sample 카드는 절대 결제 CTA 표시하지 않음 (P-001 핵심 룰)
 *   - lock 카드는 항상 업그레이드 CTA 표시
 *   - paid_plan / in_free_preview 는 항상 children 그대로
 */

import * as React from "react";
import Link from "next/link";
import { Lock, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/* ═══════════════════════════════════════════════════════════════════════
   타입
   ═══════════════════════════════════════════════════════════════════════ */

export type GatedFeature =
  | "analysis"
  | "autoPlanner"
  | "compare"
  | "whatIf"
  | "aiCounselor";

/**
 * sample-gate.ts 의 LockDecision.reason 과 1:1 매칭.
 * 신규 reason 추가 시 sample-gate.ts 와 동기 갱신 필요.
 */
export type GateReason =
  | "free_plan_over_preview_quota"
  | "insufficient_sample"
  | "in_free_preview"
  | "paid_plan";

export interface GatedProps {
  /** 어떤 기능을 게이트하는지 — 분석 텍스트·CTA 라벨 결정 */
  feature: GatedFeature;
  /** 게이트 사유. 미지정 시 paid_plan(=통과)으로 간주 */
  reason?: GateReason;
  /**
   * 게이트 통과 시 렌더할 자식 노드.
   * insufficient_sample / locked 케이스에서는 children 없이 호출 가능하므로 optional.
   */
  children?: React.ReactNode;
  /** 무료 preview 카운터 (in_free_preview 일 때만 의미) */
  previewCounter?: { current: number; max: number };
  /** 락 카드의 CTA href. 미지정 시 /pricing */
  upgradeHref?: string;
  /** 안내 카드의 표본 수치 (insufficient_sample 시 메시지에 활용) */
  sampleN?: number;
}

/* ═══════════════════════════════════════════════════════════════════════
   Feature 라벨
   ═══════════════════════════════════════════════════════════════════════ */

const FEATURE_LABEL: Record<GatedFeature, string> = {
  analysis: "합격률 분석",
  autoPlanner: "자동 플래너",
  compare: "대학·학과 비교",
  whatIf: "가정 시뮬레이터",
  aiCounselor: "AI 카운슬러",
};

const FEATURE_UPGRADE_COPY: Record<GatedFeature, string> = {
  analysis: "더 많은 학과의 합격 확률을 보려면 업그레이드하세요.",
  autoPlanner: "수능까지 남은 일정을 자동으로 정리해드려요.",
  compare: "관심 학과를 한 화면에서 비교해보세요.",
  whatIf: "수능 등급·내신을 가정해 시뮬레이션해보세요.",
  aiCounselor: "AI 카운슬러와 무제한 상담하세요.",
};

/* ═══════════════════════════════════════════════════════════════════════
   본 컴포넌트
   ═══════════════════════════════════════════════════════════════════════ */

export function Gated({
  feature,
  reason,
  children,
  previewCounter,
  upgradeHref = "/pricing",
  sampleN,
}: GatedProps): React.ReactElement {
  // paid_plan 또는 reason 미지정 → 통과
  if (!reason || reason === "paid_plan") {
    return <>{children}</>;
  }

  // in_free_preview → children + 카운터 표시
  if (reason === "in_free_preview") {
    return (
      <div data-gated-state="in_free_preview" className="relative">
        {children}
        {previewCounter && (
          <FreePreviewCounter
            current={previewCounter.current}
            max={previewCounter.max}
          />
        )}
      </div>
    );
  }

  // insufficient_sample → 안내 카드 (CTA 없음, P-001 핵심)
  if (reason === "insufficient_sample") {
    return (
      <InsufficientSampleCard feature={feature} sampleN={sampleN} />
    );
  }

  // free_plan_over_preview_quota → 락 카드
  if (reason === "free_plan_over_preview_quota") {
    return <LockCard feature={feature} upgradeHref={upgradeHref} />;
  }

  // 미정의 reason 안전 fallback — children 노출 (락 누락은 정직성 원칙에 부합)
  return <>{children}</>;
}

/* ═══════════════════════════════════════════════════════════════════════
   하위 컴포넌트 — InsufficientSampleCard (P-001)
   ═══════════════════════════════════════════════════════════════════════ */

interface InsufficientSampleCardProps {
  feature: GatedFeature;
  sampleN?: number;
}

/**
 * 표본 부족 안내 카드 — **결제 CTA 절대 X**.
 *
 * 색상: 회색 (mint 브랜드 X — 락 카드와 시각적 분리)
 * 아이콘: Clock (자물쇠 X — 락이 아닌 데이터 부족)
 * 메시지: "표본이 누적되면 자동으로 표시" 정직성 원칙 준수
 */
export function InsufficientSampleCard({
  feature,
  sampleN,
}: InsufficientSampleCardProps): React.ReactElement {
  return (
    <Card
      data-gated-state="insufficient_sample"
      className={cn(
        "border-dashed",
        "bg-zinc-50 dark:bg-zinc-900/40",
        "border-zinc-300 dark:border-zinc-700",
      )}
    >
      <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
        <div
          aria-hidden
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-full",
            "bg-zinc-200 dark:bg-zinc-800",
          )}
        >
          <Clock className="h-6 w-6 text-zinc-500 dark:text-zinc-400" />
        </div>

        <Badge variant="secondary" className="bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          표본 부족
        </Badge>

        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {FEATURE_LABEL[feature]} 표시 불가
        </p>

        <p className="max-w-sm text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          {sampleN != null
            ? `현재 합격 사례 ${sampleN}건 — 표본이 더 누적되면 자동으로 표시됩니다.`
            : "합격 사례가 더 누적되면 자동으로 표시됩니다."}
          {" "}
          모집요강·일정·전형 정보는 그대로 확인할 수 있어요.
        </p>

        {/* 결제 CTA 절대 노출 X — P-001 옵션 B 핵심.
            테스트(Gated.test.tsx) 가 본 카드에 "업그레이드"·"결제" 텍스트 부재를 강제 검증. */}
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   하위 컴포넌트 — LockCard
   ═══════════════════════════════════════════════════════════════════════ */

interface LockCardProps {
  feature: GatedFeature;
  upgradeHref: string;
}

/**
 * 결제 락 카드 — 무료 사용자가 free preview 한도 초과 또는
 * Pro 전용 기능 접근 시 표시. mint 브랜드 컬러 + 자물쇠 + 업그레이드 CTA.
 */
export function LockCard({
  feature,
  upgradeHref,
}: LockCardProps): React.ReactElement {
  return (
    <Card
      data-gated-state="locked"
      className={cn(
        "border-brand-300 bg-brand-50/40 dark:border-brand-800/40 dark:bg-brand-950/20",
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
          {FEATURE_LABEL[feature]}는 유료 플랜 전용입니다
        </p>

        <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
          {FEATURE_UPGRADE_COPY[feature]}
        </p>

        <Button asChild size="sm" className="mt-2 bg-brand-600 hover:bg-brand-700">
          <Link href={upgradeHref}>업그레이드</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   하위 컴포넌트 — FreePreviewCounter
   ═══════════════════════════════════════════════════════════════════════ */

interface FreePreviewCounterProps {
  current: number;
  max: number;
}

/**
 * Free preview 카운터 — "5 / 20 무료" 형식 우상단 배지.
 */
export function FreePreviewCounter({
  current,
  max,
}: FreePreviewCounterProps): React.ReactElement {
  return (
    <Badge
      data-gated-state="counter"
      variant="outline"
      className={cn(
        "absolute right-2 top-2",
        "border-brand-300 bg-brand-50/80 text-brand-700",
        "dark:border-brand-800 dark:bg-brand-950/40 dark:text-brand-400",
      )}
    >
      무료 {current} / {max}
    </Badge>
  );
}
