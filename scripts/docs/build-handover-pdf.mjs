/**
 * HANDOVER.md → 이관용 PDF 2종 생성기.
 *
 *   1) docs/handover/conatus-인수인계서.pdf        — A~D·F·G장 (프로젝트 현황·운영)
 *   2) docs/handover/conatus-Claude-연동-가이드.pdf — E장 (비개발자용 Claude Code 사용법)
 *
 * 원본은 항상 저장소 루트의 HANDOVER.md 하나다(Claude Code 가 참조하는 파일).
 * 내용을 고칠 때는 HANDOVER.md 만 고치고 이 스크립트를 다시 돌린다.
 *
 *   node scripts/docs/build-handover-pdf.mjs
 */
import { readFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
// micromark(마크다운→HTML)·playwright(HTML→PDF)는 이 저장소에 이미 설치돼 있는 패키지다.
// 새로 설치한 환경에서 못 찾는다면: npm i -D micromark micromark-extension-gfm
const [{ micromark }, { gfm, gfmHtml }, { chromium }] = await Promise.all([
  import("micromark"),
  import("micromark-extension-gfm"),
  import("playwright"),
]).catch((err) => {
  console.error(
    "필요한 패키지를 찾지 못했습니다. 다음을 실행한 뒤 다시 시도하세요:\n" +
      "  npm i -D micromark micromark-extension-gfm\n",
  );
  throw err;
});

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT_DIR = resolve(ROOT, "docs/handover");
const BUILT_AT = "2026-08-26"; // 문서 표기용 고정 날짜 (재생성해도 내용이 흔들리지 않게)

// ── HANDOVER.md 를 최상위 섹션(## X.) 단위로 자른다 ────────────────────────────
const source = readFileSync(resolve(ROOT, "HANDOVER.md"), "utf8");
const blocks = [];
let current = { key: "__front__", body: [] };
for (const line of source.split("\n")) {
  const m = /^## (?:([A-G])\. )?(.+)$/.exec(line);
  if (m) {
    blocks.push(current);
    current = { key: m[1] ?? m[2], title: m[2], heading: line, body: [] };
  } else {
    current.body.push(line);
  }
}
blocks.push(current);
const section = (key) => {
  const b = blocks.find((x) => x.key === key);
  if (!b) throw new Error(`HANDOVER.md 에서 '${key}' 섹션을 찾지 못했습니다`);
  return `${b.heading}\n${b.body.join("\n")}`;
};

// ── 문서 1: 인수인계서 (Claude 가이드인 E장만 제외) ────────────────────────────
const doc1 = [
  `## 목차

- **A.** 프로젝트 개요
- **B.** 현재 상태 — 되는 것 / 안 되는 것
- **C.** 학년도 갱신 — 매년 반드시 해야 하는 일 ★
- **D.** 인프라·계정·접근 권한
- **F.** 운영 가이드
- **G.** 인수 직후 체크리스트

> **E장(Claude로 개발 이어가기)은 별도 PDF** — 『Conatus Claude 연동 가이드』 로 분리했습니다.
> 장 번호는 저장소의 \`HANDOVER.md\` 와 같게 유지했습니다(E장이 비어 보이는 이유).`,
  section("A"),
  section("B"),
  section("C"),
  section("D"),
  section("F"),
  section("G"),
  section("마지막으로"),
].join("\n\n---\n\n");

// ── 문서 2: Claude 연동 가이드 (E장) ──────────────────────────────────────────
const doc2 = [
  `## 이 문서는 무엇인가

이 프로젝트(conatusipsi.com)는 **Claude Code** 라는 도구로 개발됐습니다.
터미널에 **한국어로 지시하면 Claude 가 코드를 직접 읽고 고치고 테스트하고 배포**합니다.
코딩을 몰라도 쓸 수 있게, 설치부터 실제로 복사해 쓸 수 있는 지시문까지 순서대로 적었습니다.

> 프로젝트의 현재 상태·계정·운영 방법은 **별도 PDF 『Conatus 인수인계서』** 에 있습니다.
> 두 문서 모두 저장소 루트의 \`HANDOVER.md\` 한 파일에서 만들어집니다.

**미리 알아 둘 것 3가지**

1. Claude Code 사용료와, 서비스 안의 AI 기능(학생에게 보이는 AI 분석) 사용료는 **별개**입니다.
2. \`main\` 에 코드를 올리면 **곧바로 실서비스에 반영**됩니다. 확인 없이 올리게 두지 마세요.
3. 무엇이든 모르겠으면 Claude에게 한국어로 그대로 물어보면 됩니다.
   *"이거 위험한 작업이야?"*, *"되돌릴 수 있어?"* 가 가장 유용한 질문입니다.`,
  section("E"),
].join("\n\n---\n\n");

// ── 렌더링 ────────────────────────────────────────────────────────────────────
const toHtml = (md) =>
  micromark(
    // h2 가 이미 페이지를 넘기므로 장 사이 구분선(---)은 지운다 (페이지 첫 줄의 빈 줄 방지)
    md.replace(/\n-{3,}\n+(?=## )/g, "\n\n").trimEnd(),
    { extensions: [gfm()], htmlExtensions: [gfmHtml()], allowDangerousHtml: true },
  );

const CSS = `
  @page { size: A4; margin: 18mm 15mm 20mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "Noto Sans CJK KR", "Noto Sans KR", sans-serif;
    font-size: 10.2pt; line-height: 1.72; color: #1c2624;
    word-break: keep-all; overflow-wrap: anywhere;
  }
  .cover { height: 249mm; display: flex; flex-direction: column; justify-content: center;
           page-break-after: always; }
  .cover .kicker { font-size: 10pt; letter-spacing: .22em; color: #10B981; font-weight: 700; }
  .cover h1 { font-size: 30pt; line-height: 1.28; margin: 14px 0 0; letter-spacing: -.02em; }
  .cover .sub { font-size: 12pt; color: #4b5a56; margin-top: 14px; line-height: 1.75; }
  .cover hr { border: 0; border-top: 3px solid #10B981; width: 72px; margin: 30px 0; }
  .cover dl { display: grid; grid-template-columns: 92px 1fr; row-gap: 7px; font-size: 10pt;
              margin: 0; color: #33403c; }
  .cover dt { color: #7a8c87; }
  .cover .note { margin-top: 34px; padding: 14px 16px; border-left: 3px solid #10B981;
                 background: #f2faf7; font-size: 9.6pt; color: #2c3b37; line-height: 1.7; }

  h2 { font-size: 17pt; margin: 0 0 16px; padding-bottom: 9px; letter-spacing: -.01em;
       border-bottom: 2px solid #10B981; page-break-before: always; page-break-after: avoid; }
  h2:first-of-type { page-break-before: avoid; }
  h3 { font-size: 12.6pt; margin: 24px 0 9px; color: #0f3d31; page-break-after: avoid; }
  h4 { font-size: 11pt; margin: 18px 0 7px; color: #1c2624; page-break-after: avoid; }
  p { margin: 8px 0; }
  ul, ol { margin: 8px 0; padding-left: 20px; }
  li { margin: 4px 0; }
  li::marker { color: #10B981; }
  a { color: #0f6b52; text-decoration: none; }
  strong { color: #0d1a17; }
  hr { border: 0; border-top: 1px solid #e2e9e6; margin: 22px 0; }

  table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 9.2pt;
          page-break-inside: avoid; }
  th, td { border: 1px solid #dfe8e5; padding: 6px 9px; text-align: left; vertical-align: top; }
  th { background: #eef7f3; color: #0f3d31; font-weight: 700; }
  th:first-child { white-space: nowrap; }
  tbody tr:nth-child(even) { background: #fafcfb; }

  code { font-family: "Noto Sans Mono CJK KR", monospace; font-size: 8.9pt;
         background: #eef2f0; padding: 1px 4px; border-radius: 3px; color: #14372d; }
  pre { background: #f5f8f7; border: 1px solid #e2e9e6; border-left: 3px solid #10B981;
        padding: 11px 13px; border-radius: 4px; margin: 11px 0; page-break-inside: avoid;
        white-space: pre-wrap; }
  pre code { background: none; padding: 0; font-size: 8.6pt; line-height: 1.62; }

  blockquote { margin: 12px 0; padding: 11px 15px; background: #f7faf9;
               border-left: 3px solid #9fd7c4; color: #2c3b37; font-size: 9.6pt;
               page-break-inside: avoid; }
  blockquote > :first-child { margin-top: 0; }
  blockquote > :last-child { margin-bottom: 0; }

  input[type="checkbox"] { margin-right: 6px; }
  ul:has(> li > input) { list-style: none; padding-left: 4px; }
`;

const page = ({ kicker, title, sub, meta, note, body }) => `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><style>${CSS}</style></head><body>
<section class="cover">
  <div class="kicker">${kicker}</div>
  <h1>${title}</h1>
  <div class="sub">${sub}</div>
  <hr>
  <dl>${meta.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>
  <div class="note">${note}</div>
</section>
${body}
</body></html>`;

const DOCS = [
  {
    file: "conatus-인수인계서.pdf",
    footer: "Conatus 인수인계서",
    html: page({
      kicker: "CONATUS · HANDOVER",
      title: "인수인계서",
      sub: "conatusipsi.com — 한국 대학 입시 AI 추천 웹 서비스<br>프로젝트 현황 · 인프라 · 운영 가이드",
      meta: [
        ["작성일", BUILT_AT],
        ["인계", "개발자 → 방준현 (클라이언트)"],
        ["상태", "개발 완료 · 정산 완료 → 유지보수 종료"],
        ["서비스", "https://conatusipsi.com"],
        ["저장소", "conatusipsi-byte/prismedu-kr-admission"],
      ],
      note:
        "이 문서는 <strong>되는 것만 적지 않았습니다.</strong> 안 되는 것·미완·알려진 한계를 B장에 전부 적었고, " +
        "수치는 작성일 기준 프로덕션 DB·라이브 사이트에서 직접 조회한 실측값입니다. " +
        "<strong>실제 키(비밀번호) 값은 이 문서에 한 줄도 없습니다.</strong>",
      body: toHtml(doc1),
    }),
  },
  {
    file: "conatus-Claude-연동-가이드.pdf",
    footer: "Conatus Claude 연동 가이드",
    html: page({
      kicker: "CONATUS · CLAUDE CODE",
      title: "Claude 연동 가이드",
      sub: "코딩을 몰라도 이 프로젝트를 계속 개발하는 방법<br>설치 · 프로젝트 열기 · 실전 지시문 6개 · 주의사항",
      meta: [
        ["작성일", BUILT_AT],
        ["대상", "방준현 (클라이언트)"],
        ["필요", "Node.js + Claude 구독 또는 API 크레딧"],
        ["함께 볼 것", "『Conatus 인수인계서』 PDF"],
      ],
      note:
        "장 번호(E-1 ~ E-5)는 저장소의 <code>HANDOVER.md</code> 와 같습니다. " +
        "Claude 에게 <em>“HANDOVER.md E-4 의 프롬프트 ④대로 해줘”</em> 처럼 그대로 지시할 수 있습니다.",
      body: toHtml(doc2),
    }),
  },
];

mkdirSync(OUT_DIR, { recursive: true });
// 시스템에 설치된 Chrome 을 먼저 쓰고, 없으면 playwright 내장 브라우저로 넘어간다.
// (내장 브라우저도 없으면: npx playwright install chromium)
const browser = await chromium
  .launch({ channel: "chrome" })
  .catch(() => chromium.launch());
const ctx = await browser.newContext();
for (const doc of DOCS) {
  const p = await ctx.newPage();
  await p.setContent(doc.html, { waitUntil: "load" });
  await p.emulateMedia({ media: "print" });
  await p.pdf({
    path: resolve(OUT_DIR, doc.file),
    format: "A4",
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: "<div></div>",
    footerTemplate:
      `<div style="width:100%;font-size:7.5pt;color:#8a9a95;padding:0 15mm;
        font-family:'Noto Sans CJK KR',sans-serif;display:flex;justify-content:space-between;">
        <span>${doc.footer} · ${BUILT_AT}</span>
        <span class="pageNumber"></span></div>`,
    margin: { top: "18mm", right: "15mm", bottom: "20mm", left: "15mm" },
  });
  await p.close();
  console.log("생성:", resolve(OUT_DIR, doc.file));
}
await browser.close();
