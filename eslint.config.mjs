import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

export default [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "out/**",
      "build/**",
      "next-env.d.ts",          // Next.js auto-generated, do not modify
      "src/components/ui/**",   // shadcn/ui — third-party, don't lint
      "scripts/**",              // dev scripts
      "**/*.test.ts",            // 테스트 파일은 별도 lint 정책 (필요 시 추가)
      "**/*.test.tsx",
      "**/__tests__/**",
      "vitest.config.ts",
      "vitest.setup.ts",
    ],
  },
  {
    rules: {
      // 점진적 strictness — 일단 경고로 두고 추후 단계적으로 error로 승격
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        ignoreRestSiblings: true,
      }],
      "react-hooks/exhaustive-deps": "warn",
      "react/no-unescaped-entities": "off", // 한국어 텍스트에 작은따옴표 자유롭게 쓰기
      "@next/next/no-img-element": "warn", // <img> 사용 시 경고만 (next/image 마이그레이션은 #23)
    },
  },
];
