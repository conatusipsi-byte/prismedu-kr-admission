/**
 * TrackFilter 특별전형 그룹 회귀 (2026-06-13).
 *
 * - onSpecialChange 제공 시에만 "특별전형" 그룹(농어촌/기회균형/특성화) 렌더.
 * - 미제공(기존 사용처)이면 특별 그룹 미노출 — 기존 동작 불변.
 * - 칩 클릭 → onSpecialChange 로 토글된 배열 전달.
 */

import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { TrackFilter } from "../TrackFilter";

describe("TrackFilter 특별전형 그룹", () => {
  it("onSpecialChange 미제공 → 특별 그룹 미노출 (기존 동작)", () => {
    const { container } = render(<TrackFilter selected={[]} onChange={() => {}} />);
    expect(container.querySelector('[data-track-group="special"]')).toBeNull();
    expect(container.querySelectorAll("[data-special-type]").length).toBe(0);
  });

  it("onSpecialChange 제공 → 특별 그룹 3종 노출", () => {
    const { container } = render(
      <TrackFilter selected={[]} onChange={() => {}} specialSelected={[]} onSpecialChange={() => {}} />,
    );
    expect(container.querySelector('[data-track-group="special"]')).not.toBeNull();
    expect(container.querySelectorAll("[data-special-type]").length).toBe(3);
  });

  it("칩 클릭 → onSpecialChange 토글", () => {
    const onSpecialChange = vi.fn();
    const { container } = render(
      <TrackFilter selected={[]} onChange={() => {}} specialSelected={[]} onSpecialChange={onSpecialChange} />,
    );
    const agri = container.querySelector('[data-special-type="agricultural"]') as HTMLElement;
    fireEvent.click(agri);
    expect(onSpecialChange).toHaveBeenCalledWith(["agricultural"]);
  });

  it("이미 선택된 칩 클릭 → 해제", () => {
    const onSpecialChange = vi.fn();
    const { container } = render(
      <TrackFilter
        selected={[]}
        onChange={() => {}}
        specialSelected={["agricultural"]}
        onSpecialChange={onSpecialChange}
      />,
    );
    const agri = container.querySelector('[data-special-type="agricultural"]') as HTMLElement;
    expect(agri.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(agri);
    expect(onSpecialChange).toHaveBeenCalledWith([]);
  });
});
