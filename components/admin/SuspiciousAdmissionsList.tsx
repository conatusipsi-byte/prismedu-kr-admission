"use client";

/**
 * SuspiciousAdmissionsList — 검수 대기 staging 테이블 (Day 10)
 *
 * 컬럼: 학교 / 트랙 후보 / 연도 / trustLevel / 등록일 / 액션(검수)
 * 행 클릭 → onSelect(entry) — 부모(EtlStatusView)가 StagingAdmissionDetailModal 열기
 *
 * 자동 필터: promoted=true 항목은 본 컴포넌트에서 절대 노출 안 함 (호출자가 보장하지만
 * 안전망으로 한 번 더 차단).
 *
 * 정직성 (P-002): suspicious 행은 rose 톤 + AlertTriangle 마커.
 */

import * as React from "react";
import { AlertTriangle, ChevronRight, Clock, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { StagingEntry } from "@/lib/admission/mock-etl-staging";

const TRUST_LABEL: Record<StagingEntry["trustLevel"], string> = {
  trusted: "신뢰",
  "trusted-fallback": "Adobe fallback",
  suspicious: "OCR 검수",
};

const TRUST_BADGE_CLASS: Record<StagingEntry["trustLevel"], string> = {
  trusted: "border-brand-300 bg-brand-50 text-brand-800 dark:border-brand-800/40 dark:bg-brand-950/20 dark:text-brand-300",
  "trusted-fallback": "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/15 dark:text-amber-300",
  suspicious: "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/15 dark:text-rose-300",
};

export interface SuspiciousAdmissionsListProps {
  items: StagingEntry[];
  onSelect: (entry: StagingEntry) => void;
  className?: string;
}

export function SuspiciousAdmissionsList({
  items,
  onSelect,
  className,
}: SuspiciousAdmissionsListProps): React.ReactElement {
  // 안전망 — promoted=true 자동 제외
  const pending = items.filter((e) => !e.promoted);

  if (pending.length === 0) {
    return (
      <div
        data-component="suspicious-admissions-list"
        data-empty="true"
        className={cn(
          "rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground",
          className,
        )}
      >
        검수 대기 항목이 없어요. PDF를 업로드하면 본 목록에 추가됩니다.
      </div>
    );
  }

  // suspicious 우선 정렬 — 운영자 관심도 순
  const sorted = [...pending].sort((a, b) => {
    if (a.trustLevel !== b.trustLevel) {
      const order = { suspicious: 0, "trusted-fallback": 1, trusted: 2 } as const;
      return order[a.trustLevel] - order[b.trustLevel];
    }
    return b.createdAtMs - a.createdAtMs;
  });

  return (
    <div data-component="suspicious-admissions-list" className={cn("flex flex-col gap-2", className)}>
      <div className="grid grid-cols-[1fr_8rem_5rem_8rem_8rem_5rem] items-center gap-2 px-3 py-2 text-2xs font-semibold text-muted-foreground">
        <span>학교 / 파일</span>
        <span>트랙 후보</span>
        <span>연도</span>
        <span>trustLevel</span>
        <span>등록일</span>
        <span></span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {sorted.map((e) => (
          <li
            key={e.id}
            data-staging-id={e.id}
            data-trust-level={e.trustLevel}
            className={cn(
              "grid grid-cols-[1fr_8rem_5rem_8rem_8rem_5rem] items-center gap-2 rounded-lg border px-3 py-2.5 text-xs transition hover:shadow-sm",
              e.trustLevel === "suspicious" && "border-rose-300 bg-rose-50/30 dark:border-rose-900/40 dark:bg-rose-950/10",
            )}
          >
            <div className="flex flex-col min-w-0">
              <span className="flex items-center gap-1.5 truncate font-medium">
                {e.trustLevel === "suspicious" && (
                  <AlertTriangle aria-hidden className="h-3 w-3 shrink-0 text-rose-600" />
                )}
                {e.universityName}
              </span>
              <span className="flex items-center gap-1 truncate text-2xs text-muted-foreground">
                <FileText aria-hidden className="h-2.5 w-2.5 shrink-0" />
                {e.sourceFilename}
              </span>
            </div>
            <span className="truncate text-2xs">
              {e.parsed.trackKindCandidates[0]?.kind ?? "-"}
              {e.parsed.trackKindCandidates.length > 1 && ` +${e.parsed.trackKindCandidates.length - 1}`}
            </span>
            <span className="tabular-nums text-2xs">{e.year}</span>
            <Badge
              variant="outline"
              data-element="trust-badge"
              className={cn("text-2xs", TRUST_BADGE_CLASS[e.trustLevel])}
            >
              {TRUST_LABEL[e.trustLevel]}
            </Badge>
            <span className="flex items-center gap-1 text-2xs text-muted-foreground">
              <Clock aria-hidden className="h-2.5 w-2.5" />
              {formatRelative(e.createdAtMs)}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onSelect(e)}
              data-testid="open-detail-modal"
              className="h-7 px-2 text-2xs"
            >
              검수 <ChevronRight className="ml-0.5 h-3 w-3" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatRelative(ms: number): string {
  const diff = Date.now() - ms;
  const hours = diff / (60 * 60 * 1000);
  if (hours < 1) return `${Math.max(1, Math.round(diff / 60000))}분 전`;
  if (hours < 24) return `${Math.round(hours)}시간 전`;
  const days = Math.round(hours / 24);
  return `${days}일 전`;
}
