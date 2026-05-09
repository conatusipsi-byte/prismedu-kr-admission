"use client";

/**
 * BasicInfoStep — Step 1
 *
 * 학년·계열·외국 고교 여부 입력. 외국 고교 = '예'면 본 컴포넌트가 직접
 * router.push("/admissions/jaeoegukmin")로 이동시킨다 — P-013 진입점 분리.
 *
 * 일반 분석 폼에서 외국 고교 출신 학생이 자격 미달만 받고 이탈하는 패턴을
 * 차단하는 게 P-013의 목적이므로, 다음 단계로 못 가게 막는 게 아니라
 * 적합한 라우트로 직접 이동시켜야 한다.
 *
 * 이 redirect 동작은 회귀 게이트 — components/analysis/__tests__/
 * analysis-form-policy.test.tsx 가 검증한다.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type GradeLevel = "high1" | "high2" | "high3" | "n_repeat";
export type AnalysisTrack = "humanities" | "natural" | "arts";
export type AbroadHighSchool = "yes" | "no" | null;

export interface BasicInfoStepValue {
  gradeLevel: GradeLevel | null;
  track: AnalysisTrack | null;
  abroadHighSchool: AbroadHighSchool;
}

export const EMPTY_BASIC_INFO: BasicInfoStepValue = {
  gradeLevel: null,
  track: null,
  abroadHighSchool: null,
};

export interface BasicInfoStepProps {
  value: BasicInfoStepValue;
  onChange: (next: BasicInfoStepValue) => void;
}

export function isBasicInfoValid(v: BasicInfoStepValue): boolean {
  return v.gradeLevel != null && v.track != null && v.abroadHighSchool === "no";
}

export function BasicInfoStep({ value, onChange }: BasicInfoStepProps): React.ReactElement {
  const router = useRouter();

  // 외국 고교 = 'yes' → P-013 진입점으로 즉시 이동.
  // 사용자 의도가 명확해진 시점(=답변 직후)에만 push.
  React.useEffect(() => {
    if (value.abroadHighSchool === "yes") {
      router.push("/admissions/jaeoegukmin");
    }
  }, [value.abroadHighSchool, router]);

  return (
    <div data-step="basic-info" className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="basic-grade-level" className="text-sm font-medium">
          현재 학년
        </Label>
        <Select
          value={value.gradeLevel ?? ""}
          onValueChange={(v) => onChange({ ...value, gradeLevel: (v as GradeLevel) || null })}
        >
          <SelectTrigger id="basic-grade-level"><SelectValue placeholder="선택하세요" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="high1">고1</SelectItem>
            <SelectItem value="high2">고2</SelectItem>
            <SelectItem value="high3">고3</SelectItem>
            <SelectItem value="n_repeat">N수 (재수·반수·n수)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="basic-track" className="text-sm font-medium">
          희망 계열
        </Label>
        <Select
          value={value.track ?? ""}
          onValueChange={(v) => onChange({ ...value, track: (v as AnalysisTrack) || null })}
        >
          <SelectTrigger id="basic-track"><SelectValue placeholder="선택하세요" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="humanities">인문/사회</SelectItem>
            <SelectItem value="natural">자연/공학/의약</SelectItem>
            <SelectItem value="arts">예체능</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          학과별 합격률 산출 시 응시영역 가중치가 달라집니다.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label className="text-sm font-medium">외국 고교 출신인가요?</Label>
        <RadioGroup
          value={value.abroadHighSchool ?? ""}
          onValueChange={(v) =>
            onChange({ ...value, abroadHighSchool: (v as "yes" | "no") || null })
          }
          className="flex flex-col gap-2"
        >
          <div className="flex items-center gap-2 rounded-md border p-3 hover:bg-muted/50">
            <RadioGroupItem value="no" id="abroad-no" />
            <Label htmlFor="abroad-no" className="flex-1 cursor-pointer">
              아니요 (한국 고교 졸업·재학)
            </Label>
          </div>
          <div className="flex items-center gap-2 rounded-md border p-3 hover:bg-muted/50">
            <RadioGroupItem value="yes" id="abroad-yes" />
            <Label htmlFor="abroad-yes" className="flex-1 cursor-pointer">
              예 (외국 고교 졸업 또는 12학년 재학)
            </Label>
          </div>
        </RadioGroup>
        {value.abroadHighSchool === "yes" && (
          <p
            data-testid="jaeoegukmin-redirect-notice"
            className="rounded-md border border-purple-300 bg-purple-50/60 p-2 text-xs text-purple-900 dark:border-purple-900/50 dark:bg-purple-900/20 dark:text-purple-200"
          >
            재외국민·외국인·12년 외국 교육과정 트랙은 일반 분석과 별도로 운영됩니다.
            적합한 자가진단 페이지로 이동합니다…
          </p>
        )}
      </div>
    </div>
  );
}
