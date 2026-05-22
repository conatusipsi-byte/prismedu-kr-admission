"use client";

/**
 * RegionFilter — 다중 선택 토글 칩 (서울권/거점국립/지방거점/지방사립/특수대학)
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { type RegionGroup, REGION_GROUP_LABELS } from "@/lib/admission/labels";

export interface RegionFilterProps {
  selected: RegionGroup[];
  onChange: (regions: RegionGroup[]) => void;
  className?: string;
}

const ORDER: RegionGroup[] = [
  "seoul",
  "gyeonggi",
  "national",
  "private_local",
  "special",
];

export function RegionFilter({
  selected,
  onChange,
  className,
}: RegionFilterProps): React.ReactElement {
  const toggle = React.useCallback(
    (region: RegionGroup) => {
      const set = new Set(selected);
      if (set.has(region)) set.delete(region);
      else set.add(region);
      onChange([...set]);
    },
    [selected, onChange],
  );

  return (
    <div
      data-component="region-filter"
      role="group"
      aria-label="지역 필터"
      className={cn("flex flex-wrap gap-2", className)}
    >
      {ORDER.map((region) => {
        const isOn = selected.includes(region);
        return (
          <button
            key={region}
            type="button"
            role="checkbox"
            aria-checked={isOn}
            data-selected={isOn}
            onClick={() => toggle(region)}
            className={cn(
              "rounded-full transition",
              // BUG-008 (WCAG 2.1 SC 2.4.7): focus indicator 강화. 알파 + offset + 다크모드 변형.
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:focus-visible:ring-brand-400/70",
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
              {REGION_GROUP_LABELS[region]}
            </Badge>
          </button>
        );
      })}
    </div>
  );
}
