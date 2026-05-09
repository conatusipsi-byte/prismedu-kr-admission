"use client";

/**
 * JaeoegukminEligibilityWizard — 4단계 자격 자가진단 Stepper
 *
 * Step 1: 외국 고교 졸업 여부 (yes/no)
 * Step 2: 외국 거주 기간 (본인·부모 각각, 개월 단위)
 * Step 3: 한국 국적 여부
 * Step 4: 외국 학교 이수 학년 (12년 별도 트랙 분기)
 *
 * 마지막 단계 완료 → onComplete(result) 호출. 결과 표시는 부모(JaeoegukminPageView).
 *
 * 검증·상태 관리는 본 컴포넌트가 직접. zod·react-hook-form 의존성 회피.
 */

import * as React from "react";
import { ArrowLeft, ArrowRight, Globe2, Users, IdCard, GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  classifyEligibility,
  type JaeoegukminInput,
  type JaeoegukminResult,
} from "@/lib/admission/jaeoegukmin-eligibility";

export interface JaeoegukminEligibilityWizardProps {
  onComplete: (result: JaeoegukminResult, input: JaeoegukminInput) => void;
  onCancel?: () => void;
  className?: string;
}

const STEPS = [
  { id: 1, label: "외국 고교", icon: Globe2 },
  { id: 2, label: "거주 기간", icon: Users },
  { id: 3, label: "국적", icon: IdCard },
  { id: 4, label: "이수 학년", icon: GraduationCap },
] as const;

export function JaeoegukminEligibilityWizard({
  onComplete,
  onCancel,
  className,
}: JaeoegukminEligibilityWizardProps) {
  const [step, setStep] = React.useState<1 | 2 | 3 | 4>(1);

  // 입력 상태
  const [graduatedAbroad, setGraduatedAbroad] = React.useState<boolean | null>(null);
  const [studentMonths, setStudentMonths] = React.useState<string>("");
  const [parentMonths, setParentMonths] = React.useState<string>("");
  const [hasKoreanNat, setHasKoreanNat] = React.useState<boolean | null>(null);
  const [foreignYears, setForeignYears] = React.useState<string>("");

  /* ─── 단계별 검증 ─── */
  const stepValid: Record<1 | 2 | 3 | 4, boolean> = {
    1: graduatedAbroad !== null,
    2:
      Number.parseInt(studentMonths, 10) >= 0 &&
      Number.parseInt(parentMonths, 10) >= 0 &&
      studentMonths !== "" &&
      parentMonths !== "",
    3: hasKoreanNat !== null,
    4:
      foreignYears !== "" &&
      Number.parseInt(foreignYears, 10) >= 0 &&
      Number.parseInt(foreignYears, 10) <= 13,
  };

  const handleNext = () => {
    if (step < 4) {
      setStep((step + 1) as 1 | 2 | 3 | 4);
      return;
    }
    // 완료
    const input: JaeoegukminInput = {
      graduatedAbroad: graduatedAbroad ?? false,
      studentMonthsAbroad: Number.parseInt(studentMonths, 10) || 0,
      parentMonthsAbroad: Number.parseInt(parentMonths, 10) || 0,
      hasKoreanNationality: hasKoreanNat ?? true,
      foreignSchoolYears: Number.parseInt(foreignYears, 10) || 0,
    };
    const result = classifyEligibility(input);
    onComplete(result, input);
  };

  const handleBack = () => {
    if (step === 1) {
      onCancel?.();
      return;
    }
    setStep((step - 1) as 1 | 2 | 3 | 4);
  };

  return (
    <Card
      data-component="jaeoegukmin-wizard"
      data-step={step}
      className={cn("border-purple-200 bg-purple-50/20 dark:border-purple-900/40", className)}
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
                      ? "bg-purple-600 text-white"
                      : done
                      ? "bg-purple-200 text-purple-700 dark:bg-purple-900 dark:text-purple-300"
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
        <div data-step-content={step}>
          {step === 1 && (
            <div className="flex flex-col gap-3">
              <h2 className="text-base font-semibold">외국 고교를 졸업했거나 졸업 예정인가요?</h2>
              <p className="text-xs text-muted-foreground">
                한국 외 나라의 정규 고등학교 과정을 마쳤거나, 12학년 재학 중인 경우.
              </p>
              <RadioGroup
                value={graduatedAbroad === null ? "" : graduatedAbroad ? "yes" : "no"}
                onValueChange={(v) => setGraduatedAbroad(v === "yes")}
                className="mt-2 flex flex-col gap-2"
              >
                <div className="flex items-center gap-2 rounded-md border p-3 hover:bg-muted/50">
                  <RadioGroupItem value="yes" id="grad-yes" />
                  <Label htmlFor="grad-yes" className="flex-1 cursor-pointer">예</Label>
                </div>
                <div className="flex items-center gap-2 rounded-md border p-3 hover:bg-muted/50">
                  <RadioGroupItem value="no" id="grad-no" />
                  <Label htmlFor="grad-no" className="flex-1 cursor-pointer">아니요</Label>
                </div>
              </RadioGroup>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-4">
              <h2 className="text-base font-semibold">외국 거주 기간을 알려주세요</h2>
              <p className="text-xs text-muted-foreground">
                개월 단위로 입력. 정확하지 않다면 대략적인 누적 기간으로 OK.
                <br />
                (3년 = 36개월, 5년 = 60개월)
              </p>
              <div className="flex flex-col gap-2">
                <Label htmlFor="student-months">본인 외국 거주 (개월)</Label>
                <Input
                  id="student-months"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={300}
                  value={studentMonths}
                  onChange={(e) => setStudentMonths(e.target.value)}
                  placeholder="예: 48 (4년)"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="parent-months">부모 외국 거주 (개월)</Label>
                <Input
                  id="parent-months"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={500}
                  value={parentMonths}
                  onChange={(e) => setParentMonths(e.target.value)}
                  placeholder="예: 60 (5년)"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                ⚠️ 학교마다 거주 기간 산정 방식(연속·누적)이 다릅니다. 본 자가진단은
                대략 분류만 가이드 — 모집요강의 정확한 정의를 별도로 확인하세요.
              </p>
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-3">
              <h2 className="text-base font-semibold">한국 국적이 있나요?</h2>
              <p className="text-xs text-muted-foreground">
                한국 국적 보유 = 재외국민 전형 / 외국 국적 = 외국인 전형.
                이중국적은 학교마다 처리가 다릅니다.
              </p>
              <RadioGroup
                value={hasKoreanNat === null ? "" : hasKoreanNat ? "yes" : "no"}
                onValueChange={(v) => setHasKoreanNat(v === "yes")}
                className="mt-2 flex flex-col gap-2"
              >
                <div className="flex items-center gap-2 rounded-md border p-3 hover:bg-muted/50">
                  <RadioGroupItem value="yes" id="nat-yes" />
                  <Label htmlFor="nat-yes" className="flex-1 cursor-pointer">
                    한국 국적 (재외국민 전형 후보)
                  </Label>
                </div>
                <div className="flex items-center gap-2 rounded-md border p-3 hover:bg-muted/50">
                  <RadioGroupItem value="no" id="nat-no" />
                  <Label htmlFor="nat-no" className="flex-1 cursor-pointer">
                    외국 국적 (외국인 전형 후보)
                  </Label>
                </div>
              </RadioGroup>
            </div>
          )}

          {step === 4 && (
            <div className="flex flex-col gap-3">
              <h2 className="text-base font-semibold">외국 학교에서 몇 년 수학했나요?</h2>
              <p className="text-xs text-muted-foreground">
                초·중·고 모두 외국 = 12년. 중학교부터만 외국 = 6년 등. 고교만이면 3년.
              </p>
              <div className="flex flex-col gap-2">
                <Label htmlFor="foreign-years">외국 학교 수학 연수 (년)</Label>
                <Input
                  id="foreign-years"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={13}
                  value={foreignYears}
                  onChange={(e) => setForeignYears(e.target.value)}
                  placeholder="예: 12 (초중고 전체)"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                12년 외국 수학자는 일부 학교에서 별도 트랙으로 모집합니다.
              </p>
            </div>
          )}
        </div>

        {/* Nav */}
        <div className="flex items-center justify-between gap-2 border-t pt-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleBack}
          >
            <ArrowLeft className="mr-1 h-3.5 w-3.5" />
            {step === 1 ? "취소" : "이전"}
          </Button>
          <span className="text-xs text-muted-foreground">
            {step} / {STEPS.length}
          </span>
          <Button
            type="button"
            size="sm"
            onClick={handleNext}
            disabled={!stepValid[step]}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {step < 4 ? "다음" : "결과 보기"}
            <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
