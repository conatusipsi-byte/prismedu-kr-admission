#!/usr/bin/env node
/**
 * adiga.kr 디스커버리 — 학과 단위 데이터 적재 전 탐색 (2026-05-30).
 *
 * 목적:
 *   - 단일 대학(서울대학교)의 unvCd / ruCd / comScsbjtCd 흐름 파악.
 *   - Playwright 로 검색 → 학과 리스트 → 학과 상세 → 전형 상세 페이지 도달까지 검증.
 *   - 차단·freeze 발생 여부 실측.
 *   - 다음 단계(parser.ts) 입력 HTML 샘플 확보.
 *
 * 사용:
 *   npx tsx scripts/etl/adiga/discover.ts
 *
 * 출력:
 *   scripts/etl/output/discover-{step}.html  — 각 단계 raw HTML
 *   scripts/etl/output/discover-summary.json — 추출 메타 (unvCd 등)
 *
 * ⚠️ 본 스크립트는 DB 에 쓰지 않음. 어떤 부수효과도 없음.
 * ⚠️ 매너 — 요청 간 1.5초 이상 딜레이, headless, 단일 세션.
 */

import { chromium, type Browser, type Page, type BrowserContext } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const BASE = "https://www.adiga.kr";
const ADMSS_VIEW = `${BASE}/ucp/prc/uni/admssUnivView.do?menuId=PCPRCINF2000`;
const CLASS_VIEW = `${BASE}/ucp/cls/uni/classUnivView.do?menuId=PCCLSINF2000`;
const OUT_DIR = path.resolve("scripts/etl/output");

const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

/** 정중한 매너 — 요청 간 1.5초 이상 */
const DELAY_MS = 1500;
async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function saveStep(name: string, content: string): Promise<void> {
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(path.join(OUT_DIR, `discover-${name}.html`), content);
  console.log(`  → saved discover-${name}.html (${content.length}B)`);
}

interface DiscoverResult {
  startedAt: string;
  steps: Array<{
    step: string;
    ok: boolean;
    url: string;
    httpStatus?: number;
    bytes?: number;
    note?: string;
  }>;
  csrfToken?: string;
  csrfHeader?: string;
  /** 탐색 결과 — 다음 단계용 메타 */
  meta: {
    snuUnvCd?: string;
    sampleRuCd?: string;
    sampleDeptName?: string;
    classUnivDetailUrl?: string;
    admssUnivDetailLinks?: string[];
  };
  blockingObservations: string[];
}

async function main(): Promise<void> {
  const result: DiscoverResult = {
    startedAt: new Date().toISOString(),
    steps: [],
    meta: {},
    blockingObservations: [],
  };

  console.log("== adiga.kr 디스커버리 시작 ==");
  console.log(`User-Agent: ${USER_AGENT}`);
  console.log(`Delay between actions: ${DELAY_MS}ms`);
  console.log();

  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({
      headless: true,
      // 정중한 시그널 — viewport·OS 표시
      args: ["--lang=ko-KR"],
    });
    const context: BrowserContext = await browser.newContext({
      userAgent: USER_AGENT,
      locale: "ko-KR",
      timezoneId: "Asia/Seoul",
      viewport: { width: 1280, height: 800 },
    });

    // 이미지·폰트·CSS 차단 → 속도·트래픽 절약
    await context.route("**/*", (route) => {
      const t = route.request().resourceType();
      if (t === "image" || t === "font" || t === "media" || t === "stylesheet") {
        return route.abort();
      }
      return route.continue();
    });

    const page: Page = await context.newPage();
    page.setDefaultTimeout(20000);

    /* ──────────────────────────────────────────────────────────────────
       STEP 1 — 전형정보 검색 페이지 로드 (CSRF, 폼 필드 확인)
       ────────────────────────────────────────────────────────────────── */
    console.log("[STEP 1] 전형정보 진입 페이지 로드");
    const resp1 = await page.goto(ADMSS_VIEW, { waitUntil: "domcontentloaded" });
    const html1 = await page.content();
    await saveStep("01-admss-view", html1);
    result.steps.push({
      step: "01-admss-view",
      ok: !!resp1?.ok(),
      url: page.url(),
      httpStatus: resp1?.status(),
      bytes: html1.length,
    });

    const csrfMeta = await page
      .locator('meta[name="_csrf"]')
      .first()
      .getAttribute("content")
      .catch(() => null);
    const csrfHeaderName = await page
      .locator('meta[name="_csrf_header"]')
      .first()
      .getAttribute("content")
      .catch(() => null);
    if (csrfMeta) {
      result.csrfToken = csrfMeta.slice(0, 8) + "…"; // 마스킹
      result.csrfHeader = csrfHeaderName ?? "X-CSRF-TOKEN";
      console.log(`  CSRF token (masked): ${result.csrfToken}, header: ${result.csrfHeader}`);
    } else {
      result.blockingObservations.push("STEP 1: CSRF meta 태그 없음");
    }
    await sleep(DELAY_MS);

    /* ──────────────────────────────────────────────────────────────────
       STEP 2 — 학과정보 진입 페이지 (학과별 상세에 필요한 단서)
       ────────────────────────────────────────────────────────────────── */
    console.log("[STEP 2] 학과정보 진입 페이지 로드");
    const resp2 = await page.goto(CLASS_VIEW, { waitUntil: "domcontentloaded" });
    const html2 = await page.content();
    await saveStep("02-class-view", html2);
    result.steps.push({
      step: "02-class-view",
      ok: !!resp2?.ok(),
      url: page.url(),
      httpStatus: resp2?.status(),
      bytes: html2.length,
    });
    await sleep(DELAY_MS);

    /* ──────────────────────────────────────────────────────────────────
       STEP 3 — 대학명 검색 시도 (서울대학교)
       ────────────────────────────────────────────────────────────────── */
    console.log("[STEP 3] 서울대학교 검색 시도");
    // 검색창 위치 후보 — 페이지마다 input 셀렉터 다를 수 있음. 시도 패턴 여러 개.
    const candidates = [
      'input[name*="Univ"][type="text"]',
      'input[placeholder*="대학"]',
      "#searchUnvNm",
      "#searchUnvKwd",
      'input[name="searchUnvNm"]',
      'input[name="searchKwd"]',
    ];

    let usedSelector: string | null = null;
    for (const sel of candidates) {
      const exists = (await page.locator(sel).count()) > 0;
      if (exists) {
        usedSelector = sel;
        break;
      }
    }

    if (!usedSelector) {
      result.blockingObservations.push(
        "STEP 3: 검색 인풋 셀렉터 자동 발견 실패 — discover-02-class-view.html 수동 분석 필요",
      );
      console.log("  ⚠ 검색 인풋 셀렉터 자동 발견 실패");
    } else {
      console.log(`  검색 인풋 셀렉터: ${usedSelector}`);
      try {
        await page.fill(usedSelector, "서울대학교");
        await sleep(500);
        await page.keyboard.press("Enter");
        await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
        const html3 = await page.content();
        await saveStep("03-search-snu", html3);
        result.steps.push({
          step: "03-search-snu",
          ok: true,
          url: page.url(),
          bytes: html3.length,
        });
      } catch (e) {
        result.blockingObservations.push(`STEP 3: 검색 실행 실패 — ${(e as Error).message}`);
      }
    }
    await sleep(DELAY_MS);

    /* ──────────────────────────────────────────────────────────────────
       STEP 4 — HTML 에서 서울대 unvCd 후보 추출
       ────────────────────────────────────────────────────────────────── */
    console.log("[STEP 4] 서울대 unvCd 후보 추출");
    const currentHtml = await page.content();
    // 후보 1: data-unv-cd / value 속성에 들어있는 패턴
    const candidateCodes = await page.evaluate(() => {
      const codes = new Set<string>();
      // unvCd attribute / value
      document.querySelectorAll("[data-unv-cd], [data-unvcd]").forEach((el) => {
        const v = (el as HTMLElement).dataset.unvCd ?? (el as HTMLElement).dataset.unvcd;
        if (v) codes.add(v);
      });
      // <a> with serial/code in href
      document.querySelectorAll("a, button").forEach((el) => {
        const onClick = el.getAttribute("onclick") ?? "";
        const m = onClick.match(/unvCd['\"]?\s*[,=:]\s*['\"]?([0-9A-Za-z]+)/i);
        if (m) codes.add(m[1]);
        const text = (el.textContent ?? "").trim();
        if (/서울대학교/.test(text)) {
          // collect attributes
          for (const attr of Array.from(el.attributes)) {
            if (attr.value.match(/^[0-9]{4,12}$/)) codes.add(attr.value);
          }
        }
      });
      return Array.from(codes);
    });
    console.log(`  unvCd 후보: ${candidateCodes.length}건`);
    if (candidateCodes.length > 0) {
      console.log(`  → ${candidateCodes.slice(0, 10).join(", ")}`);
    } else {
      result.blockingObservations.push("STEP 4: unvCd 후보 자동 추출 실패 — HTML 수동 분석 필요");
    }
    // 가장 그럴듯한 후보 (5~10자리 숫자) 1개 선택
    const snuUnvCd = candidateCodes.find((c) => /^[0-9]{5,10}$/.test(c));
    if (snuUnvCd) {
      result.meta.snuUnvCd = snuUnvCd;
      console.log(`  → 서울대 unvCd 추정: ${snuUnvCd}`);
    }

    /* ──────────────────────────────────────────────────────────────────
       STEP 5 — 분석 요약 저장
       ────────────────────────────────────────────────────────────────── */
    const summaryPath = path.join(OUT_DIR, "discover-summary.json");
    await fs.writeFile(summaryPath, JSON.stringify(result, null, 2));
    console.log(`\n== 디스커버리 완료 → ${summaryPath} ==`);
    console.log(`steps OK: ${result.steps.filter((s) => s.ok).length}/${result.steps.length}`);
    console.log(`blocking observations: ${result.blockingObservations.length}`);
    if (result.blockingObservations.length > 0) {
      result.blockingObservations.forEach((b) => console.log(`  ⚠ ${b}`));
    }
  } catch (e) {
    console.error("디스커버리 중 예외:", e);
    result.blockingObservations.push(`exception: ${(e as Error).message}`);
    await fs.writeFile(
      path.join(OUT_DIR, "discover-summary.json"),
      JSON.stringify(result, null, 2),
    );
  } finally {
    await browser?.close();
  }
}

void main();
