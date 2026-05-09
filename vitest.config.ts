import { defineConfig } from "vitest/config";
import { resolve } from "path";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
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
