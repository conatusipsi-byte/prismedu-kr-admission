"use client";

/**
 * JaeoegukminTrackList — 자격 충족 시 추천 대학 목록
 *
 * mock-jaeoegukmin.ts 의 데이터로 5개 대학 카드 노출. 각 카드는 모집요강 외부 링크.
 * P-002 정직성: 합격률 미리보기 X (모집요강 링크만).
 */

import Link from "next/link";
import { ExternalLink, Building2, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  filterUniversitiesByEligibility,
  type JaeoegukminUniversitySummary,
} from "@/lib/admission/mock-jaeoegukmin";
import type { EligibilityType } from "@/lib/admission/jaeoegukmin-eligibility";

export interface JaeoegukminTrackListProps {
  type: EligibilityType;
  className?: string;
}

const TRACK_TYPE_LABEL: Record<JaeoegukminUniversitySummary["trackTypes"][number], string> = {
  jaeoegukmin: "재외국민",
  foreigner: "외국인",
  foreign_education_12yr: "12년 외국교육",
};

export function JaeoegukminTrackList({ type, className }: JaeoegukminTrackListProps) {
  const universities = filterUniversitiesByEligibility(type);

  if (universities.length === 0) {
    return (
      <div data-component="jaeoegukmin-track-list" data-state="empty" className={className}>
        <p className="py-8 text-center text-sm text-muted-foreground">
          현재 자격에 해당하는 추천 대학이 없습니다. 일반 전형 학과 검색을 활용해보세요.
        </p>
      </div>
    );
  }

  return (
    <div
      data-component="jaeoegukmin-track-list"
      data-state="ok"
      className={cn("flex flex-col gap-3", className)}
    >
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">추천 대학</h2>
        <span className="text-xs text-muted-foreground">
          {universities.length}개 대학 (Mock 데이터)
        </span>
      </div>

      {/* TODO: ETL 실 데이터로 교체 — 현재는 mock-jaeoegukmin.ts 의 5개 대학 */}
      <p className="rounded-md border border-amber-200 bg-amber-50/40 p-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
        ⚠️ 본 목록은 임시 샘플입니다. 실제 운영 학교는 ETL 데이터 적용 후 갱신됩니다.
        모집요강 정보도 학교 입학처 홈페이지에서 직접 확인하세요.
      </p>

      <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {universities.map((u) => (
          <li key={u.universityId}>
            <Card
              data-element="university-card"
              data-university-id={u.universityId}
              className="h-full transition hover:border-purple-300 hover:shadow-md"
            >
              <CardContent className="flex flex-col gap-3 py-5">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Building2 aria-hidden className="h-3.5 w-3.5" />
                  <span className="font-medium text-foreground">{u.shortName}</span>
                  <span aria-hidden>·</span>
                  <MapPin aria-hidden className="h-3 w-3" />
                  <span>{u.region}</span>
                </div>

                <h3 className="text-base font-semibold">{u.name}</h3>

                <div className="flex flex-wrap gap-1.5">
                  {u.trackTypes.map((t) => (
                    <Badge
                      key={t}
                      variant="outline"
                      className="border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-300"
                    >
                      {TRACK_TYPE_LABEL[t]}
                    </Badge>
                  ))}
                  {u.standardizedTestRequired && (
                    <Badge variant="outline" className="text-xs">
                      어학 시험
                    </Badge>
                  )}
                </div>

                <p className="text-xs leading-relaxed text-muted-foreground">
                  {u.eligibilitySummary}
                </p>

                <div className="border-t pt-3">
                  <Link
                    href={u.admissionGuideUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-purple-600 hover:text-purple-700 hover:underline"
                  >
                    입학처 모집요강
                    <ExternalLink aria-hidden className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
