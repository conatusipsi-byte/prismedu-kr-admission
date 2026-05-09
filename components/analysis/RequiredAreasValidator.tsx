"use client";

/**
 * RequiredAreasValidator — B1 응시영역기준 자가검증 카드
 *
 * 한국 정시·일부 수시는 "응시영역" 자체를 자격 요건으로 둔다 (csatMinimum과 다른 차원).
 * 예: 서울대 자연계 정시는 수학에서 미적분/기하 중 1, 탐구는 과학탐구 2과목 필수.
 *     인문계 일반대는 보통 그런 제약 없음.
 *
 * 분석 폼 단계에선 학과가 미정이지만, 사용자가 본인 응시영역으로 도전 가능 분류
 * (자연계·인문계)를 미리 인지하도록 안내. 학과 매칭 시 자격 미달 학과는 결과
 * 페이지에서 별도 표시 (matching 단계).
 *
 * 본 컴포넌트는 검증만 — 차단·자동 redirect 안 함. 사용자는 자유롭게 다음 단계로 진행.
 */

import * as React from "react";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CsatScoreInputValue } from "./CsatScoreInput";

export type AnalysisTrack = "humanities" | "natural" | "arts";

export interface RequiredAreasCheck {
  /** 자연계 정시 핵심 필터: 수학 미적분/기하 OR */
  naturalMathOk: boolean;
  /** 자연계 정시 핵심 필터: 과학탐구 2과목 응시 */
  naturalSciOk: boolean;
  /** 인문계 정시 — 보통 제약 적음. 영어·한국사 응시 여부만. */
  englishOk: boolean;
  historyOk: boolean;
  /** 자연계 응시영역 전반 충족 (둘 다 OK) */
  naturalEligible: boolean;
}

/**
 * B1 — CsatScoreInputValue 기반 응시영역 충족 여부 산출.
 *
 * 자연계 보수 기준(상위권 이공·의약 다수가 채택):
 *   - 수학: 미적분 또는 기하
 *   - 탐구: 과학탐구 2과목
 *
 * 자연계 미충족이면 의예·서울권 자연 정시 대부분에서 자격 미달이지만, 일부 학교는
 * 인문계와 유사한 룰을 가져 출처별 차이 큼 — 본 함수는 "보수 기준"만 평가하고
 * 미충족 시 "일부 자연계 트랙 자격 미달 가능성"으로 안내한다.
 */
export function evaluateRequiredAreas(v: CsatScoreInputValue): RequiredAreasCheck {
  const mathCourse = v.math.course;
  const naturalMathOk = mathCourse === "calculus" || mathCourse === "geometry";

  const sciCount = v.investigation.filter((e) => e.type === "science" && e.grade != null).length;
  const naturalSciOk = sciCount >= 2;

  const englishOk = v.english.grade != null;
  const historyOk = v.history.grade != null;

  return {
    naturalMathOk,
    naturalSciOk,
    englishOk,
    historyOk,
    naturalEligible: naturalMathOk && naturalSciOk,
  };
}

export interface RequiredAreasValidatorProps {
  csat: CsatScoreInputValue;
  /** Step 1에서 선택한 계열 — 'natural'이면 자연계 보수 기준을 강조 */
  track: AnalysisTrack;
  className?: string;
}

export function RequiredAreasValidator({
  csat,
  track,
  className,
}: RequiredAreasValidatorProps): React.ReactElement {
  const check = React.useMemo(() => evaluateRequiredAreas(csat), [csat]);

  const showNaturalBlock = track === "natural" || track === "humanities";
  // 인문계 학생도 자연계 학과 지원 가능성을 안내 — 정보 제공 차원

  const naturalLabel = check.naturalEligible
    ? "자연계 응시영역 충족"
    : "일부 자연계 트랙 자격 미달 가능성";

  return (
    <div
      data-component="required-areas-validator"
      data-track={track}
      data-natural-eligible={check.naturalEligible}
      className={cn(
        "rounded-lg border p-3 text-sm",
        track === "natural" && !check.naturalEligible
          ? "border-amber-300 bg-amber-50 dark:border-amber-700/40 dark:bg-amber-900/20"
          : "border-zinc-200 bg-zinc-50 dark:border-zinc-800/60 dark:bg-zinc-900/40",
        className,
      )}
    >
      <div className="mb-2 flex items-center gap-1.5 font-medium">
        {track === "natural" && !check.naturalEligible ? (
          <AlertTriangle className="h-4 w-4 text-amber-600" />
        ) : (
          <Info className="h-4 w-4 text-muted-foreground" />
        )}
        응시영역 자격 검토
      </div>

      {showNaturalBlock && (
        <ul className="flex flex-col gap-1 text-xs">
          <li className="flex items-center gap-1.5" data-rule="natural-math">
            {check.naturalMathOk ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
            )}
            <span>수학 미적분/기하 응시 ({check.naturalMathOk ? "충족" : "미충족"})</span>
          </li>
          <li className="flex items-center gap-1.5" data-rule="natural-science">
            {check.naturalSciOk ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
            )}
            <span>과학탐구 2과목 응시 ({check.naturalSciOk ? "충족" : "미충족"})</span>
          </li>
          <li
            className="mt-1 flex items-center gap-1.5 font-medium"
            data-rule="natural-summary"
          >
            {check.naturalEligible ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
            )}
            <span>{naturalLabel}</span>
          </li>
        </ul>
      )}

      <p className="mt-2 text-xs text-muted-foreground">
        ⚠️ 응시영역 기준은 학과·전형마다 다릅니다. 본 검토는 보수 기준 가이드 —
        결과 페이지에서 학과별 자격 충족 여부를 별도 표시합니다.
      </p>
    </div>
  );
}
