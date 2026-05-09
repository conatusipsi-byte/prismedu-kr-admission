/**
 * Playwright e2e 설정
 *
 * 실행 전제:
 *   - Java JRE 11+ 설치 (Firebase Emulator 의존)
 *   - npx playwright install --with-deps chromium 한 번 실행
 *
 * 동작:
 *   - webServer: dev:emu 가 Emulator + 시드 + dev 서버 동시 실행 (scripts/dev-with-emulator.{sh,ps1})
 *   - baseURL: http://localhost:9002 (Next.js dev port)
 *   - reuseExistingServer: 사용자 환경에서 이미 dev:emu 실행 중이면 그대로 사용
 *
 * CI 통합:
 *   - 별도 워크플로 .github/workflows/e2e.yml 에서 실행 (smoke test 4단계와 분리)
 *   - 사용자 결정 (작업 3.4): 옵션 A 채택 — npm run test:e2e 로 분리 실행
 */

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false, // Emulator 단일 인스턴스 공유
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // Firestore Emulator state 공유 — 직렬 실행
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:9002",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
  },

  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium-mobile",
      use: { ...devices["Pixel 7"] },
    },
  ],

  // dev:emu 가 Emulator + 시드 + dev 서버 동시 실행
  webServer: process.env.E2E_BASE_URL
    ? undefined // 외부 URL 사용 시 자체 서버 안 띄움 (staging 검증)
    : {
        command:
          process.platform === "win32"
            ? "npm run dev:emu"
            : "bash ./scripts/dev-with-emulator.sh",
        url: "http://localhost:9002",
        reuseExistingServer: !process.env.CI,
        timeout: 180_000, // Emulator + 시드 + Next 빌드 합산 — 3분
        stdout: "pipe",
        stderr: "pipe",
      },
});
