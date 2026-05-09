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
import { Filter as FilterIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DepartmentSearchBar } from "@/components/admissions/DepartmentSearchBar";
import { RegionFilter } from "@/components/admissions/RegionFilter";
import { TrackFilter } from "@/components/admissions/TrackFilter";
import { UniversityCategoryFilter } from "@/components/admissions/UniversityCategoryFilter";
import { DepartmentCard } from "@/components/admissions/DepartmentCard";
import type { AdmissionTrackKind, Department, University } from "@/types/admission";
import type { RegionGroup, DepartmentCategory } from "@/lib/admission/labels";

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

  const filtersJsx = (
    <div className="flex flex-col gap-section">
      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">지역</h2>
        <RegionFilter selected={regions} onChange={setRegions} />
      </section>
      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">전형</h2>
        {/* P-013: 일반 검색에서는 jaeoegukmin 옵션 미노출 */}
        <TrackFilter selected={tracks} onChange={setTracks} allowJaeoegukmin={false} />
      </section>
      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">계열</h2>
        <UniversityCategoryFilter selected={category} onChange={setCategory} />
      </section>
    </div>
  );

  return (
    <div data-page="admissions" className="mx-auto max-w-content-wide px-gutter-sm md:px-gutter lg:px-gutter-lg">
      {/* 상단 헤더 + 검색바 (sticky) */}
      <header className="sticky top-0 z-10 flex flex-col gap-3 bg-background/80 py-4 backdrop-blur md:py-6">
        <h1 className="text-2xl font-bold">학과 검색</h1>
        <DepartmentSearchBar value={query} onChange={setQuery} />
        {/* 모바일 필터 토글 */}
        <Button
          type="button"
          variant="outline"
          className="self-start md:hidden"
          onClick={() => setFilterDrawerOpen(true)}
        >
          <FilterIcon className="mr-2 h-4 w-4" /> 필터
        </Button>
      </header>

      <div className="mt-6 grid gap-section md:grid-cols-[240px_1fr]">
        {/* 데스크톱 사이드바 */}
        <aside className="hidden md:block">{filtersJsx}</aside>

        {/* 메인 그리드 */}
        <main>
          {/* 빈 상태 */}
          {!loading && items.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-sm text-muted-foreground">
                {query || regions.length > 0 || tracks.length > 0 || category !== "all"
                  ? "조건에 맞는 학과가 없어요. 필터를 변경해보세요."
                  : "검색어를 입력하거나 필터를 선택하세요."}
              </p>
            </div>
          )}

          {/* 에러 */}
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* 결과 그리드 */}
          {items.length > 0 && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
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

          {/* 로딩 스켈레톤 */}
          {loading && (
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-36" />
              ))}
            </div>
          )}

          {/* 무한 스크롤 sentinel */}
          {hasMore && !loading && <div ref={sentinelRef} className="h-8" />}
        </main>
      </div>

      {/* 모바일 필터 드로어 (기본 sheet 활용 — 단순 버전) */}
      {filterDrawerOpen && (
        <div
          className="fixed inset-0 z-20 bg-background/95 backdrop-blur md:hidden"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex items-center justify-between border-b p-4">
            <h2 className="text-lg font-semibold">필터</h2>
            <button
              type="button"
              aria-label="닫기"
              onClick={() => setFilterDrawerOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-4">{filtersJsx}</div>
        </div>
      )}
    </div>
  );
}
