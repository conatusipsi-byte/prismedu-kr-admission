#!/usr/bin/env node
/**
 * adiga.kr 디스커버리 STEP 2 — 단일 대학(서울대 unvCd=0000019)의
 * 학과 리스트 + 학과 상세 페이지 도달 검증.
 *
 *   npx tsx scripts/etl/adiga/discover-step2.ts
 *
 * 출력: scripts/etl/output/discover-step2-*.html
 */

import { chromium, type Browser } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const BASE = "https://www.adiga.kr";
const SNU_CD = "0000019";
const YEAR = "2027";
const OUT_DIR = path.resolve("scripts/etl/output");
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log(`== SNU (unvCd=${SNU_CD}) 학과 리스트·상세 탐색 ==\n`);

  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ headless: true, args: ["--lang=ko-KR"] });
    const ctx = await browser.newContext({
      userAgent: UA,
      locale: "ko-KR",
      timezoneId: "Asia/Seoul",
      viewport: { width: 1280, height: 800 },
    });
    await ctx.route("**/*", (route) => {
      const t = route.request().resourceType();
      if (t === "image" || t === "font" || t === "media" || t === "stylesheet") {
        return route.abort();
      }
      return route.continue();
    });
    const page = await ctx.newPage();
    page.setDefaultTimeout(15000);
    // 페이지 안에서 추가 콘텐츠 로딩을 기다리기 위한 헬퍼 (freeze 우회)
    const waitForContent = async (selector: string, timeout = 8000): Promise<boolean> =>
      page
        .locator(selector)
        .first()
        .waitFor({ state: "attached", timeout })
        .then(() => true)
        .catch(() => false);

    // STEP A — classUnivDetail.do 직접 진입 (unvCd 만, ruCd 없이 → 대학 페이지 + 학과 리스트)
    const url1 = `${BASE}/ucp/cls/uni/classUnivDetail.do?menuId=PCCLSINF2000&unvCd=${SNU_CD}&searchSyr=${YEAR}`;
    console.log(`[A] ${url1}`);
    const r1 = await page.goto(url1, { waitUntil: "domcontentloaded" });
    console.log(`    HTTP ${r1?.status()} url=${page.url()}`);
    // 핵심 컨테이너가 나올 때까지 짧게 대기 (페이지마다 다를 수 있음)
    await waitForContent('.clsUnivList, .deptList, .recList, table.tbl, .ucp', 5000);
    await sleep(1500);
    const h1 = await page.content();
    await fs.writeFile(path.join(OUT_DIR, "discover-step2-A-snu-univ.html"), h1);
    console.log(`    saved ${h1.length}B`);
    await sleep(1500);

    // STEP B — 학과 리스트(JS·AJAX) 안에서 ruCd 추출
    const ruCdList = await page.evaluate(() => {
      const out: Array<{ ruCd: string; name: string; raw: string }> = [];
      // onclick="fnXxx('0000019','RU_CD',...)"
      document.querySelectorAll("a, button, li, tr").forEach((el) => {
        const text = (el.textContent ?? "").trim().slice(0, 100);
        const oc = el.getAttribute("onclick") ?? "";
        const m = oc.match(/['"]([0-9]{4,12})['"]\s*,\s*['"]([A-Z0-9]{2,30})['"]/i);
        if (m) {
          out.push({ ruCd: m[2], name: text, raw: oc.slice(0, 200) });
        }
        // data-ru-cd 류
        const dru = (el as HTMLElement).dataset?.ruCd;
        if (dru) {
          out.push({ ruCd: dru, name: text, raw: "data-ru-cd" });
        }
      });
      return out;
    });
    console.log(`[B] ruCd 후보: ${ruCdList.length}건`);
    ruCdList.slice(0, 15).forEach((r) => {
      console.log(`    ${r.ruCd}  ${r.name.replace(/\s+/g, " ").slice(0, 60)}`);
    });

    // STEP C — 컴퓨터공학부 추정 (이름 매칭)
    const compSci = ruCdList.find((r) => /컴퓨터.*공학부?|컴퓨터.*과학/.test(r.name));
    if (compSci) {
      console.log(`\n[C] 서울대 컴퓨터공학부 추정 ruCd: ${compSci.ruCd}`);
      const url3 = `${BASE}/ucp/cls/uni/classUnivDetail.do?menuId=PCCLSINF2000&unvCd=${SNU_CD}&ruCd=${compSci.ruCd}&searchSyr=${YEAR}`;
      console.log(`    ${url3}`);
      const r3 = await page.goto(url3, { waitUntil: "domcontentloaded" });
      console.log(`    HTTP ${r3?.status()} url=${page.url()}`);
      await waitForContent('h1, h2, .titleTxt, table.tbl', 5000);
      await sleep(1500);
      const h3 = await page.content();
      await fs.writeFile(
        path.join(OUT_DIR, "discover-step2-C-snu-compsci.html"),
        h3,
      );
      console.log(`    saved ${h3.length}B`);

      // 첫 텍스트 청크 보기
      const title = await page.title();
      const heading = await page
        .locator("h1, h2, .titleTxt")
        .first()
        .textContent()
        .catch(() => null);
      console.log(`    title: ${title}`);
      console.log(`    heading: ${heading?.replace(/\s+/g, " ").trim().slice(0, 80)}`);
    } else {
      console.log("\n[C] 컴퓨터공학부 자동 매칭 실패");
    }

    await sleep(1500);

    // STEP D — 전형 정보 (admssUnivView 에서 SNU만 필터)
    const url4 = `${BASE}/ucp/prc/uni/admssUnivView.do?menuId=PCPRCINF2000&searchUnvCode=${SNU_CD}`;
    console.log(`\n[D] ${url4}`);
    const r4 = await page.goto(url4, { waitUntil: "domcontentloaded" });
    console.log(`    HTTP ${r4?.status()} url=${page.url()}`);
    await waitForContent("#tbResult, table.tbl, .recList", 6000);
    await sleep(1500);
    const h4 = await page.content();
    await fs.writeFile(path.join(OUT_DIR, "discover-step2-D-snu-admss.html"), h4);
    console.log(`    saved ${h4.length}B`);

    // STEP E — 페이지 내 fnDetailPage 호출 추출 (전형별 식별자)
    const detailCalls = await page.evaluate(() => {
      const out: string[] = [];
      document.querySelectorAll("[onclick]").forEach((el) => {
        const oc = el.getAttribute("onclick") ?? "";
        if (oc.includes("fnDetailPage")) {
          const text = (el.textContent ?? "").trim().slice(0, 100);
          out.push(`${text} :: ${oc.slice(0, 220)}`);
        }
      });
      return out;
    });
    console.log(`[E] fnDetailPage 호출: ${detailCalls.length}건`);
    detailCalls.slice(0, 10).forEach((d) => console.log(`    ${d}`));

    await sleep(1500);
    console.log("\n== STEP 2 디스커버리 완료 ==");
  } catch (e) {
    console.error("예외:", e);
  } finally {
    await browser?.close();
  }
}

void main();
