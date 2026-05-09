"use client";

/**
 * ProbabilityTab — 학과 상세의 합격률 탭 (P-001 핵심 무대)
 *
 * Gated wrapper 의 4개 reason 분기 위임:
 *   - sampleSufficient && plan="paid" / "elite"  → children (합격률 차트)
 *   - sampleSufficient && in_free_preview         → children + 카운터
 *   - sampleSufficient && lockable                → 락 카드 (업그레이드 CTA)
 *   - !sampleSufficient                            → 안내 카드 (CTA 없음, P-001 옵션 B)
 *
 * 학종(susi_comprehensive)은 HakjongProbability 분해 표시 (P-006).
 *
 * ⚠️ 본 컴포넌트는 props 만 받음 — 실제 분석 로직(`/api/match`)은 호출자 책임.
 *    페이지에서 미로그인 상태이거나 분석 미실행 상태면 anonymous 분기 노출.
 */

import * as React from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Gated, type GateReason } from "@/components/access/Gated";
import type {
  AdmissionProbability,
  AdmissionTrackKind,
  HakjongProbability,
} from "@/types/admission";

export interface ProbabilityTabProps {
  /** sample-gate.checkSampleSufficiency 결과 */
  sampleSufficient: boolean;
  /** 락 결정 (sample-gate.isLockable). 미인증 사용자는 'free_plan_over_preview_quota' */
  lockReason?: GateReason;
  /** 합격 확률 — 표본 충족 + 분석 실행됨 */
  probability?: AdmissionProbability | null;
  /** 학종 분해 (트랙이 학종일 때만) */
  hakjong?: HakjongProbability | null;
  /** 트랙 종류 — 학종이면 분해 표시 */
  trackKind: AdmissionTrackKind;
  /** 미로그인 상태 — 로그인 CTA 별도 노출 */
  isAuthenticated: boolean;
  /** Free preview 카운터 (in_free_preview 일 때) */
  previewCounter?: { current: number; max: number };
  className?: string;
}

export function ProbabilityTab({
  sampleSufficient,
  lockReason,
  probability,
  hakjong,
  trackKind,
  isAuthenticated,
  previewCounter,
  className,
}: ProbabilityTabProps) {
  // 1. 표본 부족 — Gated 안내 카드 (CTA 없음, P-001 옵션 B)
  if (!sampleSufficient) {
    return (
      <div
        data-component="probability-tab"
        data-state="insufficient_sample"
        className={className}
      >
        <Gated
          feature="analysis"
          reason="insufficient_sample"
          sampleN={probability?.sampleN}
        />
      </div>
    );
  }

  // 2. 미로그인 상태 — 로그인 유도. 락 카드와 시각 분리. (정형 정보 무료 정책의 의미 있는 진입점)
  if (!isAuthenticated) {
    return (
      <Card
        data-component="probability-tab"
        data-state="anonymous"
        className={cn("border-mint-200 bg-mint-50/30", className)}
      >
        <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
          <Sparkles className="h-6 w-6 text-mint-600" />
          <p className="text-sm font-medium">합격 확률을 분석해드릴게요</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            내 내신·수능 점수를 입력하면 본 학과 합격 가능성을 분석합니다.
            모집요강·일정은 로그인 없이도 자유롭게 확인할 수 있어요.
          </p>
          <Button asChild size="sm" className="bg-mint-600 hover:bg-mint-700">
            <Link href={`/login?next=${encodeURIComponent(`/admissions`)}`}>
              로그인하고 분석 시작
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  // 3. 인증됨 + 표본 충족 + 락 결정 따라 Gated 분기
  return (
    <div
      data-component="probability-tab"
      data-state={lockReason ?? "open"}
      className={className}
    >
      <Gated
        feature="analysis"
        reason={lockReason}
        previewCounter={previewCounter}
      >
        <ProbabilityContent
          probability={probability}
          hakjong={hakjong}
          trackKind={trackKind}
        />
      </Gated>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   내부 — 합격 확률 본문 렌더 (Gated 통과 시)
   ═══════════════════════════════════════════════════════════════════════ */

function ProbabilityContent({
  probability,
  hakjong,
  trackKind,
}: {
  probability?: AdmissionProbability | null;
  hakjong?: HakjongProbability | null;
  trackKind: AdmissionTrackKind;
}) {
  // 인증·접근 OK이지만 분석 미실행 — 분석 트리거 안내
  if (!probability) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
          <p className="text-sm font-medium">아직 분석 결과가 없어요</p>
          <p className="text-xs text-muted-foreground">
            프로필에서 내신·수능 점수를 입력하면 자동으로 합격 확률이 표시됩니다.
          </p>
          <Button asChild size="sm" variant="outline">
            <Link href="/profile">점수 입력하기</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const isHakjong = trackKind === "susi_comprehensive";
  const showHakjong = isHakjong && hakjong && hakjong.sampleSufficient;

  return (
    <div className="flex flex-col gap-4">
      {/* 일반 합격 확률 카드 */}
      <Card>
        <CardContent className="flex flex-col gap-3 py-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">합격 확률</h3>
            <span
              data-category={probability.category}
              className={cn(
                "rounded-full border px-2 py-0.5 text-xs font-medium",
                CATEGORY_CLASS[probability.category],
              )}
            >
              {CATEGORY_LABEL[probability.category]}
            </span>
          </div>
          <div className="flex items-end gap-2">
            <span className="text-3xl font-bold tabular-nums">
              {probability.probability != null
                ? probability.probability.toFixed(0)
                : "—"}
            </span>
            <span className="text-sm text-muted-foreground">%</span>
            {probability.low != null && probability.high != null && (
              <span className="ml-2 text-xs text-muted-foreground">
                (구간 {probability.low.toFixed(0)} ~ {probability.high.toFixed(0)}%)
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            합격 사례 {probability.sampleN}건 기반
          </p>
        </CardContent>
      </Card>

      {/* 학종 분해 (P-006) */}
      {showHakjong && hakjong && (
        <Card data-element="hakjong-breakdown">
          <CardContent className="flex flex-col gap-3 py-5">
            <h3 className="text-sm font-semibold">학종 단계별 분해</h3>
            <dl className="grid grid-cols-3 gap-3">
              <div>
                <dt className="text-xs text-muted-foreground">1단계 통과</dt>
                <dd className="text-lg font-semibold tabular-nums">
                  {hakjong.stage1Pass != null
                    ? `${(hakjong.stage1Pass * 100).toFixed(0)}%`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">2단계 통과 (1단계 후)</dt>
                <dd className="text-lg font-semibold tabular-nums">
                  {hakjong.stage2Pass != null
                    ? `${(hakjong.stage2Pass * 100).toFixed(0)}%`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">최종 합격</dt>
                <dd className="text-lg font-semibold tabular-nums text-mint-600">
                  {hakjong.combined != null
                    ? `${(hakjong.combined * 100).toFixed(0)}%`
                    : "—"}
                </dd>
              </div>
            </dl>
            <p className="text-xs text-muted-foreground">
              표본 — 1단계 {hakjong.stage1SampleN}건 · 최종 {hakjong.finalSampleN}건
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   카테고리 매핑
   ═══════════════════════════════════════════════════════════════════════ */

const CATEGORY_LABEL: Record<string, string> = {
  reach: "도전",
  hard_target: "적정 (상)",
  target: "적정",
  safety: "안정",
  insufficient_sample: "표본 부족",
};

const CATEGORY_CLASS: Record<string, string> = {
  reach: "bg-rose-50 text-rose-700 border-rose-200",
  hard_target: "bg-amber-50 text-amber-700 border-amber-200",
  target: "bg-emerald-50 text-emerald-700 border-emerald-200",
  safety: "bg-blue-50 text-blue-700 border-blue-200",
  insufficient_sample: "bg-zinc-50 text-zinc-700 border-zinc-200",
};
