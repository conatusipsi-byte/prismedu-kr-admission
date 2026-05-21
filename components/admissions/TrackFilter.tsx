"use client";

/**
 * TrackFilter — 다중 선택 전형 종류, 3 그룹 레이아웃
 *
 * 그룹 구조 (클라이언트 요청 ④, 2026-05-21):
 *   - 주요 (디폴트 노출): 학생부교과 / 학생부종합 / 논술
 *   - 정시 (한 줄, group): 가군 / 나군 / 다군
 *   - 기타 (하단 group): 실기 / 추가모집
 *
 * P-013: jaeoegukmin 은 디폴트 노출 X. allowJaeoegukmin prop 으로 명시 활성화 시
 * "기타" 그룹 끝에 추가 노출. /admissions/jaeoegukmin 전용 라우트 전용.
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { AdmissionTrackKind } from "@/types/admission";
import { TRACK_KIND_LABELS } from "@/lib/admission/labels";

export interface TrackFilterProps {
  selected: AdmissionTrackKind[];
  onChange: (kinds: AdmissionTrackKind[]) => void;
  /** P-013 진입점 분리 정책 — 명시 true 일 때만 jaeoegukmin 옵션 노출 */
  allowJaeoegukmin?: boolean;
  className?: string;
}

const PRIMARY: AdmissionTrackKind[] = [
  "susi_subject",
  "susi_comprehensive",
  "susi_essay",
];

const JEONGSI: AdmissionTrackKind[] = [
  "jeongsi_ga",
  "jeongsi_na",
  "jeongsi_da",
];

const OTHERS: AdmissionTrackKind[] = [
  "susi_practical",
  "additional",
];

export function TrackFilter({
  selected,
  onChange,
  allowJaeoegukmin = false,
  className,
}: TrackFilterProps): React.ReactElement {
  const toggle = React.useCallback(
    (kind: AdmissionTrackKind) => {
      const set = new Set(selected);
      if (set.has(kind)) set.delete(kind);
      else set.add(kind);
      onChange([...set]);
    },
    [selected, onChange],
  );

  const others = React.useMemo<AdmissionTrackKind[]>(() => {
    return allowJaeoegukmin ? [...OTHERS, "jaeoegukmin"] : OTHERS;
  }, [allowJaeoegukmin]);

  return (
    <div
      data-component="track-filter"
      data-allow-jaeoegukmin={allowJaeoegukmin}
      role="group"
      aria-label="전형 필터"
      className={cn("flex flex-col gap-3", className)}
    >
      {/* 주요 전형 — 학생부교과·학생부종합·논술 */}
      <div className="flex flex-wrap gap-2" data-track-group="primary">
        {PRIMARY.map((kind) => (
          <TrackChip key={kind} kind={kind} on={selected.includes(kind)} onClick={() => toggle(kind)} />
        ))}
      </div>

      {/* 정시 — 가·나·다군 한 줄 */}
      <div
        className="flex flex-wrap items-center gap-2"
        data-track-group="jeongsi"
        role="group"
        aria-label="정시 전형"
      >
        <span className="text-2xs font-bold uppercase tracking-wider text-muted-foreground mr-1">
          정시
        </span>
        {JEONGSI.map((kind) => (
          <TrackChip
            key={kind}
            kind={kind}
            on={selected.includes(kind)}
            onClick={() => toggle(kind)}
            // 정시 칩은 가·나·다 약어로 짧게
            shortLabel={kind === "jeongsi_ga" ? "가군" : kind === "jeongsi_na" ? "나군" : "다군"}
          />
        ))}
      </div>

      {/* 기타 — 실기·추가모집 (+ allowJaeoegukmin 시 재외국민) */}
      <div
        className="flex flex-wrap items-center gap-2"
        data-track-group="others"
        role="group"
        aria-label="기타 전형"
      >
        <span className="text-2xs font-bold uppercase tracking-wider text-muted-foreground mr-1">
          기타
        </span>
        {others.map((kind) => (
          <TrackChip key={kind} kind={kind} on={selected.includes(kind)} onClick={() => toggle(kind)} />
        ))}
      </div>
    </div>
  );
}

interface TrackChipProps {
  kind: AdmissionTrackKind;
  on: boolean;
  onClick: () => void;
  shortLabel?: string;
}

function TrackChip({ kind, on, onClick, shortLabel }: TrackChipProps): React.ReactElement {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      data-selected={on}
      data-track-kind={kind}
      onClick={onClick}
      className={cn(
        "rounded-full transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
      )}
    >
      <Badge
        variant={on ? "default" : "outline"}
        className={cn(
          on
            ? "bg-brand-600 text-white hover:bg-brand-700"
            : "bg-transparent hover:bg-brand-50 dark:hover:bg-brand-950/40",
          "cursor-pointer border",
        )}
      >
        {shortLabel ?? TRACK_KIND_LABELS[kind]}
      </Badge>
    </button>
  );
}
