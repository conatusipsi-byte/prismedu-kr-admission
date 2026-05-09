"use client";

/**
 * ExtraActivityInput — 생기부 비교과 정량 입력
 *
 * 자소서 영역은 의도적으로 제외 (24학번부터 자소서 폐지, P-013 도메인 결정 §자소서).
 * 본 컴포넌트가 변경되어 자소서 입력 필드가 추가되면 회귀 테스트가 깨진다 —
 * components/analysis/__tests__/analysis-form-policy.test.tsx 의 "자소서 키워드 0개"
 * assertion이 게이트.
 *
 * 사용자가 정확한 시간·횟수를 모르면 비워둘 수 있게 모든 필드 optional. 학종 합격
 * 추정에선 NULL을 "데이터 없음"으로 처리해 페널티 미적용 (정직성 원칙 P-002).
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
import type { SchoolActivity } from "@/types/admission";

export interface ExtraActivityInputValue {
  autonomous: { hours: number | null; participationCount: number | null };
  club: { hours: number | null; participationCount: number | null; yearsPersistent: number | null };
  volunteering: { hours: number | null; participationCount: number | null };
  career: {
    hours: number | null;
    participationCount: number | null;
    majorAlignment: 1 | 2 | 3 | 4 | 5 | null;
  };
  detailedAbility: {
    entriesCount: number | null;
    majorRelatedCount: number | null;
    qualityScore: 1 | 2 | 3 | 4 | 5 | null;
  };
  behavioralCharacteristics: { qualityScore: 1 | 2 | 3 | 4 | 5 | null };
  schoolType: "general" | "autonomous" | "special_purpose" | "specialized" | null;
}

export const EMPTY_EXTRA_ACTIVITY: ExtraActivityInputValue = {
  autonomous: { hours: null, participationCount: null },
  club: { hours: null, participationCount: null, yearsPersistent: null },
  volunteering: { hours: null, participationCount: null },
  career: { hours: null, participationCount: null, majorAlignment: null },
  detailedAbility: { entriesCount: null, majorRelatedCount: null, qualityScore: null },
  behavioralCharacteristics: { qualityScore: null },
  schoolType: null,
};

export interface ExtraActivityInputProps {
  value: ExtraActivityInputValue;
  onChange: (next: ExtraActivityInputValue) => void;
}

function parseInt0(raw: string): number | null {
  if (raw === "") return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function parseScore15(raw: string): 1 | 2 | 3 | 4 | 5 | null {
  if (raw === "") return null;
  const n = Number.parseInt(raw, 10);
  if (n < 1 || n > 5) return null;
  return n as 1 | 2 | 3 | 4 | 5;
}

export function ExtraActivityInput({
  value,
  onChange,
}: ExtraActivityInputProps): React.ReactElement {
  function patch<K extends keyof ExtraActivityInputValue>(
    key: K,
    sub: Partial<ExtraActivityInputValue[K]>,
  ) {
    const cur = value[key];
    onChange({ ...value, [key]: { ...(cur as object), ...sub } });
  }

  return (
    <div data-component="extra-activity-input" className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        모르거나 측정 어려운 항목은 비워두세요. 비어있는 신호는 "데이터 없음"으로
        처리되며 점수에 페널티 없습니다.
      </p>

      {/* 출신학교 유형 */}
      <fieldset data-area="school-type" className="rounded-lg border p-3">
        <legend className="px-1 text-sm font-semibold">출신학교 유형</legend>
        <Select
          value={value.schoolType ?? ""}
          onValueChange={(v) =>
            onChange({
              ...value,
              schoolType:
                (v as "general" | "autonomous" | "special_purpose" | "specialized") || null,
            })
          }
        >
          <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="general">일반고</SelectItem>
            <SelectItem value="autonomous">자율고 (자공고/자사고)</SelectItem>
            <SelectItem value="special_purpose">특수목적고 (외고/과고/예고/체고/국제고/마이스터고)</SelectItem>
            <SelectItem value="specialized">특성화고</SelectItem>
          </SelectContent>
        </Select>
      </fieldset>

      {/* 자율활동 */}
      <fieldset data-area="autonomous" className="rounded-lg border p-3">
        <legend className="px-1 text-sm font-semibold">자율활동</legend>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="ext-aut-hours" className="text-xs">누적 시간</Label>
            <Input
              id="ext-aut-hours" type="number" inputMode="numeric" min={0}
              value={value.autonomous.hours ?? ""}
              onChange={(e) => patch("autonomous", { hours: parseInt0(e.target.value) })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="ext-aut-cnt" className="text-xs">참여 횟수</Label>
            <Input
              id="ext-aut-cnt" type="number" inputMode="numeric" min={0}
              value={value.autonomous.participationCount ?? ""}
              onChange={(e) => patch("autonomous", { participationCount: parseInt0(e.target.value) })}
            />
          </div>
        </div>
      </fieldset>

      {/* 동아리 */}
      <fieldset data-area="club" className="rounded-lg border p-3">
        <legend className="px-1 text-sm font-semibold">동아리</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="ext-club-hours" className="text-xs">누적 시간</Label>
            <Input
              id="ext-club-hours" type="number" inputMode="numeric" min={0}
              value={value.club.hours ?? ""}
              onChange={(e) => patch("club", { hours: parseInt0(e.target.value) })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="ext-club-cnt" className="text-xs">참여 횟수</Label>
            <Input
              id="ext-club-cnt" type="number" inputMode="numeric" min={0}
              value={value.club.participationCount ?? ""}
              onChange={(e) => patch("club", { participationCount: parseInt0(e.target.value) })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="ext-club-years" className="text-xs">지속 학년 수</Label>
            <Input
              id="ext-club-years" type="number" inputMode="numeric" min={0} max={3}
              value={value.club.yearsPersistent ?? ""}
              onChange={(e) => patch("club", { yearsPersistent: parseInt0(e.target.value) })}
            />
          </div>
        </div>
      </fieldset>

      {/* 봉사 */}
      <fieldset data-area="volunteering" className="rounded-lg border p-3">
        <legend className="px-1 text-sm font-semibold">봉사활동 (학교 주관)</legend>
        <p className="mb-2 text-xs text-muted-foreground">
          24학번부터 개인 봉사는 미반영, 학교 주관 봉사만 인정.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="ext-vol-hours" className="text-xs">누적 시간</Label>
            <Input
              id="ext-vol-hours" type="number" inputMode="numeric" min={0}
              value={value.volunteering.hours ?? ""}
              onChange={(e) => patch("volunteering", { hours: parseInt0(e.target.value) })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="ext-vol-cnt" className="text-xs">참여 횟수</Label>
            <Input
              id="ext-vol-cnt" type="number" inputMode="numeric" min={0}
              value={value.volunteering.participationCount ?? ""}
              onChange={(e) =>
                patch("volunteering", { participationCount: parseInt0(e.target.value) })
              }
            />
          </div>
        </div>
      </fieldset>

      {/* 진로 */}
      <fieldset data-area="career" className="rounded-lg border p-3">
        <legend className="px-1 text-sm font-semibold">진로활동</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="ext-car-hours" className="text-xs">누적 시간</Label>
            <Input
              id="ext-car-hours" type="number" inputMode="numeric" min={0}
              value={value.career.hours ?? ""}
              onChange={(e) => patch("career", { hours: parseInt0(e.target.value) })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="ext-car-cnt" className="text-xs">참여 횟수</Label>
            <Input
              id="ext-car-cnt" type="number" inputMode="numeric" min={0}
              value={value.career.participationCount ?? ""}
              onChange={(e) =>
                patch("career", { participationCount: parseInt0(e.target.value) })
              }
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="ext-car-align" className="text-xs">전공 일치도 (1~5)</Label>
            <Input
              id="ext-car-align" type="number" inputMode="numeric" min={1} max={5}
              value={value.career.majorAlignment ?? ""}
              onChange={(e) =>
                patch("career", { majorAlignment: parseScore15(e.target.value) })
              }
            />
          </div>
        </div>
      </fieldset>

      {/* 세특 */}
      <fieldset data-area="detailedAbility" className="rounded-lg border p-3">
        <legend className="px-1 text-sm font-semibold">세부능력 및 특기사항 (세특)</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="ext-da-cnt" className="text-xs">기재 항목 수 (학기 합)</Label>
            <Input
              id="ext-da-cnt" type="number" inputMode="numeric" min={0}
              value={value.detailedAbility.entriesCount ?? ""}
              onChange={(e) =>
                patch("detailedAbility", { entriesCount: parseInt0(e.target.value) })
              }
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="ext-da-major" className="text-xs">진로 관련 항목 수</Label>
            <Input
              id="ext-da-major" type="number" inputMode="numeric" min={0}
              value={value.detailedAbility.majorRelatedCount ?? ""}
              onChange={(e) =>
                patch("detailedAbility", { majorRelatedCount: parseInt0(e.target.value) })
              }
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="ext-da-q" className="text-xs">자가평가 (1~5)</Label>
            <Input
              id="ext-da-q" type="number" inputMode="numeric" min={1} max={5}
              value={value.detailedAbility.qualityScore ?? ""}
              onChange={(e) =>
                patch("detailedAbility", { qualityScore: parseScore15(e.target.value) })
              }
            />
          </div>
        </div>
      </fieldset>

      {/* 행특 */}
      <fieldset data-area="behavioralCharacteristics" className="rounded-lg border p-3">
        <legend className="px-1 text-sm font-semibold">행동특성 및 종합의견 (행특)</legend>
        <div className="flex flex-col gap-1">
          <Label htmlFor="ext-bc-q" className="text-xs">자가평가 (1~5)</Label>
          <Input
            id="ext-bc-q" type="number" inputMode="numeric" min={1} max={5}
            value={value.behavioralCharacteristics.qualityScore ?? ""}
            onChange={(e) =>
              patch("behavioralCharacteristics", { qualityScore: parseScore15(e.target.value) })
            }
          />
        </div>
      </fieldset>
    </div>
  );
}

/**
 * ExtraActivityInputValue → SchoolActivity (Firestore 저장용) 변환.
 * 모든 필드가 비어있으면 undefined.
 */
export function toSchoolActivity(v: ExtraActivityInputValue): SchoolActivity | undefined {
  const has =
    v.autonomous.hours != null ||
    v.club.hours != null ||
    v.volunteering.hours != null ||
    v.career.hours != null ||
    v.detailedAbility.entriesCount != null ||
    v.behavioralCharacteristics.qualityScore != null;
  if (!has) return undefined;

  const out: SchoolActivity = {};
  if (v.autonomous.hours != null && v.autonomous.participationCount != null) {
    out.autonomous = {
      hours: v.autonomous.hours,
      participationCount: v.autonomous.participationCount,
    };
  }
  if (v.club.hours != null && v.club.participationCount != null) {
    out.club = {
      hours: v.club.hours,
      participationCount: v.club.participationCount,
      yearsPersistent: v.club.yearsPersistent ?? 0,
    };
  }
  if (v.volunteering.hours != null && v.volunteering.participationCount != null) {
    out.volunteering = {
      hours: v.volunteering.hours,
      participationCount: v.volunteering.participationCount,
    };
  }
  if (v.career.hours != null && v.career.participationCount != null && v.career.majorAlignment != null) {
    out.career = {
      hours: v.career.hours,
      participationCount: v.career.participationCount,
      majorAlignment: v.career.majorAlignment,
    };
  }
  if (v.detailedAbility.entriesCount != null) {
    out.detailedAbility = {
      entriesCount: v.detailedAbility.entriesCount,
      majorRelatedCount: v.detailedAbility.majorRelatedCount ?? 0,
      qualityScore: v.detailedAbility.qualityScore ?? undefined,
    };
  }
  if (v.behavioralCharacteristics.qualityScore != null) {
    out.behavioralCharacteristics = {
      qualityScore: v.behavioralCharacteristics.qualityScore,
    };
  }
  return out;
}
