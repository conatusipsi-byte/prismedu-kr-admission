/**
 * PrevYearResultCard — 작년 입결 (P-001 정형 정보)
 *
 * QA round 2 (2026-05-25) — 전형 라벨 명시:
 *   - 카드 상단 [전형] 배지 + "{전형명} 기준 입결" 헤더 — 어떤 전형 데이터인지 즉시 식별.
 *   - 메트릭 라벨은 트랙 종류별 정확 표기:
 *       정시(jeongsi_*) → 환산점수 컷 (cutoff70/50/Avg)
 *       학종·교과·논술 → 등급 컷 (gradeCutoff*)
 *     데이터에 트랙과 안 맞는 메트릭이 있으면 "데이터 검수 중" 표시 (P-002 정직성).
 *   - availableTrackKinds 길이 > 1 일 때 다중-트랙 disclaimer.
 *     ("이 데이터는 [primaryTrack] 기준. 다른 전형 입결은 데이터 누적 후 별도 표시.")
 *
 * 표본 부족 시 "표본 부족 — 미공개" 안내. 결제 CTA X.
 * 학종은 1단계/최종 분리 표시 (P-006).
 */

import { TrendingUp, Lock, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { AdmissionTrackBadge } from "./AdmissionTrackBadge";
import type {
  AdmissionTrackKind,
  PrevYearResult,
} from "@/types/admission";

export interface PrevYearResultCardProps {
  prevYearResult?: PrevYearResult;
  /** 이 데이터가 어떤 전형 기준인지 — 헤더 배지 + 메트릭 라벨 분기에 사용 */
  trackKind: AdmissionTrackKind;
  /** 학과가 운영하는 전 전형 목록 — 다중일 때 disclaimer 노출 */
  availableTrackKinds?: AdmissionTrackKind[];
  /** sample-gate 결과 — false면 컷 수치는 숨기고 안내 카드 노출 (P-001) */
  sampleSufficient: boolean;
  className?: string;
}

const isHakjong = (k: AdmissionTrackKind): boolean => k === "susi_comprehensive";
const isJeongsi = (k: AdmissionTrackKind): boolean =>
  k === "jeongsi_ga" || k === "jeongsi_na" || k === "jeongsi_da";
/** 등급컷 의미가 있는 전형 — 학종·교과·논술 (정시는 환산점수만, 실기는 둘 다 가능) */
const usesGradeCutoff = (k: AdmissionTrackKind): boolean =>
  k === "susi_subject" || k === "susi_comprehensive" || k === "susi_essay";
/** 환산점수컷 의미가 있는 전형 — 정시 + 논술(일부) */
const usesScoreCutoff = (k: AdmissionTrackKind): boolean =>
  isJeongsi(k) || k === "susi_essay" || k === "susi_practical";

export function PrevYearResultCard({
  prevYearResult: r,
  trackKind,
  availableTrackKinds,
  sampleSufficient,
  className,
}: PrevYearResultCardProps) {
  // 다중-트랙 disclaimer 노출 여부
  const otherTracks = (availableTrackKinds ?? []).filter((k) => k !== trackKind);
  const showMultiTrackNotice = otherTracks.length > 0;

  // 데이터 자체 없음 — 빈 카드 대신 명시 안내
  if (!r) {
    return (
      <Card
        data-component="prev-year-result-card"
        data-state="no-data"
        data-track-kind={trackKind}
        className={cn("border-dashed bg-zinc-50/50 dark:bg-zinc-900/30", className)}
      >
        <CardContent className="py-5 text-center text-sm text-muted-foreground">
          <div className="mb-3 flex items-center justify-center gap-2">
            <AdmissionTrackBadge kind={trackKind} />
            <span className="text-xs">기준 입결</span>
          </div>
          전년도 입결 데이터가 아직 수집되지 않았습니다.
        </CardContent>
      </Card>
    );
  }

  // 표본 부족 — 정형 정보지만 신뢰도 낮음. P-001 정직성: 컷 수치 비공개.
  if (!sampleSufficient) {
    return (
      <Card
        data-component="prev-year-result-card"
        data-state="insufficient-sample"
        data-track-kind={trackKind}
        className={cn(
          "border-dashed bg-zinc-50/50 dark:bg-zinc-900/30",
          className,
        )}
      >
        <CardContent className="flex flex-col items-center gap-2 py-6 text-center">
          <div className="mb-1 flex items-center gap-2">
            <AdmissionTrackBadge kind={trackKind} />
            <span className="text-xs text-muted-foreground">기준 입결</span>
          </div>
          <Lock aria-hidden className="h-5 w-5 text-zinc-400" />
          <p className="text-sm font-medium">전년도 입결 미공개</p>
          <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
            합격 사례 표본이 부족하여 컷 수치를 공개하지 않습니다. 경쟁률 등 일반
            지표는 아래에서 확인할 수 있어요.
          </p>
          {r.competitionRate != null && (
            <p className="mt-2 text-xs">
              <span className="text-muted-foreground">경쟁률</span>{" "}
              <span className="font-medium tabular-nums">
                {r.competitionRate.toFixed(1)} : 1
              </span>
            </p>
          )}
          {r.notes && (
            <p className="mt-1 text-xs text-muted-foreground">{r.notes}</p>
          )}
          {showMultiTrackNotice && <MultiTrackNotice />}
        </CardContent>
      </Card>
    );
  }

  // 트랙과 메트릭 정합성 — 정시인데 등급컷만 있거나 학종인데 환산점수만 있으면 데이터 부정합.
  const hasScoreCut = r.cutoff70 != null || r.cutoff50 != null || r.cutoffAvg != null;
  const hasGradeCut = r.gradeCutoff70 != null || r.gradeCutoffAvg != null;
  const metricMismatch =
    (isJeongsi(trackKind) && hasGradeCut && !hasScoreCut) ||
    (usesGradeCutoff(trackKind) && hasScoreCut && !hasGradeCut);

  // 정상 — 컷·경쟁률·추합 표시
  return (
    <Card
      data-component="prev-year-result-card"
      data-state="ok"
      data-track-kind={trackKind}
      className={className}
    >
      <CardContent className="flex flex-col gap-3 py-5">
        <div className="flex items-center gap-2">
          <TrendingUp aria-hidden className="h-4 w-4 text-brand-600" />
          <h3 className="text-sm font-semibold">전년도 입결</h3>
          <AdmissionTrackBadge kind={trackKind} className="ml-auto" />
        </div>

        <dl className="grid grid-cols-2 gap-3 text-sm">
          {r.competitionRate != null && (
            <div>
              <dt className="text-xs text-muted-foreground">경쟁률</dt>
              <dd className="font-medium tabular-nums">
                {r.competitionRate.toFixed(1)} : 1
              </dd>
            </div>
          )}

          {/* 정시 — 환산점수 컷. 정시 외 트랙에서 점수컷이 있으면 트랙명 prefix 로 모호함 차단. */}
          {usesScoreCutoff(trackKind) && r.cutoff70 != null && (
            <div>
              <dt className="text-xs text-muted-foreground">환산점수 70%컷</dt>
              <dd className="font-medium tabular-nums">{r.cutoff70.toFixed(1)}점</dd>
            </div>
          )}
          {usesScoreCutoff(trackKind) && r.cutoff50 != null && (
            <div>
              <dt className="text-xs text-muted-foreground">환산점수 50%컷</dt>
              <dd className="font-medium tabular-nums">{r.cutoff50.toFixed(1)}점</dd>
            </div>
          )}
          {usesScoreCutoff(trackKind) && r.cutoffAvg != null && (
            <div>
              <dt className="text-xs text-muted-foreground">환산점수 평균</dt>
              <dd className="font-medium tabular-nums">{r.cutoffAvg.toFixed(1)}점</dd>
            </div>
          )}

          {/* 학종·교과·논술 — 등급 컷 (1~9 범위) */}
          {usesGradeCutoff(trackKind) && r.gradeCutoffAvg != null && (
            <div>
              <dt className="text-xs text-muted-foreground">내신 평균 등급</dt>
              <dd className="font-medium tabular-nums">{r.gradeCutoffAvg.toFixed(2)}</dd>
            </div>
          )}
          {usesGradeCutoff(trackKind) && r.gradeCutoff70 != null && (
            <div>
              <dt className="text-xs text-muted-foreground">내신 70%컷 등급</dt>
              <dd className="font-medium tabular-nums">{r.gradeCutoff70.toFixed(2)}</dd>
            </div>
          )}
        </dl>

        {/* 학종 1단계/2단계 분리 (P-006) */}
        {isHakjong(trackKind) && (r.stage1Cutoff != null || r.stage1GradeCutoff != null || r.stage2PassRate != null) && (
          <div
            data-element="hakjong-breakdown"
            className="rounded-md border border-border bg-background/40 p-3 text-xs"
          >
            <p className="mb-1.5 font-medium">학종 단계별 — 1단계 vs 최종</p>
            <ul className="space-y-1 text-muted-foreground">
              {r.stage1Cutoff != null && (
                <li>· 1단계 통과 컷: <span className="tabular-nums">{r.stage1Cutoff.toFixed(1)}</span></li>
              )}
              {r.stage1GradeCutoff != null && (
                <li>· 1단계 통과 등급: <span className="tabular-nums">{r.stage1GradeCutoff.toFixed(2)}</span></li>
              )}
              {r.stage2PassRate != null && (
                <li>
                  · 2단계 통과율: <span className="tabular-nums">{(r.stage2PassRate * 100).toFixed(0)}%</span>
                </li>
              )}
            </ul>
          </div>
        )}

        {/* 메트릭-트랙 부정합 — 데이터 검수 신호 (P-002) */}
        {metricMismatch && (
          <p
            data-element="metric-mismatch"
            className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
          >
            ⚠️ 이 전형은 일반적으로 다른 형태의 컷 수치를 사용합니다. 데이터 검수 중입니다.
          </p>
        )}

        {r.notes && (
          <p className="text-xs leading-relaxed text-muted-foreground">{r.notes}</p>
        )}

        {showMultiTrackNotice && <MultiTrackNotice />}
      </CardContent>
    </Card>
  );
}

/**
 * 다중-트랙 안내 — 학과가 여러 전형을 운영하는데 입결은 1개 트랙 기준만 표시.
 * 사용자가 "이 숫자가 어떤 전형 거지?" 라고 헷갈리는 것을 차단 (QA round 2 클라이언트 신고).
 *
 * 데이터 schema 가 prev_year_result 를 단일 JSONB 로만 저장 — per-track 분리는 후속 PR.
 */
function MultiTrackNotice(): React.ReactNode {
  return (
    <div
      data-element="multi-track-notice"
      className="flex items-start gap-1.5 rounded-md bg-muted/40 px-3 py-2 text-2xs text-muted-foreground"
    >
      <Info aria-hidden className="mt-0.5 h-3 w-3 flex-shrink-0" />
      <p className="leading-relaxed break-keep-all">
        이 학과는 여러 전형을 운영합니다. 다른 전형의 전년도 입결은 데이터 누적 후
        별도 표시될 예정이에요.
      </p>
    </div>
  );
}
