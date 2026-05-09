"use client";

/**
 * UniversityCategoryFilter — 단일 선택 학과 계열 (의약/공학/인문/자연/예체능/사회/상경/어문 + 전체)
 *
 * 단일 선택이라 SegmentedControl 또는 button group. shadcn segmented-control 활용.
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  type DepartmentCategory,
  DEPARTMENT_CATEGORY_LABELS,
} from "@/lib/admission/labels";

export interface UniversityCategoryFilterProps {
  selected: DepartmentCategory;
  onChange: (category: DepartmentCategory) => void;
  className?: string;
}

const ORDER: DepartmentCategory[] = [
  "all",
  "humanities",
  "social",
  "natural",
  "engineering",
  "medical",
  "arts",
  "business",
  "language",
];

export function UniversityCategoryFilter({
  selected,
  onChange,
  className,
}: UniversityCategoryFilterProps): React.ReactElement {
  return (
    <div
      data-component="university-category-filter"
      role="radiogroup"
      aria-label="학과 계열 필터"
      className={cn("flex flex-wrap gap-1", className)}
    >
      {ORDER.map((cat) => {
        const isOn = selected === cat;
        return (
          <button
            key={cat}
            type="button"
            role="radio"
            aria-checked={isOn}
            data-selected={isOn}
            data-category={cat}
            onClick={() => onChange(cat)}
            className={cn(
              "rounded-md px-3 py-1 text-sm transition",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-500",
              isOn
                ? "bg-mint-600 text-white hover:bg-mint-700"
                : "bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {DEPARTMENT_CATEGORY_LABELS[cat]}
          </button>
        );
      })}
    </div>
  );
}
