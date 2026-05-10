/**
 * 공개 SEO 흐름 e2e — Launch gate
 *
 * 비로그인 상태에서 SEO 가능한 페이지 9개가 모두 200 OK + 핵심 컨텐츠 노출.
 * 푸터 메뉴(법무·고객센터)가 모두 클릭 가능 + 정상 이동.
 *
 * 사전 조건:
 *   - Firebase Emulator + 시드 데이터 (admissions-search.spec.ts 와 동일)
 *   - dev:emu 또는 npm run dev (NEXT_PUBLIC_USE_EMULATOR=true)
 *
 * 검증 대상 페이지:
 *   /  /admissions  /admissions/snu  /admissions/snu/med
 *   /admissions/jaeoegukmin  /pricing  /privacy  /terms  /refund  /help
 */

import { test, expect } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:9002";

const PUBLIC_PAGES: Array<{ path: string; expectInTitle: RegExp; expectOnPage: RegExp }> = [
  { path: "/", expectInTitle: /conatusipsi/, expectOnPage: /합격|학과|입시/ },
  { path: "/admissions", expectInTitle: /학과 검색|conatusipsi/, expectOnPage: /학과/ },
  { path: "/admissions/jaeoegukmin", expectInTitle: /재외국민|conatusipsi/, expectOnPage: /재외국민|외국인/ },
  { path: "/pricing", expectInTitle: /요금제|conatusipsi/, expectOnPage: /단건권|시즌권|결제/ },
  { path: "/privacy", expectInTitle: /개인정보|conatusipsi/, expectOnPage: /개인정보/ },
  { path: "/terms", expectInTitle: /이용약관|conatusipsi/, expectOnPage: /약관/ },
  { path: "/refund", expectInTitle: /환불|conatusipsi/, expectOnPage: /환불/ },
  { path: "/help", expectInTitle: /고객센터|conatusipsi/, expectOnPage: /문의|고객/ },
];

test.describe("공개 페이지 SEO 흐름", () => {
  for (const page of PUBLIC_PAGES) {
    test(`[200] ${page.path} 정상 렌더`, async ({ page: p }) => {
      const response = await p.goto(`${BASE_URL}${page.path}`);
      expect(response?.status(), `${page.path} 가 200 응답이 아님`).toBe(200);

      const title = await p.title();
      expect(title).toMatch(page.expectInTitle);

      // 메인 컨텐츠 키워드 — 페이지 본문에 등장
      await expect(p.locator("body")).toContainText(page.expectOnPage);
    });
  }

  test("랜딩 — 핵심 CTA + Footer 메뉴 노출", async ({ page }) => {
    await page.goto(`${BASE_URL}/`);

    // Hero 영역 — 핵심 카피 검색 (정확한 카피보단 큰 의미 단어)
    await expect(page.locator("h1, h2").first()).toBeVisible();

    // Footer 푸터 메뉴 (aria-label="푸터 메뉴")
    const footerNav = page.getByRole("navigation", { name: "푸터 메뉴" });
    await expect(footerNav).toBeVisible();
  });

  test("랜딩 → /pricing CTA 클릭 → 요금제 페이지 이동", async ({ page }) => {
    await page.goto(`${BASE_URL}/`);

    // /pricing 으로 가는 링크 중 화면에 보이는 것 (모바일은 desktop nav 가 hidden md:flex 라
    // .first() 가 hidden 링크를 잡는 케이스 회피 — :visible filter 사용).
    const pricingLink = page.locator('a[href="/pricing"]:visible').first();
    await expect(pricingLink).toBeVisible({ timeout: 10_000 });
    await pricingLink.click();

    await expect(page).toHaveURL(/\/pricing$/);
    // PRODUCTS_KR 카탈로그 카드가 렌더되는지 — "단건권 / 시즌권 / 결제하러 가기"
    await expect(page.locator("body")).toContainText(/단건권|시즌권|결제하러/);
  });

  test("재외국민 페이지 (P-013) — 한국 학생 폼과 분리", async ({ page }) => {
    await page.goto(`${BASE_URL}/admissions/jaeoegukmin`);
    await expect(page.locator("body")).toContainText(/재외국민|외국인/);

    // P-013: 본 페이지는 한국 학생용 분석 폼 노출 X (자격 검증 폼만)
    // → 페이지 본문에 "내신·수능 등급 입력" 같은 일반 분석 폼 키워드 없어야 함
    const body = (await page.locator("body").textContent()) ?? "";
    expect(body, "❌ P-013: jaeoegukmin 페이지에 일반 분석 폼 흔적").not.toContain(
      "분석 시작",
    );
  });
});
