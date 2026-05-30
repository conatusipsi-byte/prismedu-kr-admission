/**
 * 문의 답변 이메일 — 2026-05-30.
 *
 * 호출: app/api/admin/inquiries/[id]/respond/route.ts 가 답변 저장 직후 비동기 호출.
 * 발송 실패해도 답변 저장은 성공 (Sentry 캡처 + DB response_email_error 기록).
 * 본 모듈은 HTML/text 빌드만 담당 — 발송은 lib/notify/inquiry-response.ts.
 *
 * 정직성 (P-002):
 *   - 원본 문의 본문을 인용 → 사용자가 어떤 문의에 대한 답변인지 즉시 식별.
 *   - 답변 본문은 줄바꿈 보존 (whitespace-pre-wrap 가 메일에선 안 통하므로 <br>).
 *   - "이 메일은 답장 가능합니다" 안내 (replyTo = conatusipsi@gmail.com).
 */

export type InquiryCategoryEmail = "improvement" | "question";

const CATEGORY_LABEL: Record<InquiryCategoryEmail, string> = {
  improvement: "시스템 개선 요청",
  question: "문의",
};

export interface InquiryResponseEmailData {
  inquiryId: string;
  category: InquiryCategoryEmail;
  /** 사용자가 작성한 원본 제목 */
  title: string;
  /** 사용자가 작성한 원본 본문 */
  originalBody: string;
  /** 운영자 답변 본문 */
  adminResponse: string;
  /** 사용자가 작성한 시각 (ISO) */
  createdAt: string;
  /** 답변 작성 시각 (ISO) */
  answeredAt: string;
  /** SITE_URL — CTA 링크 base */
  siteUrl: string;
}

export interface BuiltInquiryResponseEmail {
  subject: string;
  html: string;
  text: string;
}

/* ─────────────────────────────────────────────────────────────────────
   포맷터
   ───────────────────────────────────────────────────────────────────── */

function formatDateKr(iso: string): string {
  const d = new Date(iso);
  const offsetMs = 9 * 60 * 60 * 1000;
  const k = new Date(d.getTime() + offsetMs - d.getTimezoneOffset() * 60 * 1000);
  const yyyy = k.getUTCFullYear();
  const mm = String(k.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(k.getUTCDate()).padStart(2, "0");
  const hh = String(k.getUTCHours()).padStart(2, "0");
  const mi = String(k.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}.${mm}.${dd} ${hh}:${mi} KST`;
}

/**
 * HTML escape — 사용자 작성 본문이 메일 본문에 그대로 들어가므로 필수.
 * 운영자가 HTML 을 의도적으로 넣을 일은 없으므로 답변도 동일 처리.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 줄바꿈 → <br> (escape 후 사용) */
function nl2br(escaped: string): string {
  return escaped.replace(/\n/g, "<br />");
}

/* ─────────────────────────────────────────────────────────────────────
   본문 빌드
   ───────────────────────────────────────────────────────────────────── */

export function buildInquiryResponseEmail(
  data: InquiryResponseEmailData,
): BuiltInquiryResponseEmail {
  const {
    inquiryId,
    category,
    title,
    originalBody,
    adminResponse,
    createdAt,
    answeredAt,
    siteUrl,
  } = data;

  const categoryLabel = CATEGORY_LABEL[category];
  const subject = `[Conatus] ${categoryLabel} 답변 — ${title}`;

  const escTitle = escapeHtml(title);
  const escOriginal = nl2br(escapeHtml(originalBody));
  const escResponse = nl2br(escapeHtml(adminResponse));

  const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,'Apple SD Gothic Neo','Noto Sans KR',sans-serif;color:#0f172a">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f8fafc;padding:24px 0">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:#ffffff;border-radius:12px;border:1px solid #e2e8f0;padding:32px">
          <tr>
            <td>
              <p style="margin:0 0 4px;font-size:12px;color:#0f766e;font-weight:600;letter-spacing:1px;text-transform:uppercase">Conatus</p>
              <h1 style="margin:0;font-size:22px;color:#0f172a">${categoryLabel} 답변이 도착했어요</h1>
              <p style="margin:8px 0 24px;color:#475569;font-size:14px">
                ${formatDateKr(createdAt)} 에 보내주신 ${categoryLabel} 에 답변드립니다.
              </p>

              <h2 style="margin:0 0 8px;font-size:15px;color:#0f172a">제목</h2>
              <p style="margin:0 0 20px;color:#0f172a;font-size:15px;font-weight:600;line-height:1.5;word-break:break-word">${escTitle}</p>

              <h3 style="margin:0 0 8px;font-size:13px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:600">답변</h3>
              <div style="margin:0 0 24px;padding:16px 18px;background:#ECFDF5;border-left:3px solid #10B981;border-radius:6px;color:#0f172a;font-size:14px;line-height:1.7;word-break:break-word">
                ${escResponse}
              </div>

              <details style="margin:0 0 24px">
                <summary style="cursor:pointer;font-size:12px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:1px">원본 문의 보기</summary>
                <div style="margin:8px 0 0;padding:14px 16px;background:#f1f5f9;border-radius:6px;color:#475569;font-size:13px;line-height:1.7;word-break:break-word">
                  ${escOriginal}
                </div>
              </details>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background:#f8fafc;border-radius:8px">
                <tr><td style="padding:6px 12px;color:#64748b;font-size:12px">접수 일시</td><td style="padding:6px 12px;color:#0f172a;font-size:12px;text-align:right">${formatDateKr(createdAt)}</td></tr>
                <tr><td style="padding:6px 12px;color:#64748b;font-size:12px">답변 일시</td><td style="padding:6px 12px;color:#0f172a;font-size:12px;text-align:right">${formatDateKr(answeredAt)}</td></tr>
                <tr><td style="padding:6px 12px;color:#64748b;font-size:12px">문의 ID</td><td style="padding:6px 12px;color:#94a3b8;font-size:11px;font-family:monospace;text-align:right;word-break:break-all">${escapeHtml(inquiryId)}</td></tr>
              </table>

              <p style="margin:24px 0 0;font-size:13px;color:#475569;line-height:1.6">
                추가 문의가 있으시면 이 메일에 <strong>답장</strong>하시거나
                <a href="${siteUrl}/inquiries" style="color:#0f766e">문의 페이지</a> 에서 새 문의를 작성해주세요.
              </p>

              <p style="margin:24px 0 0;font-size:12px;color:#94a3b8;line-height:1.6">
                ⓒ ${new Date().getUTCFullYear()} Conatus · <a href="mailto:conatusipsi@gmail.com" style="color:#0f766e">conatusipsi@gmail.com</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    `[Conatus] ${categoryLabel} 답변`,
    ``,
    `제목: ${title}`,
    `접수: ${formatDateKr(createdAt)}`,
    `답변: ${formatDateKr(answeredAt)}`,
    ``,
    `─── 답변 ───`,
    adminResponse,
    ``,
    `─── 원본 문의 ───`,
    originalBody,
    ``,
    `추가 문의: 이 메일에 답장 또는 ${siteUrl}/inquiries`,
    `문의 ID: ${inquiryId}`,
  ].join("\n");

  return { subject, html, text };
}
