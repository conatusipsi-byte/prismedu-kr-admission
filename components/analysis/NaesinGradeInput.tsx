"use client";

/**
 * NaesinGradeInput — 학년·학기별 내신 등급 입력 그리드
 *
 * 한국 내신은 단위수 가중평균 등급(1.00~9.00, 낮을수록 우수). 학년·학기별로 입력해
 * `SchoolRecord.gpaByTerm` 형태로 부모에 전달.
 *
 * 진로선택은 절대평가(A/B/C)이므로 `absoluteGpa`를 별도 입력. 여기선 raw A/B/C
 * 분포까지는 받지 않고 환산값만 받는다 — 상세 분포는 결과 산출 시 모집요강의
 * NaesinConversionTable로 재환산되므로 상위 입력에선 사용자가 본인 계산값을 그대로
 * 전달하는 것이 가장 정확.
 */

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SchoolYear, Semester } from "@/types/admission";

export interface NaesinTermEntry {
  schoolYear: SchoolYear;
  semester: Semester;
  /** 공통/일반선택 — 1.00~9.00 */
  relativeGpa: number | null;
  /** 진로선택 환산 — 1.00~9.00 (선택) */
  absoluteGpa: number | null;
  /** 단위수 합 — 가중평균 계산용 */
  totalUnits: number | null;
}

export interface NaesinGradeInputProps {
  value: NaesinTermEntry[];
  onChange: (next: NaesinTermEntry[]) => void;
  /** 학년 범위 — Step 1의 학년에 따라 부모가 좁힘 (e.g., 고1은 1학년만) */
  visibleYears: SchoolYear[];
}

const ALL_TERMS: Array<{ schoolYear: SchoolYear; semester: Semester; label: string }> = [
  { schoolYear: 1, semester: 1, label: "1학년 1학기" },
  { schoolYear: 1, semester: 2, label: "1학년 2학기" },
  { schoolYear: 2, semester: 1, label: "2학년 1학기" },
  { schoolYear: 2, semester: 2, label: "2학년 2학기" },
  { schoolYear: 3, semester: 1, label: "3학년 1학기" },
  { schoolYear: 3, semester: 2, label: "3학년 2학기" },
];

function findEntry(value: NaesinTermEntry[], y: SchoolYear, s: Semester): NaesinTermEntry | undefined {
  return value.find((e) => e.schoolYear === y && e.semester === s);
}

function parseGpaInput(raw: string): number | null {
  if (raw === "") return null;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n) || n < 1 || n > 9) return null;
  return n;
}

function parseUnitsInput(raw: string): number | null {
  if (raw === "") return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return n;
}

export function NaesinGradeInput({
  value,
  onChange,
  visibleYears,
}: NaesinGradeInputProps): React.ReactElement {
  const visibleTerms = ALL_TERMS.filter((t) => visibleYears.includes(t.schoolYear));

  function update(
    y: SchoolYear,
    s: Semester,
    field: "relativeGpa" | "absoluteGpa" | "totalUnits",
    next: number | null,
  ) {
    const existing = findEntry(value, y, s);
    const replaced: NaesinTermEntry = existing
      ? { ...existing, [field]: next }
      : {
          schoolYear: y,
          semester: s,
          relativeGpa: field === "relativeGpa" ? next : null,
          absoluteGpa: field === "absoluteGpa" ? next : null,
          totalUnits: field === "totalUnits" ? next : null,
        };
    const others = value.filter((e) => !(e.schoolYear === y && e.semester === s));
    onChange([...others, replaced]);
  }

  return (
    <div data-component="naesin-grade-input" className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        학년·학기별 내신 등급(1.00~9.00, 낮을수록 우수). 진로선택 환산값은 선택 입력.
      </p>
      <div className="flex flex-col gap-3">
        {visibleTerms.map((t) => {
          const entry = findEntry(value, t.schoolYear, t.semester);
          const idBase = `naesin-${t.schoolYear}-${t.semester}`;
          return (
            <div
              key={`${t.schoolYear}-${t.semester}`}
              data-term={`${t.schoolYear}-${t.semester}`}
              className="rounded-lg border p-3"
            >
              <div className="mb-2 text-sm font-medium">{t.label}</div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`${idBase}-rel`} className="text-xs">
                    공통/일반선택 등급
                  </Label>
                  <Input
                    id={`${idBase}-rel`}
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min={1}
                    max={9}
                    placeholder="예: 2.34"
                    value={entry?.relativeGpa ?? ""}
                    onChange={(e) =>
                      update(t.schoolYear, t.semester, "relativeGpa", parseGpaInput(e.target.value))
                    }
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`${idBase}-abs`} className="text-xs">
                    진로선택 환산 (선택)
                  </Label>
                  <Input
                    id={`${idBase}-abs`}
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min={1}
                    max={9}
                    placeholder="예: 1.80"
                    value={entry?.absoluteGpa ?? ""}
                    onChange={(e) =>
                      update(t.schoolYear, t.semester, "absoluteGpa", parseGpaInput(e.target.value))
                    }
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`${idBase}-units`} className="text-xs">
                    단위수 합
                  </Label>
                  <Input
                    id={`${idBase}-units`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={100}
                    placeholder="예: 30"
                    value={entry?.totalUnits ?? ""}
                    onChange={(e) =>
                      update(t.schoolYear, t.semester, "totalUnits", parseUnitsInput(e.target.value))
                    }
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
