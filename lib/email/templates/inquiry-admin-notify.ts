/**
 * 새 문의 → 운영자 알림 이메일 (2026-06-13).
 *
 * 호출: app/api/inquiries POST 가 문의 insert 직후 비동기 호출.
 * 본 모듈은 HTML/text 빌드만 — 발송은 lib/notify/inquiry-admin-notify.ts.
 *
 * 정직성/개인정보 (P-002):
 *   - 운영자(MASTER_EMAILS, 신뢰 대상)에게만 발송.
 *   - 본문은 발췌(최대 300자) + 작성자 이메일 마스킹 → 전체 내용은 어드민 페이지에서.
 *   - 답변은 어드민 페이지의 추적 가능한 발송 흐름을 쓰도록 CTA 유도(replyTo 미설정).
 */

import type { InquiryCategoryEmail } from "./inquiry-response";

const CATEGORY_LABEL: Record<InquiryCategoryEmail, string> = {
  improvement: "개선 요청",
  question: "문의",
};

const BODY_EXCERPT_MAX = 300;

export interface InquiryAdminNotifyData {
  inquiryId: string;
  category: InquiryCategoryEmail;
  title: string;
  /** 작성자 원본 본문 (발췌해서 노출) */
  body: string;
  /** 작성자 회신 이메일 (마스킹해서 노출, null 가능) */
  authorEmail: string | null;
  createdAt: string;
  /** SITE_URL — 어드민 CTA base */
  siteUrl: string;
}

export interface BuiltInquiryAdminNotifyEmail {
  subject: string;
  html: string;
  text: string;
}

/* ── 포맷터 ── */

function formatDateKr(iso: string): string {
  const d = new Date(iso);
  const k = new Date(d.getTime() + 9 * 60 * 60 * 1000 - d.getTimezoneOffset() * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${k.getUTCFullYear()}.${p(k.getUTCMonth() + 1)}.${p(k.getUTCDate())} ${p(k.getUTCHours())}:${p(k.getUTCMinutes())} KST`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function nl2br(escaped: string): string {
  return escaped.replace(/\n/g, "<br />");
}

/** 본문 발췌 — 최대 길이 초과 시 말줄임. */
export function excerpt(body: string, max = BODY_EXCERPT_MAX): string {
  const t = body.trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/** 이메일 마스킹 — 로컬파트 앞 2자만 노출 (개인정보 최소화). */
export function maskEmail(email: string | null): string {
  if (!email) return "(미입력)";
  const at = email.indexOf("@");
  if (at < 1) return "(비공개)";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const head = local.slice(0, 2);
  return `${head}${"*".repeat(Math.max(1, local.length - head.length))}@${domain}`;
}

/* ── 본문 빌드 ── */

export function buildInquiryAdminNotifyEmail(
  data: InquiryAdminNotifyData,
): BuiltInquiryAdminNotifyEmail {
  const { inquiryId, category, title, body, authorEmail, createdAt, siteUrl } = data;
  const label = CATEGORY_LABEL[category];
  const titleShort = title.length > 40 ? `${title.slice(0, 40)}…` : title;
  const subject = `[Conatus 운영] 새 ${label} — ${titleShort}`;

  const adminUrl = `${siteUrl}/admin/inquiries`;
  const escTitle = escapeHtml(title);
  const escBody = nl2br(escapeHtml(excerpt(body)));
  const maskedEmail = escapeHtml(maskEmail(authorEmail));

  const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,'Apple SD Gothic Neo','Noto Sans KR',sans-serif;color:#0f172a">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f8fafc;padding:24px 0">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:#ffffff;border-radius:12px;border:1px solid #e2e8f0;padding:32px">
        <tr><td>
          <p style="margin:0 0 4px;font-size:12px;color:#0f766e;font-weight:600;letter-spacing:1px;text-transform:uppercase">Conatus 운영 알림</p>
          <h1 style="margin:0;font-size:21px;color:#0f172a">새 ${label}가 접수됐어요</h1>
          <p style="margin:8px 0 24px;color:#475569;font-size:14px">${formatDateKr(createdAt)} · 운영자 확인이 필요합니다.</p>

          <h2 style="margin:0 0 8px;font-size:15px;color:#0f172a">제목</h2>
          <p style="margin:0 0 20px;color:#0f172a;font-size:15px;font-weight:600;line-height:1.5;word-break:break-word">${escTitle}</p>

          <h3 style="margin:0 0 8px;font-size:13px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:600">내용 (발췌)</h3>
          <div style="margin:0 0 24px;padding:14px 16px;background:#f1f5f9;border-radius:6px;color:#334155;font-size:14px;line-height:1.7;word-break:break-word">${escBody}</div>

          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background:#f8fafc;border-radius:8px;margin:0 0 24px">
            <tr><td style="padding:6px 12px;color:#64748b;font-size:12px">유형</td><td style="padding:6px 12px;color:#0f172a;font-size:12px;text-align:right">${label}</td></tr>
            <tr><td style="padding:6px 12px;color:#64748b;font-size:12px">작성자 회신</td><td style="padding:6px 12px;color:#0f172a;font-size:12px;text-align:right">${maskedEmail}</td></tr>
            <tr><td style="padding:6px 12px;color:#64748b;font-size:12px">접수 일시</td><td style="padding:6px 12px;color:#0f172a;font-size:12px;text-align:right">${formatDateKr(createdAt)}</td></tr>
            <tr><td style="padding:6px 12px;color:#64748b;font-size:12px">문의 ID</td><td style="padding:6px 12px;color:#94a3b8;font-size:11px;font-family:monospace;text-align:right;word-break:break-all">${escapeHtml(inquiryId)}</td></tr>
          </table>

          <a href="${adminUrl}" style="display:inline-block;background:#10B981;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 22px;border-radius:8px">어드민에서 답변하기 →</a>

          <p style="margin:24px 0 0;font-size:12px;color:#94a3b8;line-height:1.6">전체 내용·작성자 정보는 어드민 문의 페이지에서 확인하세요. 답변은 어드민에서 발송해야 문의자에게 정상 전달됩니다.</p>
          <p style="margin:16px 0 0;font-size:12px;color:#94a3b8">ⓒ ${new Date().getUTCFullYear()} Conatus</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    `[Conatus 운영] 새 ${label} 접수`,
    ``,
    `제목: ${title}`,
    `유형: ${label}`,
    `작성자 회신: ${maskEmail(authorEmail)}`,
    `접수: ${formatDateKr(createdAt)}`,
    ``,
    `─── 내용(발췌) ───`,
    excerpt(body),
    ``,
    `어드민에서 답변: ${adminUrl}`,
    `문의 ID: ${inquiryId}`,
  ].join("\n");

  return { subject, html, text };
}
