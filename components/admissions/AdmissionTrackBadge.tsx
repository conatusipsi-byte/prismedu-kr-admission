"use client";

/**
 * AdmissionTrackBadge — 전형 종류 시각 라벨
 *
 * P-013: jaeoegukmin 은 별도 색상(purple). 다른 6종(수시 4 + 정시 3)과 시각 분리.
 * 회귀 테스트(p-001-policy.test.tsx)가 jaeoegukmin 의 색상 토큰이 다른 kind 와
 * 다름을 강제 검증.
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { AdmissionTrackKind } from "@/types/admission";
import { TRACK_KIND_LABELS, TRACK_KIND_COLOR_TOKEN } from "@/lib/admission/labels";

export interface AdmissionTrackBadgeProps {
  kind: AdmissionTrackKind;
  className?: string;
}

/**
 * 색상 토큰 → Tailwind 클래스 매핑.
 * tailwind.config.ts 의 mint 토큰처럼 mint-* 직접 사용은 안 함 (디자인 토큰 분리).
 * 본 매핑은 컴포넌트 내부 상수로만 사용.
 */
const TOKEN_CLASS: Record<string, string> = {
  blue: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800",
  indigo: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800",
  amber: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
  rose: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800",
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
  teal: "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800",
  cyan: "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-800",
  slate: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-950/40 dark:text-slate-300 dark:border-slate-800",
  purple: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800",
};

export function AdmissionTrackBadge({
  kind,
  className,
}: AdmissionTrackBadgeProps): React.ReactElement {
  const token = TRACK_KIND_COLOR_TOKEN[kind];
  const colorClass = TOKEN_CLASS[token] ?? TOKEN_CLASS.slate;
  return (
    <Badge
      data-track-kind={kind}
      data-color-token={token}
      variant="outline"
      className={cn("border", colorClass, className)}
    >
      {TRACK_KIND_LABELS[kind]}
    </Badge>
  );
}
