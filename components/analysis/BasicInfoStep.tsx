"use client";

/**
 * BasicInfoStep — Step 1
 *
 * 학년·계열·(선택)출신 고교 입력. 국내 일반고 기준 폼이며 외국 고교 여부는
 * 묻지 않는다. 재외국민·외국인 트랙은 /admissions/jaeoegukmin 에서 별도 운영
 * 하고 서버(matching-kr)에서도 abroadHighSchool='no' 만 허용한다(P-013).
 */

import * as React from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HighSchoolAutocomplete } from "@/components/forms/HighSchoolAutocomplete";

export type GradeLevel = "high1" | "high2" | "high3" | "n_repeat";
export type AnalysisTrack = "humanities" | "natural" | "arts";
export type AbroadHighSchool = "yes" | "no" | null;

/** NEIS 자동완성에서 선택한 고등학교 스냅샷 (옵셔널). */
export interface HighSchoolRef {
  code: string;
  name: string;
  region: string;
}

export interface BasicInfoStepValue {
  gradeLevel: GradeLevel | null;
  track: AnalysisTrack | null;
  abroadHighSchool: AbroadHighSchool;
  /** 출신/재학 고등학교 (선택 입력) — NEIS 자동완성으로 채움. */
  highSchool: HighSchoolRef | null;
}

export const EMPTY_BASIC_INFO: BasicInfoStepValue = {
  gradeLevel: null,
  track: null,
  // 국내 일반고 기준 폼 — 외국 고교 여부는 묻지 않고 'no' 고정(서버 P-013 가드도 'no'만 허용).
  abroadHighSchool: "no",
  highSchool: null,
};

export interface BasicInfoStepProps {
  value: BasicInfoStepValue;
  onChange: (next: BasicInfoStepValue) => void;
}

export function isBasicInfoValid(v: BasicInfoStepValue): boolean {
  return v.gradeLevel != null && v.track != null;
}

export function BasicInfoStep({ value, onChange }: BasicInfoStepProps): React.ReactElement {
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

      {/* 출신/재학 고등학교 — NEIS 자동완성 (선택 입력) */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="basic-highschool" className="text-sm font-medium">
          출신/재학 고등학교 <span className="text-muted-foreground font-normal text-xs">(선택)</span>
        </Label>
        <HighSchoolAutocomplete
          inputId="basic-highschool"
          ariaLabel="출신 고등학교"
          value={value.highSchool?.name ?? ""}
          onSelect={(s) =>
            onChange({
              ...value,
              highSchool: { code: s.code, name: s.name, region: s.region },
            })
          }
          onChange={(text) => {
            // 자유 입력 도중엔 highSchool 객체 제거 — 미선택 상태 표시.
            if (value.highSchool && text !== value.highSchool.name) {
              onChange({ ...value, highSchool: null });
            }
          }}
        />
        <p className="text-2xs text-muted-foreground">
          학교 검색 데이터는 NEIS 공공데이터를 사용해요. 비워두셔도 분석에는 영향 없습니다.
        </p>
      </div>
    </div>
  );
}
