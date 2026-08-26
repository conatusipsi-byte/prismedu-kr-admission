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

/*
 * 모듈 로드는 테스트 본문이 아니라 **파일 import 단계**에서 1회만 수행한다.
 *   - 기존엔 각 it() 안에서 `await import(...)` 했는데, 첫 테스트가 모듈 그래프 전체의
 *     콜드 트랜스폼(측정 ~5.9s)을 떠안아 testTimeout 5000ms 를 넘겼다.
 *   - 더 나쁜 건 연쇄 오염: 타임아웃된 test 본문은 중단되지 않고 계속 실행돼
 *     cleanup 이후에 render() 가 뒤늦게 실행 → 다음 테스트에서 "Found multiple elements".
 *   - top-level await 로 옮기면 로드 비용이 testTimeout 대상에서 빠지고 고아 렌더도 사라진다.
 *   - vi.mock 은 트랜스폼 단계에서 이 위로 hoist 되므로 모킹은 그대로 적용된다.
 */
const { PublicNav } = await import("../PublicNav");

describe("PublicNav NAV_ITEMS (BUG-028)", () => {
  it("헤더 메뉴 — 학과 검색 / 요금제 / 도움말 3개만", async () => {
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
    const { container } = render(<PublicNav />);
    const navChangelog = Array.from(container.querySelectorAll('nav a[href="/changelog"]'));
    expect(navChangelog).toHaveLength(0);
  });
});
