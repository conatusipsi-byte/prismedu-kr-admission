/**
 * HighSchoolAutocomplete — 자동완성 UI 회귀 테스트.
 *
 * debounceMs=0 으로 즉시 fetch 발화 — fake timer 의존 제거.
 */

import * as React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { HighSchoolAutocomplete } from "../HighSchoolAutocomplete";
import type { NeisHighSchool } from "@/lib/api/neis";

const SAMPLE: NeisHighSchool[] = [
  { code: "S1", name: "서울고등학교", region: "서울특별시", office: "서울특별시교육청", kind: "고등학교" },
  { code: "S2", name: "서울과학고등학교", region: "서울특별시", office: "서울특별시교육청", kind: "고등학교" },
];

function mockFetchOk(results: NeisHighSchool[]): ReturnType<typeof vi.fn> {
  const spy = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ source: "neis", results }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HighSchoolAutocomplete", () => {
  it("2자 미만 입력 시 fetch 호출 X", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    render(<HighSchoolAutocomplete value="" onSelect={() => {}} debounceMs={0} />);
    const input = screen.getByLabelText("고등학교 자동완성");
    fireEvent.change(input, { target: { value: "서" } });
    await new Promise((r) => setTimeout(r, 30));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("2자 이상 입력 → /api/neis/highschools 호출 + 결과 렌더", async () => {
    const fetchSpy = mockFetchOk(SAMPLE);
    render(<HighSchoolAutocomplete value="" onSelect={() => {}} debounceMs={0} />);
    const input = screen.getByLabelText("고등학교 자동완성");
    fireEvent.change(input, { target: { value: "서울" } });

    await waitFor(() => {
      expect(screen.getByText("서울고등학교")).toBeInTheDocument();
      expect(screen.getByText("서울과학고등학교")).toBeInTheDocument();
    });
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain("/api/neis/highschools");
    expect(url).toContain(encodeURIComponent("서울"));
  });

  it("옵션 클릭 시 onSelect 호출", async () => {
    mockFetchOk(SAMPLE);
    const onSelect = vi.fn();
    render(<HighSchoolAutocomplete value="" onSelect={onSelect} debounceMs={0} />);
    const input = screen.getByLabelText("고등학교 자동완성");
    fireEvent.change(input, { target: { value: "서울" } });
    await waitFor(() => screen.getByText("서울과학고등학교"));
    fireEvent.click(screen.getByText("서울과학고등학교"));
    expect(onSelect).toHaveBeenCalledWith(SAMPLE[1]);
  });

  it("↓ + Enter 키보드 네비게이션으로 선택", async () => {
    mockFetchOk(SAMPLE);
    const onSelect = vi.fn();
    render(<HighSchoolAutocomplete value="" onSelect={onSelect} debounceMs={0} />);
    const input = screen.getByLabelText("고등학교 자동완성");
    fireEvent.change(input, { target: { value: "서울" } });
    await waitFor(() => screen.getByText("서울과학고등학교"));
    // 첫 row 가 activeIdx=0 — Enter 누르면 SAMPLE[0]
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(SAMPLE[0]);
  });

  it("결과 없음 → '검색 결과 없음' 메시지", async () => {
    mockFetchOk([]);
    render(<HighSchoolAutocomplete value="" onSelect={() => {}} debounceMs={0} />);
    const input = screen.getByLabelText("고등학교 자동완성");
    fireEvent.change(input, { target: { value: "없는학교" } });
    await waitFor(() => {
      expect(screen.getByText("검색 결과 없음")).toBeInTheDocument();
    });
  });

  it("출처 'NEIS' 표시 (P-002 정직성)", async () => {
    mockFetchOk(SAMPLE);
    render(<HighSchoolAutocomplete value="" onSelect={() => {}} debounceMs={0} />);
    const input = screen.getByLabelText("고등학교 자동완성");
    fireEvent.change(input, { target: { value: "서울" } });
    await waitFor(() => screen.getByText("서울고등학교"));
    expect(screen.getByText(/출처:.*NEIS/)).toBeInTheDocument();
  });
});
