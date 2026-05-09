/**
 * PrevYearResultCard — 작년 입결 (P-001 정형 정보)
 *
 * 표본 부족 시 "표본 부족 — 미공개" 안내. 결제 CTA X.
 * 학종은 1단계/최종 분리 표시 (P-006).
 */

import { TrendingUp, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import type {
  AdmissionTrackKind,
  PrevYearResult,
} from "@/types/admission";

export interface PrevYearResultCardProps {
  prevYearResult?: PrevYearResult;
  trackKind: AdmissionTrackKind;
  /** sample-gate 결과 — false면 컷 수치는 숨기고 안내 카드 노출 (P-001) */
  sampleSufficient: boolean;
  className?: string;
}

const isHakjong = (k: AdmissionTrackKind): boolean => k === "susi_comprehensive";

export function PrevYearResultCard({
  prevYearResult: r,
  trackKind,
  sampleSufficient,
  className,
}: PrevYearResultCardProps) {
  // 데이터 자체 없음 — 빈 카드 대신 명시 안내
  if (!r) {
    return (
      <Card
        data-component="prev-year-result-card"
        data-state="no-data"
        className={cn("border-dashed bg-zinc-50/50 dark:bg-zinc-900/30", className)}
      >
        <CardContent className="py-5 text-center text-sm text-muted-foreground">
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
        className={cn(
          "border-dashed bg-zinc-50/50 dark:bg-zinc-900/30",
          className,
        )}
      >
        <CardContent className="flex flex-col items-center gap-2 py-6 text-center">
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
        </CardContent>
      </Card>
    );
  }

  // 정상 — 컷·경쟁률·추합 표시
  return (
    <Card
      data-component="prev-year-result-card"
      data-state="ok"
      className={className}
    >
      <CardContent className="flex flex-col gap-3 py-5">
        <div className="flex items-center gap-2">
          <TrendingUp aria-hidden className="h-4 w-4 text-mint-600" />
          <h3 className="text-sm font-semibold">전년도 입결</h3>
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

          {/* 정시 — 환산점수 컷 */}
          {r.cutoff70 != null && (
            <div>
              <dt className="text-xs text-muted-foreground">70%컷</dt>
              <dd className="font-medium tabular-nums">{r.cutoff70}점</dd>
            </div>
          )}
          {r.cutoff50 != null && (
            <div>
              <dt className="text-xs text-muted-foreground">50%컷</dt>
              <dd className="font-medium tabular-nums">{r.cutoff50}점</dd>
            </div>
          )}
          {r.cutoffAvg != null && (
            <div>
              <dt className="text-xs text-muted-foreground">평균</dt>
              <dd className="font-medium tabular-nums">{r.cutoffAvg}점</dd>
            </div>
          )}

          {/* 학종·교과 — 등급 컷 */}
          {r.gradeCutoffAvg != null && (
            <div>
              <dt className="text-xs text-muted-foreground">평균 등급</dt>
              <dd className="font-medium tabular-nums">{r.gradeCutoffAvg}</dd>
            </div>
          )}
          {r.gradeCutoff70 != null && (
            <div>
              <dt className="text-xs text-muted-foreground">70%컷 등급</dt>
              <dd className="font-medium tabular-nums">{r.gradeCutoff70}</dd>
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
                <li>· 1단계 통과 컷: <span className="tabular-nums">{r.stage1Cutoff}</span></li>
              )}
              {r.stage1GradeCutoff != null && (
                <li>· 1단계 통과 등급: <span className="tabular-nums">{r.stage1GradeCutoff}</span></li>
              )}
              {r.stage2PassRate != null && (
                <li>
                  · 2단계 통과율: <span className="tabular-nums">{(r.stage2PassRate * 100).toFixed(0)}%</span>
                </li>
              )}
            </ul>
          </div>
        )}

        {r.notes && (
          <p className="text-xs leading-relaxed text-muted-foreground">{r.notes}</p>
        )}
      </CardContent>
    </Card>
  );
}
