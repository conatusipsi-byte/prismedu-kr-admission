"use client";

/**
 * UniversityCategoryFilter — 계열 다중 선택 + 4 그룹 시각 분리
 *
 * 클라이언트 요청 ⑥ (2026-05-21):
 *   [전체]
 *   [인문·사회·어문·상경] (그룹 헤더)
 *     - 인문 / 사회 / 어문 / 상경
 *   [자연·공학] (그룹 헤더)
 *     - 자연 / 공학
 *   [의치한약수] (그룹 헤더)
 *     - 의예 / 치의예 / 한의예 / 약학 / 수의예  ※ 모두 medical 매핑 (P-002)
 *
 * 인터랙션:
 *   - 그룹 헤더 클릭 → 그룹 내 모든 옵션 토글 (전체 켜짐 ↔ 전체 꺼짐)
 *   - 개별 옵션 클릭 → 해당만 토글
 *   - "전체" 클릭 → 모든 옵션 해제 (= 빈 배열)
 *
 * 시각: 그룹 헤더 굵게, 하위 옵션 들여쓰기 chip.
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  type DepartmentCategory,
  DEPARTMENT_CATEGORY_LABELS,
  DEPARTMENT_CATEGORY_GROUPS,
} from "@/lib/admission/labels";

export interface UniversityCategoryFilterProps {
  /** 선택된 카테고리 배열. 빈 배열 = "전체". */
  selected: DepartmentCategory[];
  onChange: (categories: DepartmentCategory[]) => void;
  className?: string;
}

export function UniversityCategoryFilter({
  selected,
  onChange,
  className,
}: UniversityCategoryFilterProps): React.ReactElement {
  const selectedSet = React.useMemo(() => new Set(selected), [selected]);

  const toggleOne = React.useCallback(
    (cat: DepartmentCategory) => {
      const next = new Set(selectedSet);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      onChange([...next]);
    },
    [selectedSet, onChange],
  );

  const toggleGroup = React.useCallback(
    (groupOptions: DepartmentCategory[]) => {
      const allOn = groupOptions.every((o) => selectedSet.has(o));
      const next = new Set(selectedSet);
      if (allOn) groupOptions.forEach((o) => next.delete(o));
      else groupOptions.forEach((o) => next.add(o));
      onChange([...next]);
    },
    [selectedSet, onChange],
  );

  const isAllCleared = selected.length === 0;

  return (
    <div
      data-component="university-category-filter"
      role="group"
      aria-label="계열 필터"
      className={cn("flex flex-col gap-3", className)}
    >
      {/* 전체 */}
      <button
        type="button"
        role="checkbox"
        aria-checked={isAllCleared}
        data-selected={isAllCleared}
        data-category="all"
        onClick={() => onChange([])}
        className={cn(
          "self-start rounded-md px-3 py-1 text-sm font-medium transition",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
          isAllCleared
            ? "bg-brand-600 text-white hover:bg-brand-700"
            : "bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground border border-border",
        )}
      >
        전체
      </button>

      {/* 4 그룹 */}
      {DEPARTMENT_CATEGORY_GROUPS.map((group) => {
        const allOn = group.options.every((o) => selectedSet.has(o));
        const someOn = !allOn && group.options.some((o) => selectedSet.has(o));
        return (
          <div key={group.id} data-category-group={group.id} className="flex flex-col gap-1.5">
            <button
              type="button"
              role="checkbox"
              aria-checked={allOn ? true : someOn ? "mixed" : false}
              data-selected={allOn}
              data-group-header={group.id}
              onClick={() => toggleGroup(group.options)}
              className={cn(
                "self-start text-2xs font-bold uppercase tracking-wider transition",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-sm px-1 py-0.5",
                allOn
                  ? "text-brand-700 dark:text-brand-300"
                  : someOn
                  ? "text-iris-700 dark:text-iris-300"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {group.label}
            </button>
            <div className="flex flex-wrap gap-1 pl-3" data-group-options={group.id}>
              {group.options.map((cat) => {
                const isOn = selectedSet.has(cat);
                return (
                  <button
                    key={cat}
                    type="button"
                    role="checkbox"
                    aria-checked={isOn}
                    data-selected={isOn}
                    data-category={cat}
                    onClick={() => toggleOne(cat)}
                    className={cn(
                      "rounded-md px-2.5 py-0.5 text-xs transition border",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                      isOn
                        ? "bg-brand-600 text-white border-brand-600 hover:bg-brand-700"
                        : "bg-transparent text-muted-foreground border-border hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {DEPARTMENT_CATEGORY_LABELS[cat]}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* 예체능 — 그룹 외 단일 */}
      <SingleChip
        category="arts"
        on={selectedSet.has("arts")}
        onClick={() => toggleOne("arts")}
      />
    </div>
  );
}

function SingleChip({
  category,
  on,
  onClick,
}: {
  category: DepartmentCategory;
  on: boolean;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      data-selected={on}
      data-category={category}
      onClick={onClick}
      className={cn(
        "self-start rounded-md px-3 py-1 text-sm transition border",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
        on
          ? "bg-brand-600 text-white border-brand-600 hover:bg-brand-700"
          : "bg-transparent text-muted-foreground border-border hover:bg-muted hover:text-foreground",
      )}
    >
      {DEPARTMENT_CATEGORY_LABELS[category]}
    </button>
  );
}
