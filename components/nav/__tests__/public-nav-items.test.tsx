/**
 * PublicNav NAV_ITEMS — BUG-028 회귀 (2026-05-25).
 *
 * 결함: "변경 사항" (changelog) 메뉴가 헤더에 학과 검색·요금제와 동급 — 일반 사용자
 *      (고등학생·학부모) 우선순위에 어색.
 *
 * 수정: 헤더에서 제거 (Footer 보존).
 */

import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: null, profile: null, loading: false, logout: vi.fn() }),
}));

describe("PublicNav NAV_ITEMS (BUG-028)", () => {
  it("헤더 메뉴 — 학과 검색 / 요금제 / 도움말 3개만", async () => {
    const { PublicNav } = await import("../PublicNav");
    const { container } = render(<PublicNav />);
    // desktop ul 안의 nav links
    const navLinks = Array.from(container.querySelectorAll('ul a[href]')) as HTMLAnchorElement[];
    const labels = navLinks.map((a) => a.textContent?.trim());
    expect(labels).toContain("학과 검색");
    expect(labels).toContain("요금제");
    expect(labels).toContain("도움말");
    // "변경 사항" 헤더 미노출 — BUG-028 회귀 가드
    expect(labels).not.toContain("변경 사항");
  });

  it("/changelog 링크가 헤더 네비에 부재 (footer 만 보유)", async () => {
    const { PublicNav } = await import("../PublicNav");
    const { container } = render(<PublicNav />);
    const navChangelog = Array.from(container.querySelectorAll('nav a[href="/changelog"]'));
    expect(navChangelog).toHaveLength(0);
  });
});
