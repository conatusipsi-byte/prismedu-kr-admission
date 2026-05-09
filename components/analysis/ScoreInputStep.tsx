"use client";

/**
 * ScoreInputStep — Step 2
 *
 * 내신 + 수능/모의 점수 입력. RequiredAreasValidator로 응시영역 자격 자가검토.
 * 학년에 따라 내신 입력 가능 학기를 좁힌다 (고1은 1학년만, 고2는 1·2학년, 고3·N수는 전체).
 */

import * as React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NaesinGradeInput, type NaesinTermEntry } from "./NaesinGradeInput";
import { CsatScoreInput, type CsatScoreInputValue } from "./CsatScoreInput";
import { RequiredAreasValidator, type AnalysisTrack } from "./RequiredAreasValidator";
import type { GradeLevel } from "./BasicInfoStep";
import type { SchoolYear } from "@/types/admission";

export interface ScoreInputStepValue {
  naesin: NaesinTermEntry[];
  csat: CsatScoreInputValue;
}

export const EMPTY_CSAT: CsatScoreInputValue = {
  actual: false,
  korean: { standard: null, percentile: null, grade: null, course: null },
  math: { standard: null, percentile: null, grade: null, course: null },
  english: { grade: null },
  history: { grade: null },
  investigation: [],
};

export const EMPTY_SCORE_INPUT: ScoreInputStepValue = {
  naesin: [],
  csat: EMPTY_CSAT,
};

export interface ScoreInputStepProps {
  value: ScoreInputStepValue;
  onChange: (next: ScoreInputStepValue) => void;
  gradeLevel: GradeLevel | null;
  track: AnalysisTrack;
}

function visibleYearsFor(level: GradeLevel | null): SchoolYear[] {
  if (level === "high1") return [1];
  if (level === "high2") return [1, 2];
  // high3, n_repeat, null
  return [1, 2, 3];
}

export function isScoreInputValid(v: ScoreInputStepValue): boolean {
  // 최소 검증: 내신 또는 수능 어느 하나는 등급 입력 필요.
  // (양쪽 모두 빈 채로 다음 단계로 가면 매칭 의미 없음.)
  const hasNaesin = v.naesin.some(
    (e) => e.relativeGpa != null || e.absoluteGpa != null,
  );
  const hasCsat =
    v.csat.korean.grade != null ||
    v.csat.math.grade != null ||
    v.csat.english.grade != null;
  return hasNaesin || hasCsat;
}

export function ScoreInputStep({
  value,
  onChange,
  gradeLevel,
  track,
}: ScoreInputStepProps): React.ReactElement {
  return (
    <div data-step="score-input" className="flex flex-col gap-4">
      <Tabs defaultValue="naesin">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="naesin">내신</TabsTrigger>
          <TabsTrigger value="csat">수능/모의</TabsTrigger>
        </TabsList>

        <TabsContent value="naesin" className="mt-4">
          <NaesinGradeInput
            value={value.naesin}
            onChange={(next) => onChange({ ...value, naesin: next })}
            visibleYears={visibleYearsFor(gradeLevel)}
          />
        </TabsContent>

        <TabsContent value="csat" className="mt-4 flex flex-col gap-4">
          <CsatScoreInput
            value={value.csat}
            onChange={(next) => onChange({ ...value, csat: next })}
          />
          <RequiredAreasValidator csat={value.csat} track={track} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
