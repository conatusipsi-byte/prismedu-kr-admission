"use client";

/**
 * OnboardingWizard — /onboarding 페이지 본체 (4-step Stepper)
 *
 * 첫 로그인 시 KR Specs(학년·계열·내신·수능·비교과)를 받아 사용자 spec 스냅샷으로
 * 저장한 뒤 대시보드 또는 첫 분석으로 안내한다.
 *
 * Step 1 BasicInfo  → BasicInfoStep 재사용. 외국 고교 = '예'면 BasicInfoStep 내부에서
 *                     /admissions/jaeoegukmin로 redirect (P-013).
 * Step 2 ScoreInput → ScoreInputStep 재사용 (내신 + 수능/모의).
 * Step 3 ExtraActivity → ExtraActivityStep 재사용 (생기부 비교과 정량).
 * Step 4 Done → 저장 결과 안내 + 다음 액션 분기. 의향(수시 6장 + 정시 가/나/다)은
 *               분석 결과를 본 후 학과를 고르며 채우는 게 자연스러워 onboarding에서
 *               분리. POST /api/intent/validate는 분석 결과 페이지·/profile에서 수행.
 *
 * 완료 시 POST /api/user/specs → 성공이면 /dashboard 또는 /analysis로 이동.
 * 분석 폼(AnalysisFormWizard)과 step 컴포넌트를 공유해 회귀 영향 최소.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  FileBarChart,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchWithAuth, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  BasicInfoStep,
  EMPTY_BASIC_INFO,
  isBasicInfoValid,
  type BasicInfoStepValue,
  type GradeLevel,
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
  type ExtraActivityStepValue,
} from "./ExtraActivityStep";

type StepId = 1 | 2 | 3 | 4;

const STEPS = [
  { id: 1 as const, label: "기본 정보", icon: ClipboardList },
  { id: 2 as const, label: "성적", icon: FileBarChart },
  { id: 3 as const, label: "비교과", icon: Sparkles },
  { id: 4 as const, label: "완료", icon: CheckCircle2 },
];

export interface OnboardingPayload {
  basic: BasicInfoStepValue;
  score: ScoreInputStepValue;
  extra: ExtraActivityStepValue;
}

export const EMPTY_ONBOARDING: OnboardingPayload = {
  basic: EMPTY_BASIC_INFO,
  score: EMPTY_SCORE_INPUT,
  extra: EMPTY_EXTRA_ACTIVITY_STEP,
};

export interface OnboardingWizardProps {
  /** 테스트·스토리북 주입용 초기값 */
  initialValue?: OnboardingPayload;
  /** 테스트 주입 — 실 라우트 호출 차단. 호출되면 라우터 이동도 스킵. */
  onSubmit?: (payload: OnboardingPayload) => Promise<void> | void;
  className?: string;
}

export function OnboardingWizard({
  initialValue = EMPTY_ONBOARDING,
  onSubmit,
  className,
}: OnboardingWizardProps): React.ReactElement {
  const router = useRouter();
  const [step, setStep] = React.useState<StepId>(1);
  const [value, setValue] = React.useState<OnboardingPayload>(initialValue);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  const stepValid: Record<StepId, boolean> = {
    1: isBasicInfoValid(value.basic),
    2: isScoreInputValid(value.score),
    // 비교과는 P-002에 따라 빈 값 허용
    3: true,
    // step 4는 결과 화면 — 진행 버튼 자체가 없음
    4: true,
  };

  async function handleSubmit(): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      if (onSubmit) {
        await onSubmit(value);
        setSaved(true);
        setStep(4);
        return;
      }
      const payload = buildSpecPayload(value);
      await fetchWithAuth("/api/user/specs", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setSaved(true);
      setStep(4);
    } catch (e) {
      // stub 응답(200 + { todo }) 또는 본 라우트가 아직 미구현인 경우에도 onboarding을
      // 막지 않도록 — 사용자 입력은 폼 state에 보존되어 있고, 다음 PR에서 라우트 본체가
      // 살아나면 그때 진짜 저장이 동작. 다만 명확한 에러는 노출.
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
    if (step === 3) {
      void handleSubmit();
    }
  };

  const handleBack = () => {
    if (step > 1 && step < 4) setStep((step - 1) as StepId);
  };

  return (
    <Card
      data-component="onboarding-wizard"
      data-step={step}
      className={cn(
        "border-mint-200 bg-mint-50/20 dark:border-mint-900/40",
        className,
      )}
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
                    active
                      ? "font-semibold text-foreground"
                      : "text-muted-foreground",
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
          {step === 4 && <DoneStep saved={saved} router={router} />}
        </div>

        {/* Honesty caveat (P-002) — step 4 제외 항상 노출 */}
        {step < 4 && (
          <p className="rounded-md border border-amber-200 bg-amber-50/60 p-2 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/15 dark:text-amber-200">
            ⚠️ 입력 내용은 본인만 조회 가능합니다. 표본이 부족한 학과는 합격 확률을
            표시하지 않으며, 비교과는 빈 값이어도 분석에 페널티가 없어요.
          </p>
        )}

        {error && (
          <div
            role="alert"
            data-testid="onboarding-form-error"
            className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive"
          >
            {error}
          </div>
        )}

        {/* Nav — step 4에서는 숨김 (DoneStep이 자체 CTA를 가짐) */}
        {step < 4 && (
          <div className="flex items-center justify-between gap-2 border-t pt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleBack}
              disabled={step === 1}
            >
              <ArrowLeft className="mr-1 h-3.5 w-3.5" />
              이전
            </Button>
            <span className="text-xs text-muted-foreground">
              {step} / {STEPS.length - 1}
            </span>
            <Button
              type="button"
              size="sm"
              onClick={handleNext}
              disabled={!stepValid[step] || submitting}
              className="bg-mint-600 hover:bg-mint-700"
            >
              {submitting ? "저장 중…" : step < 3 ? "다음" : "프로필 저장"}
              <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DoneStep({
  saved,
  router,
}: {
  saved: boolean;
  router: ReturnType<typeof useRouter>;
}): React.ReactElement {
  return (
    <div className="flex flex-col items-center gap-5 py-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-mint-100 text-mint-600 dark:bg-mint-900/60 dark:text-mint-300">
        <CheckCircle2 className="h-7 w-7" />
      </div>
      <div className="space-y-1.5 max-w-md break-keep-all">
        <h2 className="text-lg font-bold text-foreground">
          {saved ? "프로필 저장 완료!" : "거의 다 됐어요"}
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          이제 첫 분석을 돌려서 학과별 합격률을 확인해보세요. 마음에 드는 학과를
          고르며 수시 6장·정시 가/나/다군 의향을 채우면, 대시보드가 D-Day와 함께
          관리해드려요.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
        <Button
          type="button"
          size="lg"
          onClick={() => router.push("/analysis")}
          className="bg-mint-600 hover:bg-mint-700"
        >
          첫 분석 시작하기
          <ArrowRight className="ml-1 h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="lg"
          variant="outline"
          onClick={() => router.push("/dashboard")}
        >
          대시보드 먼저 보기
        </Button>
      </div>
    </div>
  );
}

/**
 * 폼 state → POST /api/user/specs payload 매핑.
 *
 * UserSpecsUpsertSchema(lib/schemas/api/user.ts) 형식 강제:
 *   - asOf.schoolYear: gradeLevel high1→1, high2→2, high3/n_repeat→3
 *   - asOf.semester: 기본 1 (온보딩에선 묻지 않음)
 *   - schoolRecord.gpaByTerm: relativeGpa 입력된 항목만, totalUnits null이면 0으로 보정
 *   - csat: korean·math·english·history 등급이 모두 채워졌을 때만 포함
 *           (스키마가 4과목 grade 필수이므로, 부분 입력 상태로 보내면 400)
 */
function buildSpecPayload(form: OnboardingPayload) {
  const { basic, score } = form;
  const schoolYear = mapGradeLevelToYear(basic.gradeLevel);

  const gpaByTerm = score.naesin
    .filter((e) => e.relativeGpa != null)
    .map((e) => ({
      schoolYear: e.schoolYear,
      semester: e.semester,
      relativeGpa: e.relativeGpa as number,
      ...(e.absoluteGpa != null ? { absoluteGpa: e.absoluteGpa } : {}),
      totalUnits: e.totalUnits ?? 0,
    }));

  const csat = buildCsatPayload(score.csat);

  return {
    asOf: { schoolYear, semester: 1 as const },
    schoolRecord: {
      gpaByTerm,
    },
    ...(csat ? { csat } : {}),
  };
}

function mapGradeLevelToYear(level: GradeLevel | null): 1 | 2 | 3 {
  if (level === "high1") return 1;
  if (level === "high2") return 2;
  return 3;
}

function buildCsatPayload(csat: ScoreInputStepValue["csat"]) {
  const k = csat.korean.grade;
  const m = csat.math.grade;
  const e = csat.english.grade;
  const h = csat.history.grade;
  if (k == null || m == null || e == null || h == null) return null;

  return {
    actual: csat.actual,
    takenAt: new Date().toISOString().slice(0, 10),
    korean: pickCsatArea(csat.korean),
    math: pickCsatArea(csat.math),
    english: { grade: e },
    history: { grade: h },
    investigation: csat.investigation
      .filter((i) => i.grade != null)
      .map((i) => ({
        course: i.course,
        type: i.type,
        grade: i.grade as number,
        ...(i.standard != null ? { standard: i.standard } : {}),
        ...(i.percentile != null ? { percentile: i.percentile } : {}),
      })),
  };
}

function pickCsatArea(area: { grade: number | null; standard: number | null; percentile: number | null }) {
  return {
    grade: area.grade as number,
    ...(area.standard != null ? { standard: area.standard } : {}),
    ...(area.percentile != null ? { percentile: area.percentile } : {}),
  };
}
