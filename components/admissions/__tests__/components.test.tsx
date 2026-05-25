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
    const nationalBtn = screen.getByRole("checkbox", { name: "지방국립" });
    expect(seoulBtn.getAttribute("aria-checked")).toBe("true");
    expect(nationalBtn.getAttribute("aria-checked")).toBe("false");
  });

  it("토글 시 onChange 가 신규 배열로 호출", () => {
    const onChange = vi.fn();
    render(<RegionFilter selected={["seoul"]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "지방국립" }));
    expect(onChange).toHaveBeenCalledWith(["seoul", "national"]);
  });

  it("이미 선택된 region 클릭 시 제거", () => {
    const onChange = vi.fn();
    render(<RegionFilter selected={["seoul", "national"]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "서울권" }));
    expect(onChange).toHaveBeenCalledWith(["national"]);
  });

  it("v2: 지방사립 필터에 서울권·과기원·경기권이 노출되지 않는다 (REGION_GROUP_TO_CATEGORIES 매핑 검증)", async () => {
    // private_local 그룹 = ["private_local"] 단일 매핑이어야 함.
    // 만약 ["seoul"] / ["special"] / ["gyeonggi"] 가 섞이면 회귀.
    const { REGION_GROUP_TO_CATEGORIES } = await import("@/lib/admission/labels");
    expect(REGION_GROUP_TO_CATEGORIES.private_local).toEqual(["private_local"]);
    expect(REGION_GROUP_TO_CATEGORIES.special).toEqual(["special"]);
    expect(REGION_GROUP_TO_CATEGORIES.seoul).toEqual(["seoul"]);
    expect(REGION_GROUP_TO_CATEGORIES.gyeonggi).toEqual(["gyeonggi"]);
    expect(REGION_GROUP_TO_CATEGORIES.national).toEqual(["national"]);
  });

  it("v2: military 카테고리는 RegionFilter 에 노출되지 않는다 (UI 숨김)", () => {
    render(<RegionFilter selected={[]} onChange={() => {}} />);
    expect(screen.queryByRole("checkbox", { name: "사관학교" })).toBeNull();
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

describe("UniversityCategoryFilter (v2 multi-select 그룹 칩)", () => {
  it("초기 빈 배열 = 전체 선택 표시", () => {
    render(<UniversityCategoryFilter selected={[]} onChange={() => {}} />);
    expect(screen.getByRole("checkbox", { name: "전체" }).getAttribute("aria-checked")).toBe("true");
  });

  it("개별 옵션 클릭 시 multi-select 토글", () => {
    const onChange = vi.fn();
    render(<UniversityCategoryFilter selected={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "인문" }));
    expect(onChange).toHaveBeenCalledWith(["humanities"]);
  });

  it("그룹 헤더 클릭 시 그룹 내 모든 옵션 토글", () => {
    const onChange = vi.fn();
    render(<UniversityCategoryFilter selected={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "문과대학" }));
    // 그룹 헤더 = humanities/social/language/business 4개 일괄 활성
    const calledWith = onChange.mock.calls[0][0] as string[];
    expect(new Set(calledWith)).toEqual(new Set(["humanities", "social", "language", "business"]));
  });

  it("메디컬 그룹: 5개 칩 표시 (의예/치의예/한의예/약학/수의예)", () => {
    render(<UniversityCategoryFilter selected={[]} onChange={() => {}} />);
    expect(screen.getByRole("checkbox", { name: "의예" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "치의예" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "한의예" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "약학" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "수의예" })).toBeInTheDocument();
  });

  it("'전체' 클릭 시 모든 카테고리 해제 (빈 배열)", () => {
    const onChange = vi.fn();
    render(<UniversityCategoryFilter selected={["humanities", "social"]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "전체" }));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   TrackFilter — 3그룹 레이아웃 (주요·정시·기타)
   ═══════════════════════════════════════════════════════════════════════ */

describe("TrackFilter (v2 그룹 레이아웃)", () => {
  it("주요 그룹: 학생부교과·학생부종합·논술 노출", () => {
    render(<TrackFilter selected={[]} onChange={() => {}} />);
    expect(screen.getByRole("checkbox", { name: "학생부교과" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "학생부종합" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "논술" })).toBeInTheDocument();
  });

  it("정시 그룹: 가군·나군·다군 노출", () => {
    render(<TrackFilter selected={[]} onChange={() => {}} />);
    expect(screen.getByRole("checkbox", { name: "가군" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "나군" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "다군" })).toBeInTheDocument();
  });

  it("기타 그룹: 실기·추가모집 노출", () => {
    render(<TrackFilter selected={[]} onChange={() => {}} />);
    expect(screen.getByRole("checkbox", { name: "실기" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "추가모집" })).toBeInTheDocument();
  });
});
