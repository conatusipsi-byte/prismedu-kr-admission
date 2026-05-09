"use client";

/**
 * CsatScoreInput — 수능/모의 영역별 점수 입력
 *
 * 표준점수·백분위·등급 동시 보유 (대학마다 반영 종류 다름 — types/admission.ts).
 * 영어·한국사는 절대평가 → 등급만. 탐구는 1~2과목.
 *
 * 본 컴포넌트는 입력만 담당. 응시영역기준(B1) 검증은 RequiredAreasValidator가
 * 분리 처리 — 폼 단계에선 학과 미정 상태이므로 입력 자체엔 자격 차단을 걸지 않는다.
 */

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CsatScore, Grade } from "@/types/admission";

export interface CsatScoreInputValue {
  /** true = 본 수능, false = 모평/학평 */
  actual: boolean;
  korean: {
    standard: number | null;
    percentile: number | null;
    grade: Grade | null;
    course: "speech_writing" | "language_media" | null;
  };
  math: {
    standard: number | null;
    percentile: number | null;
    grade: Grade | null;
    course: "calculus" | "probability_statistics" | "geometry" | null;
  };
  english: { grade: Grade | null };
  history: { grade: Grade | null };
  investigation: Array<{
    course: string;
    type: "social" | "science" | "vocational";
    standard: number | null;
    percentile: number | null;
    grade: Grade | null;
  }>;
}

export interface CsatScoreInputProps {
  value: CsatScoreInputValue;
  onChange: (next: CsatScoreInputValue) => void;
}

function parseStd(raw: string): number | null {
  if (raw === "") return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0 || n > 200) return null;
  return n;
}

function parsePct(raw: string): number | null {
  if (raw === "") return null;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return n;
}

function parseGrade(raw: string): Grade | null {
  if (raw === "") return null;
  const n = Number.parseInt(raw, 10);
  if (n < 1 || n > 9) return null;
  return n as Grade;
}

const GRADES: Grade[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export function CsatScoreInput({ value, onChange }: CsatScoreInputProps): React.ReactElement {
  function setKorean(patch: Partial<CsatScoreInputValue["korean"]>) {
    onChange({ ...value, korean: { ...value.korean, ...patch } });
  }
  function setMath(patch: Partial<CsatScoreInputValue["math"]>) {
    onChange({ ...value, math: { ...value.math, ...patch } });
  }
  function setEnglish(grade: Grade | null) {
    onChange({ ...value, english: { grade } });
  }
  function setHistory(grade: Grade | null) {
    onChange({ ...value, history: { grade } });
  }
  function updateInvestigation(idx: number, patch: Partial<CsatScoreInputValue["investigation"][0]>) {
    const next = value.investigation.slice();
    if (!next[idx]) {
      next[idx] = {
        course: "",
        type: "science",
        standard: null,
        percentile: null,
        grade: null,
        ...patch,
      };
    } else {
      next[idx] = { ...next[idx], ...patch };
    }
    onChange({ ...value, investigation: next });
  }

  return (
    <div data-component="csat-score-input" className="flex flex-col gap-5">
      {/* 응시 종류 */}
      <div className="flex flex-col gap-1">
        <Label className="text-xs">응시 종류</Label>
        <Select
          value={value.actual ? "actual" : "mock"}
          onValueChange={(v) => onChange({ ...value, actual: v === "actual" })}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="mock">모의평가/학평</SelectItem>
            <SelectItem value="actual">본 수능</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 국어 */}
      <fieldset data-area="korean" className="rounded-lg border p-3">
        <legend className="px-1 text-sm font-semibold">국어</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="csat-kor-course" className="text-xs">선택과목</Label>
            <Select
              value={value.korean.course ?? ""}
              onValueChange={(v) =>
                setKorean({ course: (v as "speech_writing" | "language_media") || null })
              }
            >
              <SelectTrigger id="csat-kor-course"><SelectValue placeholder="선택" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="speech_writing">화법과작문</SelectItem>
                <SelectItem value="language_media">언어와매체</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="csat-kor-std" className="text-xs">표준점수</Label>
            <Input
              id="csat-kor-std"
              type="number"
              inputMode="numeric"
              value={value.korean.standard ?? ""}
              onChange={(e) => setKorean({ standard: parseStd(e.target.value) })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="csat-kor-pct" className="text-xs">백분위</Label>
            <Input
              id="csat-kor-pct"
              type="number"
              inputMode="decimal"
              value={value.korean.percentile ?? ""}
              onChange={(e) => setKorean({ percentile: parsePct(e.target.value) })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="csat-kor-grade" className="text-xs">등급</Label>
            <Select
              value={value.korean.grade?.toString() ?? ""}
              onValueChange={(v) => setKorean({ grade: parseGrade(v) })}
            >
              <SelectTrigger id="csat-kor-grade"><SelectValue placeholder="-" /></SelectTrigger>
              <SelectContent>
                {GRADES.map((g) => <SelectItem key={g} value={g.toString()}>{g}등급</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </fieldset>

      {/* 수학 */}
      <fieldset data-area="math" className="rounded-lg border p-3">
        <legend className="px-1 text-sm font-semibold">수학</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="csat-math-course" className="text-xs">선택과목</Label>
            <Select
              value={value.math.course ?? ""}
              onValueChange={(v) =>
                setMath({
                  course:
                    (v as "calculus" | "probability_statistics" | "geometry") || null,
                })
              }
            >
              <SelectTrigger id="csat-math-course"><SelectValue placeholder="선택" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="probability_statistics">확률과통계</SelectItem>
                <SelectItem value="calculus">미적분</SelectItem>
                <SelectItem value="geometry">기하</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="csat-math-std" className="text-xs">표준점수</Label>
            <Input
              id="csat-math-std"
              type="number"
              inputMode="numeric"
              value={value.math.standard ?? ""}
              onChange={(e) => setMath({ standard: parseStd(e.target.value) })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="csat-math-pct" className="text-xs">백분위</Label>
            <Input
              id="csat-math-pct"
              type="number"
              inputMode="decimal"
              value={value.math.percentile ?? ""}
              onChange={(e) => setMath({ percentile: parsePct(e.target.value) })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="csat-math-grade" className="text-xs">등급</Label>
            <Select
              value={value.math.grade?.toString() ?? ""}
              onValueChange={(v) => setMath({ grade: parseGrade(v) })}
            >
              <SelectTrigger id="csat-math-grade"><SelectValue placeholder="-" /></SelectTrigger>
              <SelectContent>
                {GRADES.map((g) => <SelectItem key={g} value={g.toString()}>{g}등급</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </fieldset>

      {/* 영어 + 한국사 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <fieldset data-area="english" className="rounded-lg border p-3">
          <legend className="px-1 text-sm font-semibold">영어 (절대평가)</legend>
          <Select
            value={value.english.grade?.toString() ?? ""}
            onValueChange={(v) => setEnglish(parseGrade(v))}
          >
            <SelectTrigger><SelectValue placeholder="등급 선택" /></SelectTrigger>
            <SelectContent>
              {GRADES.map((g) => <SelectItem key={g} value={g.toString()}>{g}등급</SelectItem>)}
            </SelectContent>
          </Select>
        </fieldset>
        <fieldset data-area="history" className="rounded-lg border p-3">
          <legend className="px-1 text-sm font-semibold">한국사 (절대평가)</legend>
          <Select
            value={value.history.grade?.toString() ?? ""}
            onValueChange={(v) => setHistory(parseGrade(v))}
          >
            <SelectTrigger><SelectValue placeholder="등급 선택" /></SelectTrigger>
            <SelectContent>
              {GRADES.map((g) => <SelectItem key={g} value={g.toString()}>{g}등급</SelectItem>)}
            </SelectContent>
          </Select>
        </fieldset>
      </div>

      {/* 탐구 (2과목) */}
      <fieldset data-area="investigation" className="rounded-lg border p-3">
        <legend className="px-1 text-sm font-semibold">탐구 (최대 2과목)</legend>
        {[0, 1].map((idx) => {
          const e = value.investigation[idx];
          return (
            <div
              key={idx}
              data-investigation-slot={idx}
              className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-5"
            >
              <div className="flex flex-col gap-1">
                <Label htmlFor={`csat-inv-type-${idx}`} className="text-xs">계열</Label>
                <Select
                  value={e?.type ?? ""}
                  onValueChange={(v) =>
                    updateInvestigation(idx, { type: v as "social" | "science" | "vocational" })
                  }
                >
                  <SelectTrigger id={`csat-inv-type-${idx}`}><SelectValue placeholder="-" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="social">사회탐구</SelectItem>
                    <SelectItem value="science">과학탐구</SelectItem>
                    <SelectItem value="vocational">직업탐구</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`csat-inv-course-${idx}`} className="text-xs">과목명</Label>
                <Input
                  id={`csat-inv-course-${idx}`}
                  placeholder="예: 물리학I"
                  value={e?.course ?? ""}
                  onChange={(ev) => updateInvestigation(idx, { course: ev.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`csat-inv-std-${idx}`} className="text-xs">표준점수</Label>
                <Input
                  id={`csat-inv-std-${idx}`}
                  type="number"
                  inputMode="numeric"
                  value={e?.standard ?? ""}
                  onChange={(ev) => updateInvestigation(idx, { standard: parseStd(ev.target.value) })}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`csat-inv-pct-${idx}`} className="text-xs">백분위</Label>
                <Input
                  id={`csat-inv-pct-${idx}`}
                  type="number"
                  inputMode="decimal"
                  value={e?.percentile ?? ""}
                  onChange={(ev) => updateInvestigation(idx, { percentile: parsePct(ev.target.value) })}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`csat-inv-grade-${idx}`} className="text-xs">등급</Label>
                <Select
                  value={e?.grade?.toString() ?? ""}
                  onValueChange={(v) => updateInvestigation(idx, { grade: parseGrade(v) })}
                >
                  <SelectTrigger id={`csat-inv-grade-${idx}`}><SelectValue placeholder="-" /></SelectTrigger>
                  <SelectContent>
                    {GRADES.map((g) => <SelectItem key={g} value={g.toString()}>{g}등급</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          );
        })}
      </fieldset>
    </div>
  );
}

/**
 * CsatScoreInputValue → CsatScore (Firestore 저장용) 변환.
 * null 필드는 undefined로, 등급 필수 필드가 비어있으면 undefined 반환 (저장 보류).
 */
export function toCsatScore(v: CsatScoreInputValue): CsatScore | undefined {
  if (
    v.korean.grade == null ||
    v.math.grade == null ||
    v.english.grade == null ||
    v.history.grade == null
  ) {
    return undefined;
  }
  return {
    actual: v.actual,
    takenAt: new Date().toISOString().slice(0, 10),
    korean: {
      grade: v.korean.grade,
      standard: v.korean.standard ?? undefined,
      percentile: v.korean.percentile ?? undefined,
      course: v.korean.course ?? undefined,
    },
    math: {
      grade: v.math.grade,
      standard: v.math.standard ?? undefined,
      percentile: v.math.percentile ?? undefined,
      course: v.math.course ?? undefined,
    },
    english: { grade: v.english.grade },
    history: { grade: v.history.grade },
    investigation: v.investigation
      .filter((e) => e.grade != null && e.course)
      .map((e) => ({
        grade: e.grade as Grade,
        course: e.course,
        type: e.type,
        standard: e.standard ?? undefined,
        percentile: e.percentile ?? undefined,
      })),
  };
}
