"use client";

/**
 * DepartmentCard — 학과 검색 결과 카드 (Stage 6 재설계).
 *
 * P-001 핵심: 합격률 미리보기 절대 노출 X.
 * - 상단: 대학 monogram(2글자) + 대학·캠퍼스
 * - 학과명 큰 글씨 (text-lg)
 * - 전형 배지 row (AdmissionTrackBadge 컴포넌트가 색상 분기)
 * - hover: lift + brand-300 border + soft shadow
 * - sample insufficient: dashed border + 회색 톤 + Clock 안내
 *
 * 회귀 테스트(p-001-policy.test.tsx) 키워드 차단 정책 변동 없음.
 */

import * as React from "react";
import Link from "next/link";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { AdmissionTrackBadge } from "./AdmissionTrackBadge";
import type {
  AdmissionTrackKind,
  Department,
  University,
} from "@/types/admission";

export interface DepartmentCardProps {
  department: Department;
  university: University;
  sampleSufficient: boolean;
  availableTracks?: AdmissionTrackKind[];
  className?: string;
}

/** 한글/영문 대학명에서 monogram 2자 — "고려대" → "고려", "POSTECH" → "PO" */
function monogramOf(name: string): string {
  const trimmed = name.replace(/\s+/g, "");
  return trimmed.slice(0, 2).toUpperCase();
}

export function DepartmentCard({
  department,
  university,
  sampleSufficient,
  availableTracks = [],
  className,
}: DepartmentCardProps): React.ReactElement {
  const href = `/admissions/${university.id}/${department.id}`;
  const campus = university.campuses.find((c) => c.id === department.campusId);
  const campusLabel = campus?.isMain ? null : campus?.name;
  const uniName = university.shortName ?? university.n;

  return (
    <Link
      href={href}
      data-component="department-card"
      data-sample-sufficient={sampleSufficient}
      data-university-id={university.id}
      data-department-id={department.id}
      className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
    >
      <article
        className={cn(
          "group h-full rounded-2xl border p-5 transition-all duration-200 ease-toss",
          sampleSufficient
            ? "border-border bg-card hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md dark:hover:border-brand-700"
            : "border-dashed border-ink-300/70 bg-ink-50/40 dark:border-ink-700 dark:bg-ink-900/40",
          className,
        )}
      >
        {/* Top — monogram + 대학·캠퍼스 */}
        <div className="mb-4 flex items-center gap-3">
          <span
            aria-hidden
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-2xs font-bold font-numeric tabular-nums transition-colors",
              sampleSufficient
                ? "bg-gradient-to-br from-brand-50 to-iris/10 text-brand-700 ring-1 ring-brand-200/60 group-hover:from-brand-100 group-hover:to-iris/20 dark:from-brand-950/60 dark:to-iris/15 dark:text-brand-300 dark:ring-brand-800/50"
                : "bg-ink-100 text-ink-500 ring-1 ring-ink-200 dark:bg-ink-800 dark:text-ink-400 dark:ring-ink-700",
            )}
          >
            {monogramOf(uniName)}
          </span>
          <div className="flex flex-col leading-tight min-w-0">
            <span className={cn("text-xs font-semibold", sampleSufficient ? "text-foreground" : "text-muted-foreground")}>
              {uniName}
            </span>
            {campusLabel && (
              <span className="text-2xs text-muted-foreground truncate">{campusLabel} 캠퍼스</span>
            )}
          </div>
        </div>

        {/* 학과명 */}
        <h3
          className={cn(
            "text-lg font-bold leading-snug break-keep-all tracking-tight mb-3",
            sampleSufficient ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {department.name}
        </h3>

        {/* 트랙 뱃지 — 최대 4개 */}
        {availableTracks.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {availableTracks.slice(0, 4).map((kind) => (
              <AdmissionTrackBadge key={kind} kind={kind} />
            ))}
            {availableTracks.length > 4 && (
              <Badge variant="outline" size="sm">
                +{availableTracks.length - 4}
              </Badge>
            )}
          </div>
        )}

        {/* 표본 부족 — 합격률 표시 불가 */}
        {!sampleSufficient && (
          <div
            data-element="insufficient-notice"
            className="mt-4 flex items-center gap-1.5 text-2xs text-muted-foreground"
          >
            <Clock aria-hidden className="h-3 w-3" />
            <span>합격 사례 표본 누적 시 분석 표시</span>
          </div>
        )}
      </article>
    </Link>
  );
}
