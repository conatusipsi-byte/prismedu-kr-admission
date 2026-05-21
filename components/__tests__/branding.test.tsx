/**
 * 브랜드 표시명 회귀 — "Conatus" 가 표시명 위치에 노출되는지 + 도메인·이메일·repo
 * 외에 "conatusipsi" 단독 표기가 없는지 검증.
 *
 * 출처: 2026-05-20 브랜드 표시명 변경 (conatusipsi → Conatus).
 *   - 도메인 conatusipsi.com 유지
 *   - 이메일 @conatusipsi.com 유지
 *   - GitHub repo / Vercel 프로젝트명 / Firebase 식별자 / npm 패키지명 유지
 *   - 표시명만 "Conatus"
 *
 * 회귀 게이트:
 *   1. 푸터 저작권 — "Conatus" 노출 (Footer.tsx)
 *   2. og:siteName / metadata — "Conatus" 사용 (app/layout.tsx, app/page.tsx)
 *   3. AI 카운슬러 환영 메시지 — "Conatus" 노출 (ChatPageView.tsx WELCOME_*)
 *   4. UI 소스 트리(app/, components/)에 "conatusipsi" 단독 표기 0건
 */

import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { Footer } from "@/components/nav/Footer";

const ROOT = path.resolve(__dirname, "..", "..");

/* ═══════════════════════════════════════════════════════════════════════
   1. 푸터 렌더
   ═══════════════════════════════════════════════════════════════════════ */

describe("Footer — 브랜드 표시명", () => {
  it("저작권 텍스트에 'Conatus' 노출", () => {
    render(<Footer />);
    // ⓒ {year} Conatus. All rights reserved.
    expect(screen.getByText(/Conatus\. All rights reserved/)).toBeInTheDocument();
  });

  it("저작권 텍스트에 'conatusipsi' 단독 표기 0건", () => {
    render(<Footer />);
    // 도메인/이메일/repo 형태로 conatusipsi 가 노출될 수는 있지만
    // 본문 텍스트로 "conatusipsi" 가 단독 등장하면 안 됨.
    const html = document.body.innerHTML;
    // domain / email / external service handle 제외
    const stray = stripAllowedConatusipsi(html);
    expect(stray).not.toMatch(/conatusipsi/);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   2. metadata.siteName / og 검증 — 소스 파일 직독
   ═══════════════════════════════════════════════════════════════════════ */

describe("openGraph / metadata — siteName", () => {
  it("app/layout.tsx siteName = 'Conatus'", () => {
    const src = fs.readFileSync(path.join(ROOT, "app", "layout.tsx"), "utf8");
    expect(src).toMatch(/siteName:\s*["']Conatus["']/);
    // 잔존하면 회귀
    const stripped = stripAllowedConatusipsi(src);
    expect(stripped).not.toMatch(/conatusipsi/);
  });

  it("app/page.tsx 메타데이터에 'Conatus' 사용", () => {
    const src = fs.readFileSync(path.join(ROOT, "app", "page.tsx"), "utf8");
    expect(src).toMatch(/siteName:\s*["']Conatus["']/);
    expect(src).toMatch(/Conatus — 한국 대학 입시/);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   3. AI 카운슬러 환영 메시지
   ═══════════════════════════════════════════════════════════════════════ */

describe("AI 카운슬러 — Conatus 브랜딩", () => {
  it("ChatPageView.tsx WELCOME 상수에 'Conatus' 포함", () => {
    const src = fs.readFileSync(path.join(ROOT, "app", "chat", "ChatPageView.tsx"), "utf8");
    expect(src).toMatch(/WELCOME_GENERAL\s*=\s*[\s\S]{0,30}Conatus/);
    expect(src).toMatch(/WELCOME_UNAUTHENTICATED\s*=\s*[\s\S]{0,30}Conatus/);
  });

  it("counselor system prompt 가 'Conatus' 페르소나로 시작", () => {
    const src = fs.readFileSync(
      path.join(ROOT, "lib", "prompts", "counselor-guards.ts"),
      "utf8",
    );
    expect(src).toMatch(/Conatus의\s+한국 대학 입시 전문 AI 카운슬러/);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   4. 전역 sweep — app/ + components/ 소스에 "conatusipsi" 잔존 0건
   ═══════════════════════════════════════════════════════════════════════ */

describe("UI 소스 트리 — 'conatusipsi' 단독 표기 없음", () => {
  it("app/ 와 components/ 의 ts/tsx 파일에 잔존 0건 (도메인·이메일·내부키 제외)", () => {
    const offenders: Array<{ file: string; line: number; text: string }> = [];
    for (const dir of ["app", "components"]) {
      walkSource(path.join(ROOT, dir), (file) => {
        const text = fs.readFileSync(file, "utf8");
        if (!text.includes("conatusipsi")) return;
        text.split("\n").forEach((line, idx) => {
          const stripped = stripAllowedConatusipsi(line);
          if (stripped.includes("conatusipsi")) {
            offenders.push({
              file: path.relative(ROOT, file),
              line: idx + 1,
              text: line.trim().slice(0, 160),
            });
          }
        });
      });
    }
    if (offenders.length > 0) {
      // 실패 시 어디서 잔존했는지 알려주기
      const summary = offenders
        .map((o) => `  ${o.file}:${o.line} → ${o.text}`)
        .join("\n");
      throw new Error(`잔존 ${offenders.length}건:\n${summary}`);
    }
    expect(offenders.length).toBe(0);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   helpers
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * 허용된 "conatusipsi" 형태(도메인·이메일·repo·Firebase ID·내부키)를 제거해
 * 남은 본문에 단독 표기가 있는지 확인.
 *
 * 허용 패턴:
 *   conatusipsi.com               도메인
 *   conatusipsi.firebaseapp.com   Firebase auth domain
 *   conatusipsi.firebasestorage   Firebase storage
 *   conatusipsi.example           e2e 테스트 가짜 도메인
 *   @conatusipsi                  이메일 / 트위터 핸들
 *   conatusipsi-byte              GitHub repo org
 *   conatusipsi-f8e1d             Firebase project ID
 *   conatusipsi-staging           Firebase staging
 *   conatusipsi-web               Firebase web app
 *   conatusipsi-firebase-adminsdk Firebase admin SDK 키 파일
 *   x.com/conatusipsi             Twitter URL
 *   conatusipsi.quickMatchDemo    localStorage key (내부 키)
 *   "conatusipsi"                 npm package name (package.json 만 — 본 sweep 은 app/components 만 도므로 영향 없음)
 */
function stripAllowedConatusipsi(s: string): string {
  return s
    .replace(/conatusipsi\.com/g, "")
    .replace(/conatusipsi\.firebaseapp\.com/g, "")
    .replace(/conatusipsi\.firebasestorage(\.\w+)?/g, "")
    .replace(/conatusipsi\.example/g, "")
    .replace(/@conatusipsi(\.com)?/g, "")
    .replace(/conatusipsi-byte/g, "")
    .replace(/conatusipsi-f8e1d/g, "")
    .replace(/conatusipsi-staging/g, "")
    .replace(/conatusipsi-web/g, "")
    .replace(/conatusipsi-firebase-adminsdk/g, "")
    .replace(/conatusipsi-e5/g, "") // Sentry organization slug
    .replace(/x\.com\/conatusipsi/g, "")
    .replace(/conatusipsi\.quickMatchDemo[\w.]*/g, "");
}

function walkSource(dir: string, fn: (file: string) => void): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      // 본 테스트 파일 자체는 "conatusipsi" 문자열을 검사 패턴으로 갖고 있어 제외
      if (entry.name === "__tests__") {
        for (const sub of fs.readdirSync(full, { withFileTypes: true })) {
          if (sub.isFile() && sub.name === "branding.test.tsx") continue;
          if (sub.isFile() && (sub.name.endsWith(".ts") || sub.name.endsWith(".tsx"))) {
            fn(path.join(full, sub.name));
          } else if (sub.isDirectory()) {
            walkSource(path.join(full, sub.name), fn);
          }
        }
        continue;
      }
      walkSource(full, fn);
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))
    ) {
      fn(full);
    }
  }
}
