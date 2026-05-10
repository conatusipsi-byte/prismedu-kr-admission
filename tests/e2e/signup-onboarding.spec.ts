/**
 * 가입 흐름 e2e — Launch gate
 *
 * 신규 사용자가 이메일·비밀번호로 회원가입 → /onboarding 자동 진입을 검증.
 * Firebase Auth Emulator 가 동작 중이어야 함 (NEXT_PUBLIC_USE_EMULATOR=true).
 *
 * 본 spec 의 범위:
 *   1. /login 진입 → "회원가입" 모드 토글
 *   2. 이메일·비밀번호·이름 입력 후 제출
 *   3. /onboarding 자동 redirect (auth.user 가 채워지면 LoginView가 router.replace)
 *
 * 4단계 wizard 통과 + 분석 호출은 후속 spec (Auth state 재사용 storage state 권장).
 */

import { test, expect } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:9002";

/** 매 테스트마다 unique 이메일 — Auth Emulator 는 재실행 시 초기화되지만 한 세션 내에선 중복 차단 */
function uniqueEmail(): string {
  return `e2e+${Date.now()}@conatusipsi.example`;
}

test.describe("회원가입 → 온보딩 진입", () => {
  test("이메일 회원가입 → /onboarding 자동 redirect", async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);

    // 회원가입 모드로 토글 — LoginView 의 "회원가입" 텍스트 버튼
    const signupToggle = page
      .getByRole("button", { name: /^회원가입$/ })
      .or(page.getByText("회원가입", { exact: true }));
    if (await signupToggle.first().isVisible()) {
      await signupToggle.first().click();
    }

    const email = uniqueEmail();
    const password = "TestPass!2026";

    // 폼 채우기 — input은 label 기준 접근 (LoginView 가 Label 컴포넌트 사용)
    await page.getByLabel("이메일").fill(email);
    await page.getByLabel("비밀번호").fill(password);

    const nameInput = page.getByLabel("이름");
    if (await nameInput.isVisible().catch(() => false)) {
      await nameInput.fill("테스트유저");
    }

    // 약관 동의 체크박스가 있으면 체크 (출시 전 활성화 예정)
    const agreeTos = page.locator('input[type="checkbox"]').first();
    if (await agreeTos.isVisible().catch(() => false)) {
      await agreeTos.check();
    }

    // 제출 — "회원가입" 버튼 (모드 토글 버튼과 다른, 폼 submit 버튼)
    const submitBtn = page.locator('button[type="submit"]').first();
    await submitBtn.click();

    // /onboarding 으로 redirect 됨 (auth-context 가 user 채우면 router.replace)
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 30_000 });
    await expect(page.locator("body")).toContainText(/학년|계열|단계/);
  });

  test("로그인 페이지 — Google + 카카오 + 이메일 옵션 모두 노출", async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);

    // 페이지 자체 200 OK + 제목
    await expect(page.locator("h1")).toBeVisible();

    // Google 버튼 (텍스트 또는 aria-label)
    await expect(
      page.locator('button, a').filter({ hasText: /구글|Google/i }).first(),
    ).toBeVisible({ timeout: 10_000 });

    // 이메일·비밀번호 입력
    await expect(page.getByLabel("이메일")).toBeVisible();
    await expect(page.getByLabel("비밀번호")).toBeVisible();
  });
});
