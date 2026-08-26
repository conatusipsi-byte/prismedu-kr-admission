import { defineConfig } from "vitest/config";
import { resolve } from "path";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    // 기본 5000ms 로는 무거운 View 통합 테스트(AdmissionsSearchView 등)가
    // **병렬 실행 경합** 때문에 간헐 타임아웃 → flaky. 무한 대기가 아니라 순수 속도 문제:
    // 단독 실행 시 최초 테스트 ~1.3s 인데 전체 스위트 동시 실행에선 5s 를 넘긴다.
    // (측정 근거: 2026-08-26, region-filter-integration 단독 7/7 통과 3.83s)
    // 타임아웃은 "행(hang) 감지" 용도로만 남기고 여유를 준다.
    testTimeout: 20000,
    hookTimeout: 20000,
    // 신규 프로젝트는 src/ 미사용 — 루트의 lib/, app/, components/ 기준.
    // scripts/**는 기본 exclude이지만 scripts/etl/**/__tests__는 명시적 include
    // (Day 9 ETL 파서 회귀 — 외부 도구 의존성 없는 pure 함수만 테스트).
    include: [
      "lib/**/*.{test,spec}.{ts,tsx}",
      "lib/**/__tests__/**/*.{ts,tsx}",
      "app/**/*.{test,spec}.{ts,tsx}",
      "app/**/__tests__/**/*.{ts,tsx}",
      "components/**/*.{test,spec}.{ts,tsx}",
      "components/**/__tests__/**/*.{ts,tsx}",
      "scripts/etl/**/__tests__/**/*.{ts,tsx}",
    ],
    exclude: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "scripts/firestore/**",
      "scripts/dev-with-emulator*",
      "scripts/update-track-vocab-fixtures.ts",
      "_prism_reference/**",
      "**/fixtures/**", // fixtures/* 는 데이터 파일, 실행 X
    ],
    coverage: {
      reporter: ["text", "html"],
      include: ["lib/**", "app/api/**", "components/**"],
    },
  },
  resolve: {
    // tsconfig.json의 path alias를 native로 인식
    tsconfigPaths: true,
    alias: {
      // @/* alias — 신규 프로젝트 루트 기반
      "@": resolve(__dirname, "./"),
      // server-only 패키지는 클라이언트에서 import 차단용. 테스트(Node)에선 무해한 빈 모듈로 대체.
      "server-only": resolve(__dirname, "vitest.server-only-stub.ts"),
    },
  },
});
