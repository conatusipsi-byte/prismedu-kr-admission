/**
 * Pro 게이트 e2e — Launch gate
 *
 * Free 사용자(또는 비로그인)가 Pro 전용 페이지 4개를 방문하면 ProGate 잠금 카드 +
 * "요금제 보기" CTA 가 노출됨. 실 Pro 컨텐츠가 누설되지 않음.
 *
 * 검증 대상:
 *   /compare  /what-if  /planner  /spec-analysis
 *
 * Pro 사용자 잠금 해제 검증은 후속 PR (테스트 사용자에 entitlement seed 필요).
 */

import { test, expect } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:9002";

const PRO_PAGES: Array<{ path: string; feature: RegExp }> = [
  { path: "/compare", feature: /비교/ },
  { path: "/what-if", feature: /시뮬레이터|what-if|What-If|가정/ },
  { path: "/planner", feature: /플래너|task|일정/ },
  { path: "/spec-analysis", feature: /스펙|비교과/ },
];

test.describe("Pro 게이트 잠금 검증", () => {
  for (const p of PRO_PAGES) {
    test(`[Free 잠금] ${p.path} → ProGate 노출`, async ({ page }) => {
      const response = await page.goto(`${BASE_URL}${p.path}`);
      expect(response?.status()).toBe(200); // 잠금이지 라우팅 거부 X

      // ProGate 의 핵심 라벨 — "Pro 전용 기능" 배지
      await expect(page.locator("body")).toContainText(/Pro 전용 기능/);

      // 페이지 자체 feature 카피
      await expect(page.locator("body")).toContainText(p.feature);

      // CTA — /pricing 링크 (mobile 에서 desktop nav 가 hidden 인 케이스 대비 :visible)
      const pricingCta = page.locator('a[href="/pricing"]:visible').first();
      await expect(pricingCta).toBeVisible({ timeout: 10_000 });
    });
  }

  test("Pro 페이지 → /pricing 이동 + 요금제 노출", async ({ page }) => {
    await page.goto(`${BASE_URL}/compare`);
    const pricingCta = page.locator('a[href="/pricing"]:visible').first();
    await pricingCta.click();
    await expect(page).toHaveURL(/\/pricing$/);
    // PRODUCTS_KR 카드가 노출 — 단건권/시즌권 텍스트
    await expect(page.locator("body")).toContainText(/단건권|시즌권/);
    await expect(page.locator("body")).toContainText(/결제하러|결제/);
  });

  test("Pro 페이지 본문에 실 분석 결과 누설 없음 (P-001 회귀)", async ({ page }) => {
    // 잠금 상태에서 모든 Pro 페이지에 합격률·확률 같은 결과 데이터가 노출되면 안 됨
    for (const p of PRO_PAGES) {
      await page.goto(`${BASE_URL}${p.path}`);
      const body = (await page.locator("body").textContent()) ?? "";

      // 결과 페이지에서나 노출되어야 할 키워드 — 잠금 상태엔 등장 X
      expect(body, `❌ ${p.path} 잠금 상태에 분석 결과 키워드 등장`).not.toMatch(
        /합격 가능성\s*\d+\s*%/,
      );
      // % 수치 — 게이지 / 표 등으로 노출되면 안 됨 (요금제 카드의 17% 같은 정상 케이스는 별 검증)
    }
  });
});
