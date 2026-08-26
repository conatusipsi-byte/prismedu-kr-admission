/**
 * PublicNav — 다크모드 버튼 회귀 (BUG-024, 2026-05-25).
 *
 * 결함: outline 버튼 (대시보드 / 로그인 / 프로필) 이 다크모드에서 흰색 배경 잔존.
 *      디자인 일관성을 위해 명시적 dark variant 추가.
 *
 * 검증:
 *   - logged-out 상태: 로그인 버튼에 dark:bg-transparent + dark:border-border
 *   - logged-in 상태 (별도 test file 분리): 대시보드 버튼에 동일 dark variant
 *   - primary 버튼 ("무료로 시작") 은 별도 dark variant 자동 분기라 변경 X
 *
 * jsdom 한계: 실 다크모드 렌더링 불가. className 검증으로 가드.
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

describe("PublicNav — BUG-024 다크모드 outline 버튼 (logged-out)", () => {
  it("로그인 버튼 (desktop): dark:bg-transparent + dark:border-border + hover variant", async () => {
    const { container } = render(<PublicNav />);
    const loginLinks = container.querySelectorAll('a[href="/login"]') as NodeListOf<HTMLElement>;
    expect(loginLinks.length, "로그인 버튼 미노출").toBeGreaterThan(0);
    // desktop 로그인 버튼 + 모바일 메뉴의 로그인 버튼 둘 다 검증
    for (const link of Array.from(loginLinks)) {
      const cls = link.className;
      expect(cls).toContain("dark:bg-transparent");
      expect(cls).toContain("dark:border-border");
      expect(cls).toContain("dark:hover:bg-accent");
    }
  });

  it("primary '무료로 시작' 버튼은 outline 아님 — 본 fix 영향 X (회귀 가드)", async () => {
    const { container } = render(<PublicNav />);
    const startLink = container.querySelector('a[href="/login?returnUrl=/onboarding"]') as HTMLElement;
    expect(startLink).not.toBeNull();
    // primary variant: 자체 dark variant 보유 (bg-brand-500 dark)
    const cls = startLink.className;
    expect(cls).toContain("bg-brand-600"); // primary base
    // outline 의 dark:bg-transparent 는 적용되면 안 됨 (다른 variant)
    expect(cls).not.toContain("dark:bg-transparent");
  });
});
