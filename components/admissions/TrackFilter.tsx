"use client";

/**
 * TrackFilter — 다중 선택 전형 종류 (수시 4 + 정시 3 + jaeoegukmin)
 *
 * P-013: jaeoegukmin 은 디폴트 노출 X. allowJaeoegukmin prop 으로 명시 활성화 시에만 노출.
 *   - /admissions 일반 검색에서는 allowJaeoegukmin=false (디폴트)
 *   - /admissions/jaeoegukmin 전용 라우트에서만 allowJaeoegukmin=true
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { AdmissionTrackKind } from "@/types/admission";
import { TRACK_KIND_LABELS, TRACK_KIND_DEFAULT_VISIBLE } from "@/lib/admission/labels";

export interface TrackFilterProps {
  selected: AdmissionTrackKind[];
  onChange: (kinds: AdmissionTrackKind[]) => void;
  /** P-013 진입점 분리 정책 — 명시 true 일 때만 jaeoegukmin 옵션 노출 */
  allowJaeoegukmin?: boolean;
  className?: string;
}

const ORDER: AdmissionTrackKind[] = [
  "susi_subject",
  "susi_comprehensive",
  "susi_essay",
  "susi_practical",
  "jeongsi_ga",
  "jeongsi_na",
  "jeongsi_da",
  "jaeoegukmin",
  "additional",
];

export function TrackFilter({
  selected,
  onChange,
  allowJaeoegukmin = false,
  className,
}: TrackFilterProps): React.ReactElement {
  const visible = React.useMemo(() => {
    return ORDER.filter((kind) => {
      if (kind === "jaeoegukmin") return allowJaeoegukmin;
      // additional 추가모집은 시즌 후반 노출 — 디폴트 visible 매핑 사용
      return TRACK_KIND_DEFAULT_VISIBLE[kind] || kind === "additional";
    });
  }, [allowJaeoegukmin]);

  const toggle = React.useCallback(
    (kind: AdmissionTrackKind) => {
      const set = new Set(selected);
      if (set.has(kind)) set.delete(kind);
      else set.add(kind);
      onChange([...set]);
    },
    [selected, onChange],
  );

  return (
    <div
      data-component="track-filter"
      data-allow-jaeoegukmin={allowJaeoegukmin}
      role="group"
      aria-label="전형 필터"
      className={cn("flex flex-wrap gap-2", className)}
    >
      {visible.map((kind) => {
        const isOn = selected.includes(kind);
        return (
          <button
            key={kind}
            type="button"
            role="checkbox"
            aria-checked={isOn}
            data-selected={isOn}
            data-track-kind={kind}
            onClick={() => toggle(kind)}
            className={cn(
              "rounded-full transition",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
            )}
          >
            <Badge
              variant={isOn ? "default" : "outline"}
              className={cn(
                isOn
                  ? "bg-brand-600 text-white hover:bg-brand-700"
                  : "bg-transparent hover:bg-brand-50 dark:hover:bg-brand-950/40",
                "cursor-pointer border",
              )}
            >
              {TRACK_KIND_LABELS[kind]}
            </Badge>
          </button>
        );
      })}
    </div>
  );
}
