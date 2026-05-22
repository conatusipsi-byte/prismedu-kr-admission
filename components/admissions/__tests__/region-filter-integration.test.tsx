/**
 * RegionFilter ↔ /api/admissions/search 통합 테스트 (BUG-001 회귀 방지).
 *
 * 단위 테스트(components.test.tsx) 는 REGION_GROUP_TO_CATEGORIES 매핑 자체만 검증했기 때문에
 * "View 가 매핑을 실제로 호출해서 API 에 전달하는가" 가 회귀에 노출돼 있었다.
 *   - QA round 1, 2026-05-22: 서울권/특수대학 토글이 결과에 적용되지 않음 (prod).
 *   - 원인: AdmissionsSearchView 가 `region=<group>` 으로 보냈으나 라우트는 `category` 만 읽음.
 *
 * 본 테스트는 fetch 를 모킹해 각 RegionGroup 칩 클릭 시 `category=` 파라미터가 매핑대로
 * 전달되는지(=View → API 의 경계가 매핑을 거치는지) 확인한다.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { AdmissionsSearchView } from "../../../app/admissions/AdmissionsSearchView";
import { REGION_GROUP_TO_CATEGORIES, type RegionGroup } from "@/lib/admission/labels";

// jsdom 미제공 — AdmissionsSearchView 가 무한 스크롤용으로 사용.
class MockIntersectionObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): unknown[] {
    return [];
  }
}
(globalThis as unknown as { IntersectionObserver: typeof MockIntersectionObserver }).IntersectionObserver =
  MockIntersectionObserver;

function mockFetchEmptyOk(): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async () =>
    new Response(JSON.stringify({ results: [], nextCursor: undefined }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
  // jsdom 환경의 global fetch 교체
  (globalThis as unknown as { fetch: typeof fn }).fetch = fn;
  return fn;
}

function extractCategoryParams(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls.map(([url]) => {
    const u = new URL(url as string, "http://localhost");
    return u.searchParams.get("category") ?? "";
  });
}

describe("RegionFilter → /api/admissions/search 통합 (BUG-001)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = mockFetchEmptyOk();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * 각 RegionGroup 칩 단독 토글 → 매핑된 UniversityCategory 가 정확히 전달.
   * 칩 라벨은 한국어이므로 REGION_GROUP_LABELS 와 일치.
   */
  it.each<{ group: RegionGroup; label: string }>([
    { group: "seoul",          label: "서울권" },
    { group: "gyeonggi",       label: "경기권" },
    { group: "national",       label: "지방국립" },
    { group: "private_local",  label: "지방사립" },
    { group: "special",        label: "특수대학" },
  ])("$label 토글 시 category=$group 로 호출", async ({ group, label }) => {
    render(<AdmissionsSearchView />);
    // 초기 마운트 시 1회 fetch — category 없음
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    fetchMock.mockClear();

    await act(async () => {
      fireEvent.click(screen.getByRole("checkbox", { name: label }));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const cats = extractCategoryParams(fetchMock);
    const expected = REGION_GROUP_TO_CATEGORIES[group].join(",");
    expect(cats, `category param should equal "${expected}" after toggling ${label}`)
      .toContain(expected);
  });

  it("서울권 + 특수대학 다중 선택 시 category=seoul,special 전달 (BUG-001 회귀 — 다중 선택)", async () => {
    render(<AdmissionsSearchView />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    fetchMock.mockClear();

    await act(async () => {
      fireEvent.click(screen.getByRole("checkbox", { name: "서울권" }));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    fetchMock.mockClear();

    await act(async () => {
      fireEvent.click(screen.getByRole("checkbox", { name: "특수대학" }));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const lastCall = fetchMock.mock.calls.at(-1)?.[0] as string;
    const url = new URL(lastCall, "http://localhost");
    const cat = url.searchParams.get("category") ?? "";
    const tokens = cat.split(",").sort();
    expect(tokens).toEqual(["seoul", "special"].sort());
  });

  it("region= 파라미터는 더이상 전달되지 않는다 (BUG-001 dead-param 제거)", async () => {
    render(<AdmissionsSearchView />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    fetchMock.mockClear();

    await act(async () => {
      fireEvent.click(screen.getByRole("checkbox", { name: "서울권" }));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    for (const [url] of fetchMock.mock.calls) {
      const u = new URL(url as string, "http://localhost");
      expect(u.searchParams.get("region")).toBeNull();
    }
  });
});
