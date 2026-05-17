"use client";

/**
 * AdmissionsSearchView — /admissions 페이지 본체 (클라이언트 컴포넌트)
 *
 * 책임:
 *   - 검색어 + 필터 상태 관리
 *   - /api/admissions/search 호출 + 무한 스크롤
 *   - 빈 상태·로딩·에러 처리
 *   - 모바일/데스크톱 레이아웃 분기
 */

import * as React from "react";
import { Filter as FilterIcon, X, Sparkles, Search as SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DepartmentSearchBar } from "@/components/admissions/DepartmentSearchBar";
import { RegionFilter } from "@/components/admissions/RegionFilter";
import { TrackFilter } from "@/components/admissions/TrackFilter";
import { UniversityCategoryFilter } from "@/components/admissions/UniversityCategoryFilter";
import { DepartmentCard } from "@/components/admissions/DepartmentCard";
import type { AdmissionTrackKind, Department, University } from "@/types/admission";
import type { RegionGroup, DepartmentCategory } from "@/lib/admission/labels";
import { cn } from "@/lib/utils";

interface SearchResultItem {
  department: Department;
  university: University;
  sampleSufficient: boolean;
  availableTracks: AdmissionTrackKind[];
}

interface SearchResponse {
  results: SearchResultItem[];
  nextCursor?: string;
  totalEstimate?: number;
}

export function AdmissionsSearchView(): React.ReactElement {
  // 필터 상태
  const [query, setQuery] = React.useState("");
  const [regions, setRegions] = React.useState<RegionGroup[]>([]);
  const [tracks, setTracks] = React.useState<AdmissionTrackKind[]>([]);
  const [category, setCategory] = React.useState<DepartmentCategory>("all");
  const [filterDrawerOpen, setFilterDrawerOpen] = React.useState(false);

  // 결과
  const [items, setItems] = React.useState<SearchResultItem[]>([]);
  const [cursor, setCursor] = React.useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = React.useState(true);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // 검색·필터 변경 시 첫 페이지 재조회
  React.useEffect(() => {
    setItems([]);
    setCursor(undefined);
    setHasMore(true);
    void fetchPage(undefined, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, regions.join(","), tracks.join(","), category]);

  async function fetchPage(nextCursor: string | undefined, replace: boolean): Promise<void> {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      if (category !== "all") params.set("category", category);
      // 다중 필터 — 첫 항목만 stub 라우트에 전달 (실제 구현 시 다중 처리)
      if (regions.length > 0) params.set("region", regions[0]);
      if (tracks.length > 0) params.set("trackKind", tracks[0]);
      if (nextCursor) params.set("cursor", nextCursor);
      params.set("limit", "20");

      const res = await fetch(`/api/admissions/search?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`검색 실패 (${res.status})`);
      }
      const data: SearchResponse | { todo: string } = await res.json();

      // stub 응답(`todo`) 은 빈 배열로 처리. 실제 라우트 구현 후 results 배열 채워짐.
      if ("todo" in data) {
        if (replace) setItems([]);
        setHasMore(false);
        return;
      }

      const newItems = data.results ?? [];
      setItems((prev) => (replace ? newItems : [...prev, ...newItems]));
      setCursor(data.nextCursor);
      setHasMore(Boolean(data.nextCursor));
    } catch (e) {
      setError((e as Error).message);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }

  // 무한 스크롤 — IntersectionObserver
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore || loading) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && cursor) {
        void fetchPage(cursor, false);
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, hasMore, loading]);

  const hasActiveFilters = query.length > 0 || regions.length > 0 || tracks.length > 0 || category !== "all";
  const clearAllFilters = () => {
    setQuery("");
    setRegions([]);
    setTracks([]);
    setCategory("all");
  };

  const filtersJsx = (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h2 className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">지역</h2>
        <RegionFilter selected={regions} onChange={setRegions} />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">전형</h2>
        <TrackFilter selected={tracks} onChange={setTracks} allowJaeoegukmin={false} />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">계열</h2>
        <UniversityCategoryFilter selected={category} onChange={setCategory} />
      </section>
      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={clearAllFilters} className="self-start text-xs">
          <X className="h-3 w-3" />
          필터 초기화
        </Button>
      )}
    </div>
  );

  return (
    <div data-page="admissions" className="relative">
      {/* 배경 mesh */}
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[40vh] overflow-hidden" aria-hidden>
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 h-[30rem] w-[80rem] rounded-full bg-gradient-to-b from-brand-200/30 via-iris/10 to-transparent blur-3xl dark:from-brand-700/12" />
      </div>

      <div className="mx-auto max-w-content-wide px-gutter-sm md:px-gutter lg:px-gutter-lg py-10 lg:py-14">
        {/* 상단 헤더 + 검색바 */}
        <header className="mb-8 lg:mb-12 flex flex-col gap-5">
          <div className="flex flex-col items-start gap-3">
            <Badge variant="pill-brand" size="md">
              <Sparkles className="h-3 w-3" />
              1,000+ 학과 데이터
            </Badge>
            <h1 className="font-display text-3xl lg:text-5xl font-extrabold tracking-tighter">
              학과 검색
            </h1>
            <p className="text-sm lg:text-base text-muted-foreground break-keep-all">
              전국 주요 대학의 모집요강·전형 정보를 한 화면에서 비교하세요. 로그인 없이 무료로 조회 가능합니다.
            </p>
          </div>

          {/* sticky 검색바 */}
          <div className="sticky top-16 z-20 -mx-gutter-sm md:-mx-gutter lg:-mx-gutter-lg px-gutter-sm md:px-gutter lg:px-gutter-lg py-3 bg-background/70 backdrop-blur-xl border-y border-border/40">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <DepartmentSearchBar value={query} onChange={setQuery} />
              </div>
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="md:hidden shrink-0"
                onClick={() => setFilterDrawerOpen(true)}
                aria-label="필터 열기"
              >
                <FilterIcon className="h-4 w-4" />
                필터
                {hasActiveFilters && (
                  <Badge variant="pill-brand" size="sm" className="ml-1 -mr-1 h-4 px-1.5 text-2xs">
                    {(regions.length + tracks.length + (category !== "all" ? 1 : 0))}
                  </Badge>
                )}
              </Button>
            </div>
          </div>
        </header>

        <div className="grid gap-6 lg:gap-8 md:grid-cols-[260px_1fr]">
          {/* 데스크톱 sticky 사이드바 */}
          <aside className="hidden md:block">
            <div className="sticky top-32 rounded-2xl border border-border bg-card/80 backdrop-blur-sm p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-bold tracking-tight">필터</h2>
                <FilterIcon className="h-4 w-4 text-muted-foreground" />
              </div>
              {filtersJsx}
            </div>
          </aside>

          {/* 메인 */}
          <main className="min-w-0">
            {/* 결과 카운트 */}
            {items.length > 0 && (
              <p className="mb-4 text-xs text-muted-foreground font-numeric tabular-nums">
                {items.length}개 학과
              </p>
            )}

            {/* 에러 */}
            {error && (
              <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* 빈 상태 — 일러스트 + 추천 칩 */}
            {!loading && items.length === 0 && !error && (
              <EmptyState hasFilters={hasActiveFilters} onClearFilters={clearAllFilters} onApplySuggested={(track) => setTracks([track])} />
            )}

            {/* 결과 그리드 */}
            {items.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-5">
                {items.map((it) => (
                  <DepartmentCard
                    key={`${it.university.id}/${it.department.id}`}
                    department={it.department}
                    university={it.university}
                    sampleSufficient={it.sampleSufficient}
                    availableTracks={it.availableTracks}
                  />
                ))}
              </div>
            )}

            {/* 로딩 스켈레톤 — 새 카드 모양 모방 */}
            {loading && (
              <div className={cn(
                "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-5",
                items.length > 0 && "mt-4",
              )}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <CardSkeleton key={i} delay={i * 60} />
                ))}
              </div>
            )}

            {/* 무한 스크롤 sentinel */}
            {hasMore && !loading && <div ref={sentinelRef} className="h-8" />}
          </main>
        </div>

        {/* 모바일 필터 시트 */}
        {filterDrawerOpen && (
          <div
            className="fixed inset-0 z-50 bg-background/95 backdrop-blur-xl md:hidden animate-fade-in"
            role="dialog"
            aria-modal="true"
            aria-label="필터"
            onClick={() => setFilterDrawerOpen(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-background border-t border-border max-h-[85vh] overflow-y-auto animate-fade-up"
            >
              <div className="flex items-center justify-between border-b border-border px-5 py-4 sticky top-0 bg-background/95 backdrop-blur">
                <h2 className="text-base font-bold">필터</h2>
                <button
                  type="button"
                  aria-label="닫기"
                  onClick={() => setFilterDrawerOpen(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background hover:bg-muted"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="px-5 py-6 pb-10">{filtersJsx}</div>
              <div className="sticky bottom-0 border-t border-border bg-background/95 backdrop-blur px-5 py-3">
                <Button
                  type="button"
                  variant="primary"
                  size="xl"
                  className="w-full"
                  onClick={() => setFilterDrawerOpen(false)}
                >
                  결과 보기
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────── EmptyState ───────────────────────── */

const SUGGESTED_TRACKS: { kind: AdmissionTrackKind; label: string }[] = [
  { kind: "susi_comprehensive", label: "학생부종합" },
  { kind: "susi_subject", label: "학생부교과" },
  { kind: "jeongsi_ga", label: "정시 가군" },
];

function EmptyState({
  hasFilters,
  onClearFilters,
  onApplySuggested,
}: {
  hasFilters: boolean;
  onClearFilters: () => void;
  onApplySuggested: (track: AdmissionTrackKind) => void;
}): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      {/* 추상 SVG 일러스트 */}
      <svg
        viewBox="0 0 200 160"
        aria-hidden
        className="h-32 w-40 text-muted-foreground/40 mb-6"
        fill="none"
      >
        <circle cx="80" cy="80" r="50" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" />
        <line x1="118" y1="118" x2="160" y2="160" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <circle cx="80" cy="80" r="6" fill="currentColor" opacity="0.5" />
        <circle cx="60" cy="65" r="3" fill="hsl(160 84% 39%)" opacity="0.6" />
        <circle cx="95" cy="55" r="3" fill="hsl(243 91% 73%)" opacity="0.6" />
        <circle cx="98" cy="98" r="3" fill="hsl(38 92% 50%)" opacity="0.6" />
      </svg>
      <h3 className="font-display text-xl font-bold mb-2">
        {hasFilters ? "조건에 맞는 학과가 없어요" : "검색을 시작하세요"}
      </h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-md break-keep-all">
        {hasFilters
          ? "필터를 완화하거나 다른 키워드로 시도해보세요."
          : "위 검색창에 대학명/학과명을 입력하거나 추천 전형으로 시작해보세요."}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {hasFilters ? (
          <Button variant="outline" size="default" onClick={onClearFilters}>
            <X className="h-3.5 w-3.5" />
            필터 초기화
          </Button>
        ) : (
          <>
            <span className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">추천</span>
            {SUGGESTED_TRACKS.map((t) => (
              <Button
                key={t.kind}
                variant="outline"
                size="sm"
                onClick={() => onApplySuggested(t.kind)}
              >
                <SearchIcon className="h-3 w-3" />
                {t.label}
              </Button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────── CardSkeleton ───────────────────────── */

function CardSkeleton({ delay = 0 }: { delay?: number }): React.ReactElement {
  return (
    <div
      className="rounded-2xl border border-border bg-card p-5 animate-fade-in"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="mb-4 flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl shimmer" />
        <div className="flex flex-col gap-1.5 flex-1">
          <div className="h-3 w-16 rounded shimmer" />
          <div className="h-2 w-12 rounded shimmer" />
        </div>
      </div>
      <div className="h-5 w-3/4 rounded shimmer mb-3" />
      <div className="flex gap-1.5">
        <div className="h-5 w-14 rounded-full shimmer" />
        <div className="h-5 w-16 rounded-full shimmer" />
        <div className="h-5 w-12 rounded-full shimmer" />
      </div>
    </div>
  );
}
