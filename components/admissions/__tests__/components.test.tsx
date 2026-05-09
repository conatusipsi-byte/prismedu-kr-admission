/**
 * 컴포넌트 6종 단위 테스트
 *
 * 각 컴포넌트의 props 변화 → onChange 호출, 시각 토큰 검증.
 * P-001 정책 강제 검증은 별도(p-001-policy.test.tsx).
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DepartmentSearchBar } from "../DepartmentSearchBar";
import { AdmissionTrackBadge } from "../AdmissionTrackBadge";
import { RegionFilter } from "../RegionFilter";
import { TrackFilter } from "../TrackFilter";
import { UniversityCategoryFilter } from "../UniversityCategoryFilter";

/* ═══════════════════════════════════════════════════════════════════════
   DepartmentSearchBar
   ═══════════════════════════════════════════════════════════════════════ */

describe("DepartmentSearchBar", () => {
  it("초기 value 표시", () => {
    render(<DepartmentSearchBar value="서울대" onChange={() => {}} />);
    expect((screen.getByLabelText("학과 검색") as HTMLInputElement).value).toBe("서울대");
  });

  it("debounceMs=0 일 때 입력 즉시 onChange 호출", () => {
    const onChange = vi.fn();
    render(<DepartmentSearchBar value="" onChange={onChange} debounceMs={0} />);
    const input = screen.getByLabelText("학과 검색");
    fireEvent.change(input, { target: { value: "고려" } });
    // useEffect 가 1 tick 후 동작 — testing-library가 동기 처리
    expect(onChange).toHaveBeenCalledWith("고려");
  });

  it("Clear 버튼 클릭 시 빈 문자열로 onChange + 로컬 초기화", () => {
    const onChange = vi.fn();
    render(<DepartmentSearchBar value="서울대" onChange={onChange} />);
    const clearBtn = screen.getByLabelText("검색어 지우기");
    fireEvent.click(clearBtn);
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("value 비어있을 때 Clear 버튼 미노출", () => {
    render(<DepartmentSearchBar value="" onChange={() => {}} />);
    expect(screen.queryByLabelText("검색어 지우기")).toBeNull();
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   AdmissionTrackBadge — 7종 + jaeoegukmin 색상 분리
   ═══════════════════════════════════════════════════════════════════════ */

describe("AdmissionTrackBadge", () => {
  it("kind 별 라벨·data-attribute 정확 매핑", () => {
    const { container, rerender } = render(<AdmissionTrackBadge kind="susi_subject" />);
    expect(container.textContent).toContain("학생부교과");
    expect(container.querySelector('[data-track-kind="susi_subject"]')).not.toBeNull();

    rerender(<AdmissionTrackBadge kind="jaeoegukmin" />);
    expect(container.textContent).toContain("재외국민");
  });

  it("jaeoegukmin 색상 토큰이 다른 6종(수시 4 + 정시 3)과 다르다", () => {
    const distinctKinds = [
      "susi_subject", "susi_comprehensive", "susi_essay", "susi_practical",
      "jeongsi_ga", "jeongsi_na", "jeongsi_da",
    ] as const;

    const tokens = new Set<string>();
    for (const kind of distinctKinds) {
      const { container, unmount } = render(<AdmissionTrackBadge kind={kind} />);
      const el = container.querySelector(`[data-track-kind="${kind}"]`);
      tokens.add(el?.getAttribute("data-color-token") ?? "");
      unmount();
    }

    const { container } = render(<AdmissionTrackBadge kind="jaeoegukmin" />);
    const jaeToken = container
      .querySelector('[data-track-kind="jaeoegukmin"]')
      ?.getAttribute("data-color-token") ?? "";

    expect(jaeToken, "jaeoegukmin 토큰이 다른 7종과 다른 색상이어야 함").not.toBe("");
    expect(tokens.has(jaeToken), `jaeoegukmin 토큰 "${jaeToken}" 이 다른 종과 충돌`).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   RegionFilter
   ═══════════════════════════════════════════════════════════════════════ */

describe("RegionFilter", () => {
  it("선택된 region 만 aria-checked=true", () => {
    render(<RegionFilter selected={["seoul"]} onChange={() => {}} />);
    const seoulBtn = screen.getByRole("checkbox", { name: "서울권" });
    const flagBtn = screen.getByRole("checkbox", { name: "거점국립" });
    expect(seoulBtn.getAttribute("aria-checked")).toBe("true");
    expect(flagBtn.getAttribute("aria-checked")).toBe("false");
  });

  it("토글 시 onChange 가 신규 배열로 호출", () => {
    const onChange = vi.fn();
    render(<RegionFilter selected={["seoul"]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "거점국립" }));
    expect(onChange).toHaveBeenCalledWith(["seoul", "national_flag"]);
  });

  it("이미 선택된 region 클릭 시 제거", () => {
    const onChange = vi.fn();
    render(<RegionFilter selected={["seoul", "national_flag"]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "서울권" }));
    expect(onChange).toHaveBeenCalledWith(["national_flag"]);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   TrackFilter — P-013 jaeoegukmin 진입점 분리
   ═══════════════════════════════════════════════════════════════════════ */

describe("TrackFilter", () => {
  it("디폴트 (allowJaeoegukmin=false) 에서는 jaeoegukmin 옵션 미노출", () => {
    render(<TrackFilter selected={[]} onChange={() => {}} />);
    expect(screen.queryByText(/재외국민/)).toBeNull();
  });

  it("allowJaeoegukmin=true 에서만 jaeoegukmin 옵션 노출", () => {
    render(<TrackFilter selected={[]} onChange={() => {}} allowJaeoegukmin={true} />);
    expect(screen.getByText(/재외국민/)).toBeInTheDocument();
  });

  it("선택된 kind 의 aria-checked=true", () => {
    render(<TrackFilter selected={["susi_comprehensive"]} onChange={() => {}} />);
    const btn = screen.getByRole("checkbox", { name: "학생부종합" });
    expect(btn.getAttribute("aria-checked")).toBe("true");
  });

  it("토글 시 onChange 호출", () => {
    const onChange = vi.fn();
    render(<TrackFilter selected={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "논술" }));
    expect(onChange).toHaveBeenCalledWith(["susi_essay"]);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   UniversityCategoryFilter — 단일 선택
   ═══════════════════════════════════════════════════════════════════════ */

describe("UniversityCategoryFilter", () => {
  it("초기 'all' 선택 표시", () => {
    render(<UniversityCategoryFilter selected="all" onChange={() => {}} />);
    expect(screen.getByRole("radio", { name: "전체" }).getAttribute("aria-checked")).toBe("true");
  });

  it("다른 카테고리 클릭 시 onChange 호출 (단일 선택 — 배열 X)", () => {
    const onChange = vi.fn();
    render(<UniversityCategoryFilter selected="all" onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "의약" }));
    expect(onChange).toHaveBeenCalledWith("medical");
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
