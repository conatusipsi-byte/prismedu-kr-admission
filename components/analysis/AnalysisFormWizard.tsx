"use client";

/**
 * AnalysisFormWizard — /analysis 페이지 본체 (3-step Stepper)
 *
 * Step 1 BasicInfo  → 외국 고교 = '예' 시 BasicInfoStep 내부에서 jaeoegukmin로 redirect (P-013).
 * Step 2 ScoreInput → 내신·수능 입력. RequiredAreasValidator로 응시영역 자격 자가검토 (B1).
 * Step 3 ExtraActivity → 생기부 비교과 정량. 자소서 영역 미포함.
 *
 * 완료 시 POST /api/match → 결과 페이지(/analysis/[id])로 이동.
 *
 * 본 PR 단계: API stub과 통신만 — 결과 페이지 본체는 후속 PR.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, ClipboardList, FileBarChart, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchWithAuth, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  BasicInfoStep,
  EMPTY_BASIC_INFO,
  isBasicInfoValid,
  type BasicInfoStepValue,
} from "./BasicInfoStep";
import {
  ScoreInputStep,
  EMPTY_SCORE_INPUT,
  isScoreInputValid,
  type ScoreInputStepValue,
} from "./ScoreInputStep";
import {
  ExtraActivityStep,
  EMPTY_EXTRA_ACTIVITY_STEP,
  isExtraActivityValid,
  type ExtraActivityStepValue,
} from "./ExtraActivityStep";

type StepId = 1 | 2 | 3;

const STEPS = [
  { id: 1 as const, label: "기본 정보", icon: ClipboardList },
  { id: 2 as const, label: "성적", icon: FileBarChart },
  { id: 3 as const, label: "비교과", icon: Sparkles },
];

export interface AnalysisFormPayload {
  basic: BasicInfoStepValue;
  score: ScoreInputStepValue;
  extra: ExtraActivityStepValue;
}

export const EMPTY_ANALYSIS_FORM: AnalysisFormPayload = {
  basic: EMPTY_BASIC_INFO,
  score: EMPTY_SCORE_INPUT,
  extra: EMPTY_EXTRA_ACTIVITY_STEP,
};

export interface AnalysisFormWizardProps {
  /** 테스트·스토리북 주입용 초기값 */
  initialValue?: AnalysisFormPayload;
  /** 테스트 주입 — 실 라우트 호출 차단 */
  onSubmit?: (payload: AnalysisFormPayload) => Promise<void> | void;
  className?: string;
}

export function AnalysisFormWizard({
  initialValue = EMPTY_ANALYSIS_FORM,
  onSubmit,
  className,
}: AnalysisFormWizardProps): React.ReactElement {
  const router = useRouter();
  const [step, setStep] = React.useState<StepId>(1);
  const [value, setValue] = React.useState<AnalysisFormPayload>(initialValue);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const stepValid: Record<StepId, boolean> = {
    1: isBasicInfoValid(value.basic),
    2: isScoreInputValid(value.score),
    3: isExtraActivityValid(value.extra),
  };

  async function handleSubmit(): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      if (onSubmit) {
        await onSubmit(value);
        return;
      }
      // /api/match는 KrSpecsSchema 전체(basic+score+extra)를 요구. isBasicInfoValid가
      // gradeLevel/track/abroadHighSchool='no' 모두 통과를 보장한 시점이므로 non-null 단언.
      const payload = {
        basic: {
          gradeLevel: value.basic.gradeLevel!,
          track: value.basic.track!,
          abroadHighSchool: "no" as const,
        },
        score: value.score,
        extra: value.extra,
        filter: { track: trackToFilter(value.basic.track) },
      };
      const data = await fetchWithAuth<{ matchId?: string; todo?: string }>(
        "/api/match",
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      );
      if (data.matchId) {
        router.push(`/analysis/${data.matchId}`);
        return;
      }
      setError("분석 결과를 받지 못했어요. 잠시 후 다시 시도해주세요.");
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? `${e.message} (${e.status})`
          : (e as Error).message;
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  const handleNext = () => {
    if (step < 3) {
      setStep((step + 1) as StepId);
      return;
    }
    void handleSubmit();
  };

  const handleBack = () => {
    if (step > 1) setStep((step - 1) as StepId);
  };

  return (
    <Card
      data-component="analysis-form-wizard"
      data-step={step}
      className={cn("border-mint-200 bg-mint-50/20 dark:border-mint-900/40", className)}
    >
      <CardContent className="flex flex-col gap-6 py-6">
        {/* Step indicator */}
        <ol className="flex items-center gap-2" aria-label="진행 단계">
          {STEPS.map((s) => {
            const Icon = s.icon;
            const active = s.id === step;
            const done = s.id < step;
            return (
              <li
                key={s.id}
                data-step={s.id}
                data-state={active ? "active" : done ? "done" : "pending"}
                className="flex items-center gap-2"
              >
                <div
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold",
                    active
                      ? "bg-mint-600 text-white"
                      : done
                      ? "bg-mint-200 text-mint-700 dark:bg-mint-900 dark:text-mint-300"
                      : "bg-muted text-muted-foreground",
                  )}
                  aria-current={active ? "step" : undefined}
                >
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <span
                  className={cn(
                    "hidden text-xs sm:inline",
                    active ? "font-semibold text-foreground" : "text-muted-foreground",
                  )}
                >
                  {s.label}
                </span>
                {s.id < STEPS.length && (
                  <span aria-hidden className="h-px w-3 bg-border sm:w-6" />
                )}
              </li>
            );
          })}
        </ol>

        {/* Step content */}
        <div data-step-content={step} className="min-h-[280px]">
          {step === 1 && (
            <BasicInfoStep
              value={value.basic}
              onChange={(next) => setValue((v) => ({ ...v, basic: next }))}
            />
          )}
          {step === 2 && (
            <ScoreInputStep
              value={value.score}
              onChange={(next) => setValue((v) => ({ ...v, score: next }))}
              gradeLevel={value.basic.gradeLevel}
              track={value.basic.track ?? "humanities"}
            />
          )}
          {step === 3 && (
            <ExtraActivityStep
              value={value.extra}
              onChange={(next) => setValue((v) => ({ ...v, extra: next }))}
            />
          )}
        </div>

        {/* Honesty caveat (P-002) — 항상 노출 */}
        <p className="rounded-md border border-amber-200 bg-amber-50/60 p-2 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/15 dark:text-amber-200">
          ⚠️ 본 분석은 참고용입니다. 표본이 부족한 학과는 합격 확률을 표시하지 않으며,
          최종 지원·합격 여부는 모집요강과 본인 판단으로 결정하세요.
        </p>

        {error && (
          <div
            role="alert"
            data-testid="analysis-form-error"
            className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive"
          >
            {error}
          </div>
        )}

        {/* Nav */}
        <div className="flex items-center justify-between gap-2 border-t pt-4">
          <Button type="button" variant="outline" size="sm" onClick={handleBack} disabled={step === 1}>
            <ArrowLeft className="mr-1 h-3.5 w-3.5" />
            이전
          </Button>
          <span className="text-xs text-muted-foreground">{step} / {STEPS.length}</span>
          <Button
            type="button"
            size="sm"
            onClick={handleNext}
            disabled={!stepValid[step] || submitting}
            className="bg-mint-600 hover:bg-mint-700"
          >
            {submitting ? "분석 중…" : step < 3 ? "다음" : "분석 시작"}
            <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** UI 계열을 MatchInputSchema의 filter.track으로 매핑 (자연 → natural 외 단순 매핑). */
function trackToFilter(
  track: BasicInfoStepValue["track"],
): "humanities" | "natural" | "arts" | undefined {
  if (track == null) return undefined;
  return track;
}
