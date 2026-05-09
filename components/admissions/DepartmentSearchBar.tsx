"use client";

/**
 * DepartmentSearchBar — 학과 검색 입력 (디바운스 300ms + 한글 초성 검색)
 *
 * onChange 는 디바운스된 값으로만 호출. 즉시 반응이 필요한 경우(예: clear 버튼)
 * 호출자가 직접 setState. 본 컴포넌트는 controlled — value prop 으로 외부 제어.
 */

import * as React from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export interface DepartmentSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** 디바운스 ms (기본 300) — 0 이면 즉시 onChange */
  debounceMs?: number;
  /** 추가 클래스 — sticky 등 */
  className?: string;
}

export function DepartmentSearchBar({
  value,
  onChange,
  placeholder = "대학명 또는 학과명 검색 (초성 ㅅㅇ 도 가능)",
  debounceMs = 300,
  className,
}: DepartmentSearchBarProps): React.ReactElement {
  // 입력 즉시 반영용 로컬 상태 + 디바운스로 부모 onChange
  const [local, setLocal] = React.useState(value);

  // 부모에서 value 변경 (예: 외부 reset) → 로컬 동기화
  React.useEffect(() => {
    setLocal(value);
  }, [value]);

  // 디바운스
  React.useEffect(() => {
    if (local === value) return;
    if (debounceMs <= 0) {
      onChange(local);
      return;
    }
    const t = setTimeout(() => onChange(local), debounceMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local, debounceMs]);

  const handleClear = React.useCallback(() => {
    setLocal("");
    onChange("");
  }, [onChange]);

  return (
    <div
      data-component="department-search-bar"
      className={cn("relative flex items-center", className)}
    >
      <Search
        aria-hidden
        className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground"
      />
      <Input
        type="search"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={placeholder}
        aria-label="학과 검색"
        className={cn("pl-9", local && "pr-9")}
      />
      {local && (
        <button
          type="button"
          aria-label="검색어 지우기"
          onClick={handleClear}
          className="absolute right-2 flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
