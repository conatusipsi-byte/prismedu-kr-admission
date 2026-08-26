/**
 * PublicNav — BUG-024 logged-in 사용자의 대시보드 버튼 다크모드 회귀.
 *
 * 별도 file 인 이유: 같은 module 의 useAuth mock 을 logged-out (기본) vs logged-in
 * 두 케이스로 분리해야 vi.mock 충돌 없음.
 */

import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: { email: "test@example.com", user_metadata: { name: "Test" } },
    profile: { name: "Test", plan: "free" },
    loading: false,
    logout: vi.fn(),
  }),
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

describe("PublicNav — BUG-024 logged-in 대시보드 버튼", () => {
  it("대시보드 버튼 (desktop): dark:bg-transparent + dark:border-border + hover variant", async () => {
    const { container } = render(<PublicNav />);
    const dashboardLinks = container.querySelectorAll('a[href="/dashboard"]') as NodeListOf<HTMLElement>;
    expect(dashboardLinks.length, "대시보드 버튼 미노출").toBeGreaterThan(0);
    // desktop outline (sm) + 모바일 primary (xl) 둘 다 a 태그로 존재.
    // outline 버튼만 dark:bg-transparent. primary 는 없음 (회귀 가드).
    let outlineCount = 0;
    for (const link of Array.from(dashboardLinks)) {
      const cls = link.className;
      if (cls.includes("dark:bg-transparent")) {
        outlineCount += 1;
        expect(cls).toContain("dark:border-border");
        expect(cls).toContain("dark:hover:bg-accent");
      }
    }
    // 최소 1개 (desktop) — 모바일 dashboard 는 primary 라 dark variant X
    expect(outlineCount, "대시보드 outline 버튼 dark variant 미적용").toBeGreaterThanOrEqual(1);
  });
});
