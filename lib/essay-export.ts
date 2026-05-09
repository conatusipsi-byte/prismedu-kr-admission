/**
 * 에세이 review export — zero-dependency.
 *
 * PDF: window.print() 기반. 새 탭에 프린트용 HTML을 렌더하고 자동 print() 호출.
 *      사용자가 브라우저 print dialog에서 "PDF로 저장"을 선택 → .pdf 산출.
 *      jsPDF/puppeteer 등 추가 deps 없이 동작. 한글 렌더는 브라우저가 OS 폰트로 처리.
 *
 * DOCX: application/msword MIME + HTML body. Word/Pages/구글 문서는 HTML을 파싱해
 *       .doc로 열 수 있음(MS 공식 지원). 순수 OOXML .docx는 `docx` 패키지가 필요하나
 *       300KB+ 의존성을 피하고자 HTML-as-doc 방식 채택. 레이아웃은 수준급으로 보존됨.
 */

import type { EssayReview } from "@/types/essay";

interface ExportContext {
  university?: string;
  prompt?: string;
  content: string;
  review: Omit<EssayReview, "id"> | EssayReview;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderBodyHtml(ctx: ExportContext): string {
  const { university, prompt, content, review } = ctx;
  const scoreColor =
    review.score >= 8 ? "#059669" :
    review.score >= 6 ? "#2563eb" :
    review.score >= 4 ? "#d97706" : "#dc2626";

  const section = (title: string, items: string[] | undefined, color: string) => {
    if (!items || items.length === 0) return "";
    return `
      <h2 style="color:${color}; border-bottom: 2px solid ${color}; padding-bottom: 4px; margin-top: 24px;">${escapeHtml(title)}</h2>
      <ul style="padding-left: 20px; line-height: 1.7;">
        ${items.map(i => `<li style="margin-bottom: 8px;">${escapeHtml(i)}</li>`).join("")}
      </ul>
    `;
  };

  const paragraphBlock = (title: string, text: string | undefined) => {
    if (!text) return "";
    return `
      <h2 style="margin-top: 24px;">${escapeHtml(title)}</h2>
      <p style="line-height: 1.7; white-space: pre-wrap;">${escapeHtml(text)}</p>
    `;
  };

  return `
    <header>
      <h1 style="margin-bottom: 4px;">PRISM 에세이 첨삭 리포트</h1>
      <p style="color: #666; font-size: 13px; margin-top: 0;">
        ${new Date(review.createdAt || Date.now()).toLocaleString("ko-KR")}
        ${university ? ` · ${escapeHtml(university)}` : ""}
      </p>
    </header>

    <div style="margin: 24px 0; padding: 16px; background: #f9fafb; border-radius: 8px;">
      <div style="font-size: 14px; color: #666;">종합 점수</div>
      <div style="font-size: 48px; font-weight: 700; color: ${scoreColor};">${review.score}<span style="font-size: 20px; color: #999;"> / 10</span></div>
      ${review.summary ? `<p style="font-size: 15px; font-weight: 600; margin-top: 8px;">${escapeHtml(review.summary)}</p>` : ""}
      ${review.firstImpression ? `<p style="font-size: 13px; color: #555; margin-top: 4px;"><strong>입학사정관 첫인상:</strong> ${escapeHtml(review.firstImpression)}</p>` : ""}
      ${review.tone ? `<p style="font-size: 13px; color: #555; margin-top: 4px;"><strong>톤:</strong> ${escapeHtml(review.tone)}</p>` : ""}
    </div>

    ${prompt ? paragraphBlock("에세이 주제", prompt) : ""}
    ${paragraphBlock("원본 에세이", content)}
    ${section("강점", review.strengths, "#059669")}
    ${section("개선이 필요한 부분", review.weaknesses, "#dc2626")}
    ${section("수정 제안", review.suggestions, "#2563eb")}
    ${paragraphBlock("핵심 개선 포인트", review.keyChange)}
    ${paragraphBlock("입학사정관 코멘트", review.admissionNote)}
    ${paragraphBlock("서두 수정 예시", review.revisedOpening)}
    ${paragraphBlock("전체 수정 예시 (10점 수준)", review.perfectExample)}

    <footer style="margin-top: 48px; padding-top: 16px; border-top: 1px solid #ddd; font-size: 11px; color: #999;">
      PRISM · prismedu.kr · AI 기반 미국 대학 입시 가이드
    </footer>
  `;
}

function fullDocument(body: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: "Pretendard Variable", Pretendard, -apple-system, "Malgun Gothic", sans-serif; max-width: 720px; margin: 24px auto; padding: 0 24px; color: #1a1714; }
  h1 { font-size: 24px; }
  h2 { font-size: 17px; }
  @media print {
    body { margin: 0; padding: 16px; }
    h2 { page-break-after: avoid; }
    ul, p { page-break-inside: avoid; }
  }
</style>
</head>
<body>${body}</body>
</html>`;
}

function safeFilename(s: string): string {
  return (s || "essay-review")
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 60);
}

export function exportReviewToPDF(ctx: ExportContext): void {
  if (typeof window === "undefined") return;
  const body = renderBodyHtml(ctx);
  const title = `PRISM-review-${safeFilename(ctx.university || "essay")}`;
  const html = fullDocument(body, title);

  // 팝업 차단 대응: 빈 창을 먼저 열고 write. about:blank 도메인에서 print 허용.
  const win = window.open("", "_blank", "noopener,noreferrer");
  if (!win) {
    // 팝업 차단 fallback — blob URL로 새 탭 open (사용자가 직접 print)
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  // 리소스(폰트) 로드 후 print — onload 의존하지 않고 rAF 두 번 + 짧은 여유.
  const triggerPrint = () => {
    try { win.focus(); win.print(); } catch { /* user can still ctrl+p */ }
  };
  win.addEventListener("load", () => setTimeout(triggerPrint, 150), { once: true });
}

export function exportReviewToDoc(ctx: ExportContext): void {
  if (typeof window === "undefined") return;
  const body = renderBodyHtml(ctx);
  const title = `PRISM-review-${safeFilename(ctx.university || "essay")}`;
  // Word가 열 수 있는 HTML-as-doc. Office XML namespace로 더 깔끔히 파싱.
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="UTF-8"><title>${escapeHtml(title)}</title></head>
<body>${body}</body></html>`;
  // MS Word용 BOM + application/msword MIME → .doc로 저장.
  const blob = new Blob(["\ufeff", html], { type: "application/msword" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title}.doc`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
