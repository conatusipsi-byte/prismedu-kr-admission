/**
 * MyBookingsView — BUG-023 회귀 (2026-05-25).
 *
 * 결함:
 *   ① defaultValue가 upcoming 비었을 때 "past" 로 fallback → "완료" 탭 활성
 *   ② 컨테이너 mx-auto 누락 → 좌측 상단 쏠림
 *
 * 수정:
 *   - tab 초기값 = "upcoming" 항상
 *   - mx-auto max-w-content + px-gutter
 *   - upcoming 빈 상태에 "컨설팅 예약하기" CTA
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MyBookingsView } from "../MyBookingsView";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe("MyBookingsView (BUG-023)", () => {
  it("BUG-023 ①: 첫 진입 — upcoming 비었어도 'upcoming' 탭 활성 (기존 fallback to 'past' 회귀)", () => {
    render(<MyBookingsView upcoming={[]} past={[]} cancelled={[]} loadError={null} />);
    const upcomingBtn = screen.getByRole("tab", { name: /예정/ });
    const pastBtn = screen.getByRole("tab", { name: /완료/ });
    expect(upcomingBtn.getAttribute("aria-selected")).toBe("true");
    expect(pastBtn.getAttribute("aria-selected")).toBe("false");
  });

  it("BUG-023 ①: past 가 비어있지 않아도 첫 탭은 upcoming", () => {
    const pastItem = {
      id: "p1",
      status: "completed" as const,
      slotStartAt: "2025-05-01T10:00:00Z",
      slotEndAt: "2025-05-01T11:00:00Z",
      durationMinutes: 60,
      application: null,
      cancelledAt: null,
      cancellationReason: null,
      createdAt: "2025-05-01T00:00:00Z",
    };
    render(<MyBookingsView upcoming={[]} past={[pastItem]} cancelled={[]} loadError={null} />);
    const upcomingBtn = screen.getByRole("tab", { name: /예정/ });
    expect(upcomingBtn.getAttribute("aria-selected")).toBe("true");
  });

  it("BUG-023 ②: 컨테이너에 mx-auto + max-w-content 적용 (좌측 쏠림 차단)", () => {
    const { container } = render(
      <MyBookingsView upcoming={[]} past={[]} cancelled={[]} loadError={null} />,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain("mx-auto");
    expect(root.className).toContain("max-w-content");
  });

  it("BUG-023 추가: upcoming 빈 상태에 '컨설팅 예약하기' CTA + /consulting 링크", () => {
    const { container } = render(
      <MyBookingsView upcoming={[]} past={[]} cancelled={[]} loadError={null} />,
    );
    const cta = container.querySelector('[data-element="empty-state-cta"]');
    expect(cta, "empty state CTA 미노출").not.toBeNull();
    expect(cta!.textContent).toContain("컨설팅 예약하기");
    // Button asChild → <a> 가 cta 자체. href 직접 확인.
    expect(cta!.getAttribute("href")).toBe("/consulting");
  });

  it("past 탭 / cancelled 탭 빈 상태엔 CTA 미노출 (upcoming 한정)", async () => {
    const user = await import("@testing-library/user-event").then((m) => m.default.setup());
    const { container } = render(
      <MyBookingsView upcoming={[]} past={[]} cancelled={[]} loadError={null} />,
    );
    await user.click(screen.getByRole("tab", { name: /완료/ }));
    expect(container.querySelector('[data-element="empty-state-cta"]')).toBeNull();
    await user.click(screen.getByRole("tab", { name: /취소/ }));
    expect(container.querySelector('[data-element="empty-state-cta"]')).toBeNull();
  });
});
