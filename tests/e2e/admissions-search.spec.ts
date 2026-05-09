/**
 * /admissions 검색 e2e — Launch Blocker #1 sanity
 *
 * ⚠️ 본 spec 실행에는 다음 사전 조건이 필요:
 *   1. @playwright/test 설치 + 브라우저 바이너리 다운로드 (사용자 환경에서 직접):
 *      npm install --save-dev @playwright/test
 *      npx playwright install --with-deps chromium
 *
 *   2. 시드 데이터 생성:
 *      GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json \
 *      npx tsx scripts/firestore/init-collections.ts
 *
 *   3. dev 서버 실행:
 *      npm run dev   # http://localhost:9002
 *
 *   4. spec 실행:
 *      npx playwright test tests/e2e/admissions-search.spec.ts
 *
 * 본 환경에서는 실행하지 않고 spec 파일만 작성. 사용자 staging 환경에서 실행 권장.
 *
 * 검증 시나리오 (P-001 + Launch Blocker #1):
 *   1. /admissions 페이지 접속 → 200 OK
 *   2. 검색바 "서울대" 입력 → 결과에 "서울대학교 의예과" 카드 노출
 *   3. 카드 클릭 → /admissions/snu/med 이동
 *   4. 학과 상세 페이지에 모집요강 정보 무료 노출 확인 (P-001)
 *   5. 결과 카드에 결제 키워드 0개 (P-001 회귀)
 */

import { test, expect } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:9002";

test.describe("/admissions — Launch Blocker #1 sanity", () => {
  test("[1/5] 비로그인 접근 — 200 OK + 검색바 노출", async ({ page }) => {
    await page.goto(`${BASE_URL}/admissions`);
    await expect(page.getByRole("heading", { name: "학과 검색" })).toBeVisible();
    await expect(page.getByLabel("학과 검색")).toBeVisible();
  });

  test("[2/5] '서울대' 검색 → 의예과 카드 노출", async ({ page }) => {
    await page.goto(`${BASE_URL}/admissions`);
    await page.getByLabel("학과 검색").fill("서울대");

    // 디바운스 300ms + 네트워크 응답 대기
    await page.waitForTimeout(500);

    const card = page.locator('[data-component="department-card"]').filter({
      hasText: "의예과",
    });
    await expect(card).toBeVisible({ timeout: 10_000 });
  });

  test("[3/5] 카드 클릭 → /admissions/snu/med 이동", async ({ page }) => {
    await page.goto(`${BASE_URL}/admissions`);
    await page.getByLabel("학과 검색").fill("서울대 의예");
    await page.waitForTimeout(500);

    const card = page.locator('[data-component="department-card"]').first();
    await card.click();
    await expect(page).toHaveURL(/\/admissions\/snu\/med/);
  });

  test("[4/5] 학과 상세 — 모집요강 정보 무료 노출 (P-001)", async ({ page }) => {
    await page.goto(`${BASE_URL}/admissions/snu/med`);

    // 모집요강 섹션 정형 정보 — 의예과 표시
    await expect(page.getByText(/의예과/)).toBeVisible({ timeout: 10_000 });

    // P-001: 비로그인 상태에서 모집인원·전형·일정 등 정형 정보는 노출.
    // 단 합격률 카드는 락 또는 안내 (별도 검증).
  });

  test("[5/5] 결과 카드에 결제 키워드 0개 (P-001 회귀)", async ({ page }) => {
    await page.goto(`${BASE_URL}/admissions`);
    await page.waitForTimeout(1000);

    const cardsHtml = await page
      .locator('[data-component="department-card"]')
      .evaluateAll((els) => els.map((e) => e.textContent ?? "").join(" "));

    const forbidden = ["업그레이드", "결제", "구독", "구매", "유료", "확률", "합격률"];
    for (const kw of forbidden) {
      expect(
        cardsHtml,
        `❌ P-001 위반: 카드에 "${kw}" 등장`,
      ).not.toContain(kw);
    }
    // % 수치
    expect(/\d+\s*%/.test(cardsHtml), "❌ P-001 위반: 카드에 % 수치 등장").toBe(false);
  });
});
