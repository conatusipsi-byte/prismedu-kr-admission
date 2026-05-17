/**
 * AdmissionDetailHero — 학과 상세 페이지 상단 영역 (Server Component)
 *
 * 표시: 대학명·학과명·캠퍼스 + 분류 뱃지 + 가용 트랙 뱃지 N개
 */

import { Building2, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { AdmissionTrackBadge } from "./AdmissionTrackBadge";
import {
  TRACK_LABELS,
  UNIVERSITY_CATEGORY_LABELS,
} from "@/lib/admission/labels";
import type {
  AdmissionTrackKind,
  Department,
  University,
} from "@/types/admission";

export interface AdmissionDetailHeroProps {
  university: University;
  department: Department;
  /** admissions/{year}.availableTrackKinds — 가용 트랙 뱃지로 노출 */
  availableTracks: AdmissionTrackKind[];
  /** 학년도 — Hero 우측에 작게 표시 */
  year: number;
  className?: string;
}

export function AdmissionDetailHero({
  university,
  department,
  availableTracks,
  year,
  className,
}: AdmissionDetailHeroProps) {
  const campus = university.campuses.find((c) => c.id === department.campusId);

  return (
    <header
      data-component="admission-detail-hero"
      className={cn("flex flex-col gap-3 border-b py-6", className)}
    >
      {/* 대학·캠퍼스·연도 */}
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Building2 aria-hidden className="h-4 w-4" />
        <span className="font-medium text-foreground">{university.n}</span>
        {campus && !campus.isMain && (
          <>
            <span aria-hidden>·</span>
            <MapPin aria-hidden className="h-3.5 w-3.5" />
            <span>{campus.name}</span>
          </>
        )}
        <span aria-hidden className="ml-auto">·</span>
        <Badge variant="outline" className="text-xs">
          {year}학년도
        </Badge>
      </div>

      {/* 학과명 */}
      <h1
        data-element="department-name"
        className="text-2xl font-bold md:text-3xl"
      >
        {department.name}
      </h1>

      {/* 분류 + 트랙 뱃지 */}
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">{UNIVERSITY_CATEGORY_LABELS[university.category]}</Badge>
        <Badge variant="secondary">{TRACK_LABELS[department.track]}</Badge>
        {department.isProfessional && (
          <Badge variant="secondary" className="bg-brand-50 text-brand-700">
            전문 자격
          </Badge>
        )}
        {availableTracks.length > 0 && (
          <span className="ml-2 inline-flex flex-wrap gap-1.5">
            {availableTracks.map((kind) => (
              <AdmissionTrackBadge key={kind} kind={kind} />
            ))}
          </span>
        )}
      </div>

      {/* 모집인원 — 정형 정보 (P-001 무료 노출) */}
      <p className="text-sm text-muted-foreground">
        총 모집인원 <span className="font-semibold text-foreground">{department.totalQuota}명</span>
        {department.unitType === "broadcast" && (
          <span className="ml-2 text-xs">(광역모집 — 입학 후 학과 결정)</span>
        )}
      </p>
    </header>
  );
}
