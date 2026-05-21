"use client";

/**
 * HighSchoolAutocomplete — NEIS 학교기본정보 API 기반 고등학교 자동완성.
 *
 * 동작:
 *   - 입력 디바운스 300ms → /api/neis/highschools?q=... 호출
 *   - 결과 드롭다운 (학교명 + 소재지)
 *   - 키보드 네비게이션: ↑ ↓ Enter Esc
 *   - 모바일 친화: 큰 터치 영역(min-h-11), tap-highlight 비활성, IME 안전
 *
 * 정직성 (P-002):
 *   - 결과 표시 시 "출처: NEIS" 안내 푸터 — 데이터 출처 명시.
 *   - 결과 없음 / API 오류 시 "검색 결과 없음" — 가짜 결과 X.
 *
 * 사용 예:
 *   <HighSchoolAutocomplete
 *     value={school}
 *     onSelect={(s) => { setSchool(s); setSchoolCode(s.code); }}
 *   />
 */

import * as React from "react";
import { Search, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import type { NeisHighSchool } from "@/lib/api/neis";

export interface HighSchoolAutocompleteProps {
  /** 현재 입력값 (controlled). 선택 후엔 학교명 텍스트. */
  value: string;
  /** 사용자가 학교를 선택했을 때 — 학교 객체 전체 전달. */
  onSelect: (school: NeisHighSchool) => void;
  /**
   * 입력값이 변경될 때 호출 — 호출자는 선택 미완료 상태(자유 입력)도 보존 가능.
   * 미제공 시 내부 state 만 갱신.
   */
  onChange?: (value: string) => void;
  /** placeholder */
  placeholder?: string;
  /** debounce ms (기본 300) */
  debounceMs?: number;
  /** 추가 클래스 */
  className?: string;
  /** label id — 외부 <label htmlFor=...> 와 연결 */
  inputId?: string;
  /** aria-label (label 가 없을 때) */
  ariaLabel?: string;
  /** disabled */
  disabled?: boolean;
}

interface FetchState {
  loading: boolean;
  results: NeisHighSchool[];
  error: string | null;
}

export function HighSchoolAutocomplete({
  value,
  onSelect,
  onChange,
  placeholder = "고등학교명 입력 (2자 이상)",
  debounceMs = 300,
  className,
  inputId,
  ariaLabel = "고등학교 자동완성",
  disabled,
}: HighSchoolAutocompleteProps): React.ReactElement {
  const [local, setLocal] = React.useState(value);
  const [debounced, setDebounced] = React.useState(value);
  const [open, setOpen] = React.useState(false);
  const [activeIdx, setActiveIdx] = React.useState(0);
  const [state, setState] = React.useState<FetchState>({ loading: false, results: [], error: null });

  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const wrapperRef = React.useRef<HTMLDivElement | null>(null);

  // 외부 value 변경 → 로컬 동기화
  React.useEffect(() => {
    setLocal(value);
  }, [value]);

  // debounce
  React.useEffect(() => {
    if (debounceMs <= 0) {
      setDebounced(local);
      return;
    }
    const t = setTimeout(() => setDebounced(local), debounceMs);
    return () => clearTimeout(t);
  }, [local, debounceMs]);

  // fetch
  React.useEffect(() => {
    const trimmed = debounced.trim();
    if (trimmed.length < 2) {
      setState({ loading: false, results: [], error: null });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetch(`/api/neis/highschools?q=${encodeURIComponent(trimmed)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: { source?: string; results?: NeisHighSchool[]; error?: string }) => {
        if (cancelled) return;
        setState({
          loading: false,
          results: data.results ?? [],
          error: data.error ?? null,
        });
        setActiveIdx(0);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setState({
          loading: false,
          results: [],
          error: e instanceof Error ? e.message : "검색 실패",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  // 외부 클릭 → 닫기
  React.useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapperRef.current && !wrapperRef.current.contains(t)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const handleChange = (next: string): void => {
    setLocal(next);
    onChange?.(next);
    setOpen(true);
  };

  const handleClear = (): void => {
    setLocal("");
    onChange?.("");
    setState({ loading: false, results: [], error: null });
    inputRef.current?.focus();
  };

  const selectAt = (idx: number): void => {
    const school = state.results[idx];
    if (!school) return;
    setLocal(school.name);
    onSelect(school);
    onChange?.(school.name);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, Math.max(state.results.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (state.results.length > 0) {
        e.preventDefault();
        selectAt(activeIdx);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const showDropdown =
    open && (state.loading || state.results.length > 0 || debounced.trim().length >= 2);

  const listboxId = React.useId();

  return (
    <div
      ref={wrapperRef}
      data-component="highschool-autocomplete"
      className={cn("relative", className)}
    >
      <div className="relative flex items-center">
        <Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" aria-hidden />
        <Input
          ref={inputRef}
          id={inputId}
          type="text"
          inputMode="search"
          autoComplete="off"
          spellCheck={false}
          aria-label={ariaLabel}
          aria-autocomplete="list"
          aria-controls={showDropdown ? listboxId : undefined}
          aria-expanded={showDropdown}
          aria-activedescendant={
            showDropdown && state.results[activeIdx]
              ? `${listboxId}-${state.results[activeIdx].code}`
              : undefined
          }
          role="combobox"
          value={local}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          className="pl-9 pr-9 min-h-11"
        />
        {state.loading && (
          <Loader2 className="absolute right-3 h-4 w-4 text-muted-foreground animate-spin" aria-hidden />
        )}
        {!state.loading && local.length > 0 && (
          <button
            type="button"
            aria-label="검색어 지우기"
            onClick={handleClear}
            className="absolute right-2 inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {showDropdown && (
        <div
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-xl border border-border bg-popover shadow-lg"
          role="listbox"
          id={listboxId}
        >
          {state.results.length === 0 && !state.loading && (
            <div className="px-4 py-3 text-sm text-muted-foreground" role="status">
              {state.error
                ? `검색 실패: ${state.error}`
                : debounced.trim().length < 2
                ? "2자 이상 입력하세요"
                : "검색 결과 없음"}
            </div>
          )}
          {state.results.map((s, idx) => {
            const isActive = idx === activeIdx;
            return (
              <button
                key={s.code}
                id={`${listboxId}-${s.code}`}
                type="button"
                role="option"
                aria-selected={isActive}
                onMouseEnter={() => setActiveIdx(idx)}
                onMouseDown={(e) => e.preventDefault() /* prevent input blur */}
                onClick={() => selectAt(idx)}
                className={cn(
                  "block w-full text-left px-4 py-2.5 min-h-11 transition-colors",
                  isActive ? "bg-muted" : "hover:bg-muted/60",
                )}
              >
                <div className="text-sm font-medium text-foreground">{s.name}</div>
                <div className="text-2xs text-muted-foreground mt-0.5 truncate">
                  {s.region}
                  {s.address ? ` · ${s.address}` : ""}
                </div>
              </button>
            );
          })}
          {/* 출처 명시 — 정직성(P-002) */}
          <div className="border-t border-border bg-muted/40 px-4 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            출처: NEIS 학교기본정보
          </div>
        </div>
      )}
    </div>
  );
}
