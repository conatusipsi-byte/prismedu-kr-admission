/**
 * TrackDetailCard — 단일 전형(AdmissionTrack) 상세
 *
 * 트랙 종류별 다른 강조:
 *   - 학종(susi_comprehensive): stages[] 1단계/2단계 비율 표시
 *   - 정시(jeongsi_*): reflectionRatio 차트 (별도 컴포넌트)
 *   - 논술(susi_essay)·실기(susi_practical): components 의 essay/practical 비중
 *
 * P-001: 합격률·점수 미리보기 X. 정형 정보(모집인원·일정·평가 비중)만.
 */

import { Calendar, Users, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AdmissionTrackBadge } from "./AdmissionTrackBadge";
import { CsatMinimumCard } from "./CsatMinimumCard";
import { ReflectionRatioChart } from "./ReflectionRatioChart";
import {
  classifyQuotaScope,
  isQuotaExternal,
  quotaScopeLabel,
} from "@/lib/admission/quota-scope";
import type { AdmissionTrack } from "@/types/admission";

export interface TrackDetailCardProps {
  track: AdmissionTrack;
  className?: string;
}

const COMPONENT_LABEL: Record<string, string> = {
  schoolRecord: "학생부(교과)",
  schoolActivity: "학생부(비교과)",
  document: "서류평가",
  interview: "면접",
  csat: "수능",
  practical: "실기",
  essay: "논술",
};

export function TrackDetailCard({ track, className }: TrackDetailCardProps) {
  // P-005 정직성 — 정원외/그룹 단위 전형은 모집인원이 학과 단위가 아니므로 별도 표시.
  const quotaScope = classifyQuotaScope(track);
  const external = isQuotaExternal(track);
  // 정시 예정안(전형시행계획) — 확정(모집요강) 아님. 시각 분리 + 배지 (정직성 P-002).
  const isPreliminary = track.planStatus === "preliminary";
  return (
    <Card
      data-component="track-detail-card"
      data-track-kind={track.kind}
      data-quota-scope={quotaScope}
      data-plan-status={track.planStatus ?? "confirmed"}
      className={cn(
        external && "border-indigo-200 dark:border-indigo-900/50",
        isPreliminary && "border-l-4 border-l-amber-400 dark:border-l-amber-500/70",
        className,
      )}
    >
      <CardContent className="flex flex-col gap-4 py-5">
        {/* 헤더 — 전형명·뱃지·모집인원 */}
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold">{track.name}</h3>
          <AdmissionTrackBadge kind={track.kind} />
          {isPreliminary && (
            <Badge
              variant="outline"
              data-element="plan-preliminary-badge"
              className="border-amber-300 bg-amber-50 text-2xs text-amber-700 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-300"
            >
              예정안 · 전형시행계획
            </Badge>
          )}
          {external && (
            <Badge
              variant="outline"
              data-element="quota-external-badge"
              className="border-indigo-200 bg-indigo-50 text-2xs text-indigo-700 dark:border-indigo-900/40 dark:bg-indigo-950/30 dark:text-indigo-300"
            >
              {quotaScopeLabel(quotaScope)}
            </Badge>
          )}
          <span className="ml-auto inline-flex items-center gap-1 text-sm font-medium tabular-nums text-muted-foreground">
            <Users aria-hidden className="h-3.5 w-3.5" />
            {track.quotaInitial}명
            {external && <span className="text-2xs font-normal">(그룹 단위)</span>}
            {track.quotaFinal != null && track.quotaFinal !== track.quotaInitial && (
              <span className="text-xs">
                {" → "}
                {track.quotaFinal}명 (이월 후)
              </span>
            )}
          </span>
        </div>

        {/* 예정안 안내 — 확정본 교체 예정 (정직성 P-002) */}
        {isPreliminary && (
          <p
            data-element="plan-preliminary-note"
            className="flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50/50 p-2.5 text-2xs leading-relaxed text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300"
          >
            <Info aria-hidden className="mt-0.5 h-3 w-3 shrink-0" />
            <span>
              2027 <strong>전형시행계획(예정안)</strong> 기준이에요. 정시 상세(변환표준점수 등)는{" "}
              <strong>12월 확정본</strong>으로 교체될 수 있습니다.
            </span>
          </p>
        )}

        {/* 단계별 평가 — stages.length > 1 이면 1단계 + 2단계 분해 */}
        {track.stages.length > 0 && <StagesSection stages={track.stages} />}

        {/* 영역별 반영비율 — 정시/논술/교과 (있으면) */}
        {track.reflectionRatio && (
          <ReflectionRatioChart ratio={track.reflectionRatio} />
        )}

        {/* 수능최저 (있으면) */}
        {track.csatMinimum && <CsatMinimumCard csatMinimum={track.csatMinimum} />}

        {/* 응시영역기준 — 정형 정보 (B1) */}
        {track.requiredAreas && (
          <div
            data-element="required-areas"
            className="rounded-md border border-zinc-200 bg-zinc-50/50 p-3 dark:border-zinc-800 dark:bg-zinc-900/30"
          >
            <p className="mb-1.5 text-xs font-medium text-foreground">수능 응시영역기준</p>
            <ul className="space-y-0.5 text-xs text-muted-foreground">
              {track.requiredAreas.math?.required && (
                <li>· 수학: {track.requiredAreas.math.courses.join("/")} 응시 필수</li>
              )}
              {track.requiredAreas.investigation && (
                <li>
                  · 탐구: {track.requiredAreas.investigation.types.join("/")}{" "}
                  {track.requiredAreas.investigation.requiredCount}과목 응시 필수
                </li>
              )}
              {track.requiredAreas.notes && (
                <li className="text-foreground/80">· {track.requiredAreas.notes}</li>
              )}
            </ul>
          </div>
        )}

        {/* 일정 (있으면) */}
        {track.schedule && <ScheduleSection schedule={track.schedule} />}

        {/* 변환표 status (P-012) */}
        {track.conversionTable && track.conversionTable.status === "preliminary" && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            ⚠️ 변환표는 수능 후 대학에서 별도 공지합니다.
            {track.conversionTable.sourceUrl && " 입학처 홈페이지에서 확인하세요."}
          </p>
        )}

        {/* 정원외(그룹 모집) — 지원자격 강조 + 합격률 미산출 안내 (P-005 정직성) */}
        {external ? (
          <div
            data-element="quota-external-notice"
            className="rounded-md border border-indigo-200 bg-indigo-50/50 p-3 dark:border-indigo-900/40 dark:bg-indigo-950/20"
          >
            <p className="flex items-center gap-1.5 text-xs font-medium text-indigo-800 dark:text-indigo-300">
              <Info aria-hidden className="h-3.5 w-3.5" />
              정원외 (그룹 모집) — 학과별 경쟁률·합격률과 다름
            </p>
            <p className="mt-1 text-2xs leading-relaxed text-indigo-900/80 dark:text-indigo-200/80">
              모집인원이 학과가 아닌 그룹·대학 단위라 학과별 합격률을 산출하지 않습니다.
              아래 지원자격 충족 여부가 핵심이니 꼭 확인하세요.
            </p>
            {track.notes && (
              <p className="mt-2 rounded bg-white/60 p-2 text-xs leading-relaxed text-foreground dark:bg-black/20">
                <span className="font-medium">지원자격·안내: </span>
                {track.notes}
              </p>
            )}
          </div>
        ) : (
          track.notes && (
            <p className="text-xs leading-relaxed text-muted-foreground">{track.notes}</p>
          )
        )}
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   서브 컴포넌트 — Stages
   ═══════════════════════════════════════════════════════════════════════ */

function StagesSection({
  stages,
}: {
  stages: AdmissionTrack["stages"];
}) {
  return (
    <div data-element="stages" className="flex flex-col gap-2">
      <p className="text-xs font-medium text-muted-foreground">전형요소·평가비중</p>
      {stages.map((stage) => {
        const total = Object.values(stage.components).reduce(
          (s, v) => s + (v ?? 0),
          0,
        );
        return (
          <div
            key={stage.step}
            className="rounded-md border border-border bg-background/50 p-3"
          >
            <div className="mb-2 flex items-center gap-2 text-xs">
              <Badge variant="outline" className="bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-400">
                {stage.step}단계
              </Badge>
              {stage.multiplier && (
                <span className="text-muted-foreground">
                  {stage.multiplier}배수 통과
                </span>
              )}
              <span className="ml-auto text-muted-foreground">
                합산 {total}
              </span>
            </div>
            <ul className="space-y-0.5 text-xs">
              {Object.entries(stage.components).map(([key, value]) => {
                if (value == null) return null;
                return (
                  <li
                    key={key}
                    className="flex items-center justify-between"
                  >
                    <span className="text-muted-foreground">
                      {COMPONENT_LABEL[key] ?? key}
                    </span>
                    <span className="font-medium tabular-nums">{value}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   서브 컴포넌트 — Schedule
   ═══════════════════════════════════════════════════════════════════════ */

function ScheduleSection({
  schedule,
}: {
  schedule: NonNullable<AdmissionTrack["schedule"]>;
}) {
  const items: Array<{ key: keyof typeof schedule; label: string }> = [
    { key: "applicationStart", label: "원서접수 시작" },
    { key: "applicationEnd", label: "원서접수 마감" },
    { key: "documentDeadline", label: "서류 마감" },
    { key: "interviewDate", label: "면접일" },
    { key: "practicalDate", label: "실기일" },
    { key: "announcementDate", label: "발표일" },
  ];
  const visible = items.filter((it) => schedule[it.key]);
  if (visible.length === 0) return null;

  return (
    <div
      data-element="schedule"
      className="flex flex-col gap-1.5 rounded-md bg-background/40 p-3"
    >
      <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-foreground">
        <Calendar aria-hidden className="h-3 w-3" />
        주요 일정
      </div>
      <ul className="space-y-0.5 text-xs">
        {visible.map((it) => (
          <li key={it.key} className="flex items-center justify-between">
            <span className="text-muted-foreground">{it.label}</span>
            <span className="tabular-nums">{schedule[it.key]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
