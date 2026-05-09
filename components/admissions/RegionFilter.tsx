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
  "national_flag",
  "national_local",
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
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-500",
            )}
          >
            <Badge
              variant={isOn ? "default" : "outline"}
              className={cn(
                isOn
                  ? "bg-mint-600 text-white hover:bg-mint-700"
                  : "bg-transparent hover:bg-mint-50 dark:hover:bg-mint-950/40",
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
