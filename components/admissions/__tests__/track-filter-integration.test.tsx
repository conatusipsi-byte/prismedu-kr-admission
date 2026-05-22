/**
 * TrackFilter ↔ /api/admissions/search 통합 테스트 (BUG-010 회귀 방지).
 *
 * BUG-001 (지역 필터) 수정 중 같은 구조적 패턴 발견:
 *   `params.set("trackKind", tracks[0])` — multi-select UI 인데 첫 항목만 전달.
 * BUG-010 으로 별도 트래킹. 본 테스트는 다중 토글 시 콤마 구분으로 정확히 전달되는지를
 * View → fetch URL 빌더 경계에서 검증한다 (단위 필터 컴포넌트 테스트만으로는
 * 회귀를 잡을 수 없는 통합 갭).
 *
 * 컨벤션 docs/decisions/2026-05-22-multi-select-filter-pattern.md 참조.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { AdmissionsSearchView } from "../../../app/admissions/AdmissionsSearchView";

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
  (globalThis as unknown as { fetch: typeof fn }).fetch = fn;
  return fn;
}

function lastTrackKindParam(fetchMock: ReturnType<typeof vi.fn>): string | null {
  const lastCall = fetchMock.mock.calls.at(-1)?.[0] as string;
  if (!lastCall) return null;
  const u = new URL(lastCall, "http://localhost");
  return u.searchParams.get("trackKind");
}

describe("TrackFilter → /api/admissions/search 통합 (BUG-010)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = mockFetchEmptyOk();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * 단독 토글 — 7종 (jaeoegukmin 은 allowJaeoegukmin=false 라서 UI 미노출).
   * AdmissionsSearchView 는 allowJaeoegukmin=false 로 TrackFilter 를 마운트한다.
   */
  it.each([
    { label: "학생부교과",  kind: "susi_subject"        },
    { label: "학생부종합",  kind: "susi_comprehensive"  },
    { label: "논술",        kind: "susi_essay"          },
    { label: "가군",        kind: "jeongsi_ga"          },
    { label: "나군",        kind: "jeongsi_na"          },
    { label: "다군",        kind: "jeongsi_da"          },
    { label: "실기",        kind: "susi_practical"      },
    { label: "추가모집",    kind: "additional"          },
  ])("$label 단독 토글 → trackKind=$kind 전달", async ({ label, kind }) => {
    render(<AdmissionsSearchView />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    fetchMock.mockClear();

    await act(async () => {
      fireEvent.click(screen.getByRole("checkbox", { name: label }));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    expect(lastTrackKindParam(fetchMock)).toBe(kind);
  });

  it("학생부교과 + 학생부종합 다중 선택 시 trackKind=susi_subject,susi_comprehensive 전달 (BUG-010 핵심)", async () => {
    render(<AdmissionsSearchView />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    fetchMock.mockClear();

    await act(async () => {
      fireEvent.click(screen.getByRole("checkbox", { name: "학생부교과" }));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    fetchMock.mockClear();

    await act(async () => {
      fireEvent.click(screen.getByRole("checkbox", { name: "학생부종합" }));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const tk = lastTrackKindParam(fetchMock) ?? "";
    const tokens = tk.split(",").sort();
    expect(tokens).toEqual(["susi_comprehensive", "susi_subject"]);
  });

  it("정시 가·나·다군 동시 선택 시 trackKind=jeongsi_ga,jeongsi_na,jeongsi_da 전달", async () => {
    render(<AdmissionsSearchView />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    await act(async () => {
      fireEvent.click(screen.getByRole("checkbox", { name: "가군" }));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await act(async () => {
      fireEvent.click(screen.getByRole("checkbox", { name: "나군" }));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    fetchMock.mockClear();
    await act(async () => {
      fireEvent.click(screen.getByRole("checkbox", { name: "다군" }));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const tk = lastTrackKindParam(fetchMock) ?? "";
    const tokens = tk.split(",").sort();
    expect(tokens).toEqual(["jeongsi_da", "jeongsi_ga", "jeongsi_na"]);
  });

  it("P-013 jaeoegukmin 은 /admissions 디폴트 진입점 TrackFilter 에 노출되지 않는다", () => {
    render(<AdmissionsSearchView />);
    expect(screen.queryByRole("checkbox", { name: /재외국민/ })).toBeNull();
  });
});
