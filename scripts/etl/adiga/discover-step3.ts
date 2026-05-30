#!/usr/bin/env node
/**
 * adiga.kr 디스커버리 STEP 3 — admssUnivView 폼 제출 → SNU 전형 리스트 캡처.
 *
 *   npx tsx scripts/etl/adiga/discover-step3.ts
 *
 * 발견 사항 (STEP 1~2):
 *   - direct URL 인 classUnivDetail.do?unvCd=...&ruCd=... 는 search 페이지로 redirect → 직접 페치 불가
 *   - 검색 필터 체크박스 (searchUnvCode) + 폼 submit 으로 결과 도달 필요
 *   - "freeze" 현상 → waitUntil:'domcontentloaded' + 짧은 wait 필요
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

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function main() {
  console.log(`== SNU (unvCd=${SNU_CD}) 폼 제출 → 전형 리스트 캡처 ==\n`);

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

    // STEP A — 진입 + searchUnvCode 적용된 URL
    const url = `${BASE}/ucp/prc/uni/admssUnivView.do?menuId=PCPRCINF2000&searchUnvCode=${SNU_CD}&searchSyr=${YEAR}`;
    console.log(`[A] ${url}`);
    const r = await page.goto(url, { waitUntil: "domcontentloaded" });
    console.log(`    HTTP ${r?.status()}`);

    // 결과 영역 #tbResult / .recList 가 나올 때까지 잠시 대기.
    await page
      .locator("#tbResult, .recList, table.tbl")
      .first()
      .waitFor({ state: "attached", timeout: 8000 })
      .catch(() => console.log("    (selector 대기 실패 — 계속)"));
    await sleep(2000);

    // STEP B — 자바스크립트로 form submit 트리거 시도 (fn_search 또는 button)
    const triggered = await page.evaluate(() => {
      // 흔한 후보들
      const candidates: Array<[string, () => unknown]> = [
        ["fn_search", () => (window as { fn_search?: () => void }).fn_search?.()],
        ["fnSearch", () => (window as { fnSearch?: () => void }).fnSearch?.()],
        [
          "submit #frm",
          () => (document.getElementById("frm") as HTMLFormElement | null)?.submit?.(),
        ],
        [
          "click .searchBtn",
          () => (document.querySelector(".searchBtn") as HTMLElement | null)?.click?.(),
        ],
        [
          "click button[type=submit]",
          () =>
            (
              document.querySelector("#frm button[type=submit], button.btnSearch") as
                | HTMLElement
                | null
            )?.click?.(),
        ],
      ];
      for (const [name, fn] of candidates) {
        try {
          const r = fn();
          if (typeof r !== "undefined" || true) return name; // first success
        } catch {
          /* try next */
        }
      }
      return null;
    });
    console.log(`[B] form 제출 트리거: ${triggered ?? "(없음)"}`);

    // AJAX 응답 + tbResult 갱신 대기 — 네트워크 응답을 idle 대신 명시적으로 기다림
    try {
      await page.waitForResponse(
        (resp) => resp.url().includes("admssUnivAjax.do") && resp.status() === 200,
        { timeout: 8000 },
      );
      console.log("    AJAX 응답 수신");
    } catch {
      console.log("    AJAX 응답 8s 대기 timeout — 진행");
    }
    await sleep(2000);

    const html = await page.content();
    await fs.writeFile(path.join(OUT_DIR, "discover-step3-snu-list.html"), html);
    console.log(`    saved ${html.length}B`);

    // STEP C — fnDetailPage 호출 추출
    const detailCalls = await page.evaluate(() => {
      const out: Array<{ text: string; args: string }> = [];
      document.querySelectorAll("[onclick]").forEach((el) => {
        const oc = el.getAttribute("onclick") ?? "";
        if (oc.includes("fnDetailPage")) {
          const text = (el.textContent ?? "").trim().slice(0, 100);
          // fnDetailPage('a','b',...) → 첫 인자 univCode 추출
          const m = oc.match(/fnDetailPage\(([^)]+)\)/);
          out.push({ text, args: m ? m[1].slice(0, 250) : "" });
        }
      });
      return out;
    });
    console.log(`[C] fnDetailPage 호출 수: ${detailCalls.length}`);
    detailCalls.slice(0, 10).forEach((c) => {
      console.log(`    ${c.text.slice(0, 50)}`);
      console.log(`      args: ${c.args}`);
    });

    // STEP D — 전형 리스트 raw 행 텍스트 캡처 (table 행 또는 li.recItem 등)
    const recRows = await page.evaluate(() => {
      const rows: Array<{ tag: string; text: string }> = [];
      const sels = ["#tbResult tr", ".recList li", ".tbl tbody tr", ".ucp tr"];
      for (const sel of sels) {
        document.querySelectorAll(sel).forEach((el) => {
          const t = (el.textContent ?? "").replace(/\s+/g, " ").trim();
          if (t.length > 10) rows.push({ tag: sel, text: t.slice(0, 200) });
        });
        if (rows.length > 0) break;
      }
      return rows;
    });
    console.log(`[D] 결과 행 수: ${recRows.length}`);
    recRows.slice(0, 6).forEach((r) => console.log(`    ${r.text}`));

    console.log("\n== STEP 3 디스커버리 완료 ==");
  } catch (e) {
    console.error("예외:", e);
  } finally {
    await browser?.close();
  }
}

void main();
