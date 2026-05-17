"use client";

/**
 * DepartmentCard — 학과 검색 결과 카드
 *
 * P-001 핵심: **합격률 미리보기 절대 노출 X**.
 * 카드는 정형 정보(대학명·학과명·캠퍼스·트랙 종류)만 표시.
 * 합격률은 상세 페이지(/admissions/[uid]/[did])의 분석 카드(Gated wrapper)에서만.
 *
 * 표본 부족 학과는 회색 톤 + Clock 아이콘으로 시각 구분 — Gated.InsufficientSampleCard 와 일관.
 *
 * 회귀 테스트(p-001-policy.test.tsx):
 *   - 결제 키워드 0개
 *   - 합격률·확률 텍스트 0개 ("%", "확률", "합격" 단독 0개)
 *   - sampleSufficient=false 카드의 시각 토큰이 sufficient=true 와 다름
 */

import * as React from "react";
import Link from "next/link";
import { Clock, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
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
  /** sample-gate 판정 결과 — false 면 회색 톤 + 안내 */
  sampleSufficient: boolean;
  /** 해당 학과가 운영 중인 전형 종류 (admissions/{year}.availableTrackKinds) */
  availableTracks?: AdmissionTrackKind[];
  className?: string;
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

  return (
    <Link
      href={href}
      data-component="department-card"
      data-sample-sufficient={sampleSufficient}
      data-university-id={university.id}
      data-department-id={department.id}
      className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-lg"
    >
      <Card
        className={cn(
          "h-full transition hover:shadow-md",
          sampleSufficient
            ? "border-border bg-card hover:border-brand-300"
            : "border-dashed border-zinc-300 bg-zinc-50/60 dark:border-zinc-700 dark:bg-zinc-900/40",
          className,
        )}
      >
        <CardContent className="flex flex-col gap-3 py-5">
          {/* 대학·캠퍼스 */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Building2 aria-hidden className="h-3.5 w-3.5" />
            <span className="font-medium">{university.shortName ?? university.n}</span>
            {campusLabel && (
              <>
                <span aria-hidden>·</span>
                <span>{campusLabel}</span>
              </>
            )}
          </div>

          {/* 학과명 */}
          <h3
            className={cn(
              "text-base font-semibold",
              !sampleSufficient && "text-muted-foreground",
            )}
          >
            {department.name}
          </h3>

          {/* 트랙 뱃지 — 최대 4개. P-001: 합격률 미리보기 절대 X */}
          {availableTracks.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {availableTracks.slice(0, 4).map((kind) => (
                <AdmissionTrackBadge key={kind} kind={kind} />
              ))}
              {availableTracks.length > 4 && (
                <Badge variant="outline" className="text-xs">
                  +{availableTracks.length - 4}
                </Badge>
              )}
            </div>
          )}

          {/* 표본 부족 안내 — 합격률 표시 불가 명시.
              결제 CTA / 인터랙티브 요소 일절 없음 (P-001 옵션 B) */}
          {!sampleSufficient && (
            <div
              data-element="insufficient-notice"
              className="mt-1 flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400"
            >
              <Clock aria-hidden className="h-3 w-3" />
              <span>합격 사례 표본 누적 시 분석 표시</span>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
