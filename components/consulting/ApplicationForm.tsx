"use client";

/**
 * ApplicationForm — 컨설팅 신청서 폼.
 *
 * react-hook-form + zod (lib/schemas/api/consulting.ts) 패턴. 시각·검증·접근성:
 *   - 필수 표시 (*) + 한국어 에러 메시지
 *   - 모든 입력에 min-h-11 (모바일 터치 영역)
 *   - questions 글자 수 카운터 (실시간)
 *   - 학년 select, 상담 주제 multi-select chip
 *   - 고등학교: HighSchoolAutocomplete (NEIS) 재사용
 *   - 희망 대학: 텍스트 입력 + Enter/추가 버튼 → chip 누적 (max 5)
 *
 * 정직성 (P-002):
 *   - 24시간 전 취소 정책 명시 (하단 노트).
 *   - 표본 부족 학과 분석 같은 가공 X. 입력 그대로 저장.
 *
 * 제출 흐름:
 *   - onValidSubmit(values) 콜백을 부모(BookingSection)가 전달.
 *   - 부모가 신청서 INSERT → 예약 확정 RPC 까지 한 번에 처리.
 *   - 본 컴포넌트는 form 검증 + UI 만 담당 (네트워크 X).
 */

import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HighSchoolAutocomplete } from "@/components/forms/HighSchoolAutocomplete";
import { cn } from "@/lib/utils";
import {
  CONSULTATION_TOPICS,
  ConsultingApplicationCreateSchema,
  type ConsultingApplicationCreate,
  type ConsultationTopic,
} from "@/lib/schemas/api/consulting";

const MAX_TARGET_UNIVERSITIES = 5;
const QUESTIONS_MIN = 50;
const QUESTIONS_MAX = 1000;
const GRADES_MAX = 500;

export interface ApplicationFormProps {
  /** 제출 시 호출. 부모가 API 통신 처리. */
  onValidSubmit: (values: ConsultingApplicationCreate) => Promise<void>;
  /** 외부 disabled (제출 중·entitlement 없음 등) */
  disabled?: boolean;
  /** 외부 제출 에러 — 검증 통과 후 API 가 거부한 경우 표시 */
  submitError?: string | null;
}

type FormValues = ConsultingApplicationCreate;

const DEFAULT_VALUES: FormValues = {
  studentName: "",
  studentGrade: 3 as 1 | 2 | 3,
  highSchool: "",
  consultationTopics: [],
  currentGrades: "",
  targetUniversities: [],
  questions: "",
};

export function ApplicationForm({
  onValidSubmit,
  disabled,
  submitError,
}: ApplicationFormProps): React.ReactElement {
  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(ConsultingApplicationCreateSchema),
    defaultValues: DEFAULT_VALUES,
    mode: "onBlur",
  });

  const [universityInput, setUniversityInput] = React.useState("");
  const targetUniversities = watch("targetUniversities") ?? [];
  const questions = watch("questions") ?? "";

  const addUniversity = (): void => {
    const trimmed = universityInput.trim();
    if (!trimmed) return;
    if (targetUniversities.length >= MAX_TARGET_UNIVERSITIES) return;
    if (targetUniversities.includes(trimmed)) {
      setUniversityInput("");
      return;
    }
    setValue("targetUniversities", [...targetUniversities, trimmed], {
      shouldValidate: true,
      shouldDirty: true,
    });
    setUniversityInput("");
  };

  const removeUniversity = (name: string): void => {
    setValue(
      "targetUniversities",
      targetUniversities.filter((u) => u !== name),
      { shouldValidate: true, shouldDirty: true },
    );
  };

  return (
    <form
      onSubmit={handleSubmit(onValidSubmit)}
      noValidate
      className="flex flex-col gap-5"
      aria-label="컨설팅 신청서"
    >
      {/* 학생 이름 */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="studentName" className="text-sm font-medium">
          학생 이름 <span className="text-destructive">*</span>
        </Label>
        <Input
          id="studentName"
          {...register("studentName")}
          placeholder="예: 홍길동"
          autoComplete="name"
          className="min-h-11"
          aria-invalid={!!errors.studentName}
          disabled={disabled}
        />
        {errors.studentName && (
          <p className="text-xs text-destructive" role="alert">
            {errors.studentName.message}
          </p>
        )}
      </div>

      {/* 학년 */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="studentGrade" className="text-sm font-medium">
          학년 <span className="text-destructive">*</span>
        </Label>
        <Controller
          name="studentGrade"
          control={control}
          render={({ field }) => (
            <Select
              value={String(field.value)}
              onValueChange={(v) => field.onChange(Number(v) as 1 | 2 | 3)}
              disabled={disabled}
            >
              <SelectTrigger id="studentGrade" className="min-h-11">
                <SelectValue placeholder="학년 선택" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">고1</SelectItem>
                <SelectItem value="2">고2</SelectItem>
                <SelectItem value="3">고3 / N수</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
        {errors.studentGrade && (
          <p className="text-xs text-destructive" role="alert">
            학년을 선택해주세요
          </p>
        )}
      </div>

      {/* 고등학교 (NEIS 자동완성) */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="highSchool" className="text-sm font-medium">
          출신 / 재학 고등학교 <span className="text-muted-foreground text-2xs">(선택)</span>
        </Label>
        <Controller
          name="highSchool"
          control={control}
          render={({ field }) => (
            <HighSchoolAutocomplete
              inputId="highSchool"
              value={field.value ?? ""}
              onChange={(text) => field.onChange(text)}
              onSelect={(school) => field.onChange(school.name)}
              disabled={disabled}
              placeholder="고등학교명 입력 (NEIS 자동완성)"
            />
          )}
        />
        {errors.highSchool && (
          <p className="text-xs text-destructive" role="alert">
            {errors.highSchool.message}
          </p>
        )}
      </div>

      {/* 상담 주제 multi-select */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-sm font-medium">
          상담 주제 <span className="text-destructive">*</span>
          <span className="ml-1 text-2xs font-normal text-muted-foreground">
            (복수 선택 가능)
          </span>
        </Label>
        <Controller
          name="consultationTopics"
          control={control}
          render={({ field }) => {
            const selected = field.value ?? [];
            const toggle = (topic: ConsultationTopic) => {
              const next = selected.includes(topic)
                ? selected.filter((t) => t !== topic)
                : [...selected, topic];
              field.onChange(next);
            };
            return (
              <div role="group" aria-label="상담 주제" className="flex flex-wrap gap-2">
                {CONSULTATION_TOPICS.map((topic) => {
                  const isOn = selected.includes(topic);
                  return (
                    <button
                      key={topic}
                      type="button"
                      onClick={() => toggle(topic)}
                      aria-pressed={isOn}
                      disabled={disabled}
                      className={cn(
                        "inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors min-h-9",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1",
                        isOn
                          ? "bg-brand-600 border-brand-600 text-white hover:bg-brand-700"
                          : "bg-background border-border text-foreground hover:bg-muted",
                        disabled && "opacity-50 cursor-not-allowed",
                      )}
                    >
                      {topic}
                    </button>
                  );
                })}
              </div>
            );
          }}
        />
        {errors.consultationTopics && (
          <p className="text-xs text-destructive" role="alert">
            {errors.consultationTopics.message}
          </p>
        )}
      </div>

      {/* 현재 성적 */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="currentGrades" className="text-sm font-medium">
          현재 성적 <span className="text-muted-foreground text-2xs">(선택)</span>
        </Label>
        <Textarea
          id="currentGrades"
          {...register("currentGrades")}
          placeholder="예: 내신 1.8, 6모 국어 1등급, 수학 2등급..."
          rows={3}
          maxLength={GRADES_MAX}
          disabled={disabled}
          aria-invalid={!!errors.currentGrades}
        />
        {errors.currentGrades && (
          <p className="text-xs text-destructive" role="alert">
            {errors.currentGrades.message}
          </p>
        )}
      </div>

      {/* 희망 대학 multi-input */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="universityInput" className="text-sm font-medium">
          희망 대학 <span className="text-muted-foreground text-2xs">(선택, 최대 {MAX_TARGET_UNIVERSITIES}개)</span>
        </Label>
        <div className="flex gap-2">
          <Input
            id="universityInput"
            value={universityInput}
            onChange={(e) => setUniversityInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addUniversity();
              }
            }}
            placeholder="대학명 입력 후 Enter"
            disabled={disabled || targetUniversities.length >= MAX_TARGET_UNIVERSITIES}
            className="min-h-11"
            maxLength={40}
          />
          <Button
            type="button"
            variant="outline"
            onClick={addUniversity}
            disabled={
              disabled ||
              !universityInput.trim() ||
              targetUniversities.length >= MAX_TARGET_UNIVERSITIES
            }
            className="min-h-11 shrink-0"
            aria-label="희망 대학 추가"
          >
            <Plus className="h-4 w-4" />
            <span className="ml-1">추가</span>
          </Button>
        </div>
        {targetUniversities.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {targetUniversities.map((u) => (
              <span
                key={u}
                className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-2xs font-medium text-foreground"
              >
                {u}
                <button
                  type="button"
                  onClick={() => removeUniversity(u)}
                  aria-label={`${u} 제거`}
                  disabled={disabled}
                  className="rounded-full hover:bg-background"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        {errors.targetUniversities && (
          <p className="text-xs text-destructive" role="alert">
            {errors.targetUniversities.message}
          </p>
        )}
      </div>

      {/* 질문 (+ 글자 수 카운터) */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="questions" className="text-sm font-medium">
          질문 / 상담 요청 <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="questions"
          {...register("questions")}
          placeholder="어떤 부분이 가장 궁금하신가요? 구체적으로 적어주실수록 정확한 상담이 가능합니다."
          rows={6}
          maxLength={QUESTIONS_MAX}
          disabled={disabled}
          aria-invalid={!!errors.questions}
        />
        <div className="flex items-center justify-between">
          {errors.questions ? (
            <p className="text-xs text-destructive" role="alert">
              {errors.questions.message}
            </p>
          ) : (
            <p className="text-2xs text-muted-foreground">
              최소 {QUESTIONS_MIN}자
            </p>
          )}
          <p
            className={cn(
              "text-2xs font-numeric tabular-nums",
              questions.length < QUESTIONS_MIN
                ? "text-muted-foreground"
                : questions.length > QUESTIONS_MAX
                  ? "text-destructive"
                  : "text-foreground",
            )}
            aria-live="polite"
          >
            {questions.length} / {QUESTIONS_MAX}
          </p>
        </div>
      </div>

      {submitError && (
        <p className="text-sm text-destructive border border-destructive/40 bg-destructive/10 rounded-lg px-3 py-2" role="alert">
          {submitError}
        </p>
      )}

      <Button
        type="submit"
        size="lg"
        disabled={disabled || isSubmitting}
        className="bg-brand-600 hover:bg-brand-700"
      >
        {isSubmitting ? "신청서 제출 중…" : "신청서 제출"}
      </Button>

      <p
        data-element="form-footer-notice"
        className="text-2xs text-muted-foreground break-keep-all leading-relaxed"
      >
        ⓘ 제출 시 선택한 시간으로 예약이 즉시 확정됩니다. 24시간 전까지 <a href="/consulting/my-bookings" className="underline">내 예약</a>에서 취소 가능합니다.
      </p>
    </form>
  );
}
