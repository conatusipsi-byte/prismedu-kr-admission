/**
 * 결제 영수증 이메일 — Day 5 (2026-05-25).
 *
 * 호출: app/api/payment/confirm/route.ts 가 entitlement 부여 성공 후 호출.
 * 발송 실패해도 결제 성공 응답 (Sentry 캡처). 본 모듈은 HTML 빌드만 담당.
 *
 * 상품별 사용 안내:
 *   - 분석 리포트 / 시즌권: 즉시 사용 가능, /analysis 안내
 *   - consult_one: /consulting 에서 예약, 결제일 + 60일 이내
 *   - season_consult_1: 시즌권 즉시 + 컨설팅 1회 (시기 미지정)
 *   - season_consult_3: 시즌권 즉시 + 컨설팅 3회 (6모/9모/수능 이후 시기별)
 *
 * 정직성 (P-002):
 *   - 시기 지정 슬롯은 사용 가능일 명시.
 *   - 24시간 전 취소 정책 명시.
 *   - 결제 금액 = 실제 청구액 (얼리버드 적용 시).
 */

import type { ProductDefKr } from "@/lib/plans";
import { TIME_SLOT_LABELS, TIME_SLOT_VALID_FROM } from "@/lib/plans";

export interface PaymentReceiptData {
  orderId: string;
  product: ProductDefKr;
  /** 실제 청구 금액 (KRW, 얼리버드 시점 분기 적용됨) */
  amountKrw: number;
  /** ISO timestamp — 결제 승인 시각 */
  approvedAt: string;
  /** 토스 결제 수단 라벨 (예: "신용카드", "토스페이") — 없을 수 있음 */
  paymentMethod?: string;
  /** entitlement.validUntil ISO — 유효 기간 노출 */
  validUntilIso: string;
  /** SITE_URL — 메일 안의 CTA 링크 base */
  siteUrl: string;
}

export interface BuiltReceipt {
  subject: string;
  html: string;
  text: string;
}

/* ─────────────────────────────────────────────────────────────────────
   포맷터
   ───────────────────────────────────────────────────────────────────── */

function formatKrwAmount(n: number): string {
  return `₩${n.toLocaleString("ko-KR")}`;
}

function formatDateKr(iso: string): string {
  const d = new Date(iso);
  // YYYY.MM.DD HH:MM (KST)
  const offsetMs = 9 * 60 * 60 * 1000;
  const k = new Date(d.getTime() + offsetMs - d.getTimezoneOffset() * 60 * 1000);
  const yyyy = k.getUTCFullYear();
  const mm = String(k.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(k.getUTCDate()).padStart(2, "0");
  const hh = String(k.getUTCHours()).padStart(2, "0");
  const mi = String(k.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}.${mm}.${dd} ${hh}:${mi} KST`;
}

function formatDateOnly(iso: string): string {
  return iso.slice(0, 10);
}

/* ─────────────────────────────────────────────────────────────────────
   상품별 사용 안내 블록
   ───────────────────────────────────────────────────────────────────── */

function buildUsageGuide(p: ProductDefKr, siteUrl: string): string {
  if (p.kind === "consult_one") {
    return `
      <h3 style="margin:24px 0 8px;font-size:15px;color:#0f172a">사용 안내</h3>
      <ul style="margin:0;padding-left:18px;color:#475569;font-size:14px;line-height:1.7">
        <li>결제일로부터 <strong>60일 이내</strong> 컨설팅 1회 예약 가능합니다.</li>
        <li>예약은 <a href="${siteUrl}/consulting" style="color:#0f766e">컨설팅 예약 페이지</a> 에서 시간을 선택하세요.</li>
        <li>예약 후 <strong>24시간 전까지</strong> 취소 가능 (자동 환불).</li>
      </ul>`;
  }
  if (p.kind === "season_pass") {
    return `
      <h3 style="margin:24px 0 8px;font-size:15px;color:#0f172a">사용 안내</h3>
      <ul style="margin:0;padding-left:18px;color:#475569;font-size:14px;line-height:1.7">
        <li>시즌권은 <strong>즉시 활성화</strong> — 학과 분석·AI 카운슬러 무제한.</li>
        <li>유효 기간: 결제일 + 180일 (수시·정시 한 사이클).</li>
        <li><a href="${siteUrl}/analysis" style="color:#0f766e">분석 시작</a> 에서 사용하세요.</li>
      </ul>`;
  }
  if (p.kind === "report_one") {
    return `
      <h3 style="margin:24px 0 8px;font-size:15px;color:#0f172a">사용 안내</h3>
      <ul style="margin:0;padding-left:18px;color:#475569;font-size:14px;line-height:1.7">
        <li>분석 리포트 — 결제 후 <strong>30일간 무제한</strong> 재실행 가능.</li>
        <li><a href="${siteUrl}/analysis" style="color:#0f766e">분석 시작</a> 에서 성적·비교과를 입력하세요.</li>
      </ul>`;
  }
  if (p.kind === "season_consult_1") {
    return `
      <h3 style="margin:24px 0 8px;font-size:15px;color:#0f172a">사용 안내 (패키지)</h3>
      <ul style="margin:0;padding-left:18px;color:#475569;font-size:14px;line-height:1.7">
        <li><strong>시즌권 즉시 활성화</strong> — 학과 분석·AI 카운슬러 무제한 (180일).</li>
        <li><strong>1:1 컨설팅 1회</strong> — 시기 무관, <a href="${siteUrl}/consulting" style="color:#0f766e">컨설팅 예약</a> 에서 사용.</li>
        <li>컨설팅 예약 24시간 전까지 취소 가능.</li>
      </ul>`;
  }
  if (p.kind === "season_consult_3") {
    const beforeJune = formatDateOnly(TIME_SLOT_VALID_FROM.before_june);
    const beforeSept = formatDateOnly(TIME_SLOT_VALID_FROM.before_sept);
    const afterCsat = formatDateOnly(TIME_SLOT_VALID_FROM.after_csat);
    return `
      <h3 style="margin:24px 0 8px;font-size:15px;color:#0f172a">사용 안내 (시기 지정 패키지)</h3>
      <ul style="margin:0;padding-left:18px;color:#475569;font-size:14px;line-height:1.7">
        <li><strong>시즌권 즉시 활성화</strong> — 학과 분석·AI 카운슬러 무제한 (1년).</li>
        <li><strong>1:1 컨설팅 3회</strong> — 시기별 예약 가능 시점:
          <ul style="margin:6px 0 0;padding-left:18px">
            <li>${TIME_SLOT_LABELS.before_june}: ${beforeJune} 부터</li>
            <li>${TIME_SLOT_LABELS.before_sept}: ${beforeSept} 부터</li>
            <li>${TIME_SLOT_LABELS.after_csat}: ${afterCsat} 부터</li>
          </ul>
        </li>
        <li><a href="${siteUrl}/consulting" style="color:#0f766e">컨설팅 예약</a> 에서 사용 가능 시점이 도래한 슬롯만 예약할 수 있어요.</li>
        <li>컨설팅 예약 24시간 전까지 취소 가능 (취소 시 해당 시기 슬롯 자동 복구).</li>
      </ul>`;
  }
  // subscription_*  / unknown
  return `
    <h3 style="margin:24px 0 8px;font-size:15px;color:#0f172a">사용 안내</h3>
    <p style="margin:0;color:#475569;font-size:14px">
      결제 즉시 권한이 활성화됐어요. 계정 페이지에서 사용 현황을 확인하세요.
    </p>`;
}

/* ─────────────────────────────────────────────────────────────────────
   영수증 HTML 빌드
   ───────────────────────────────────────────────────────────────────── */

export function buildPaymentReceiptEmail(data: PaymentReceiptData): BuiltReceipt {
  const { orderId, product, amountKrw, approvedAt, paymentMethod, validUntilIso, siteUrl } = data;
  const subject = `[Conatus] 결제 완료 — ${product.displayName}`;

  const usage = buildUsageGuide(product, siteUrl);

  const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,'Apple SD Gothic Neo','Noto Sans KR',sans-serif;color:#0f172a">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f8fafc;padding:24px 0">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:#ffffff;border-radius:12px;border:1px solid #e2e8f0;padding:32px">
          <tr>
            <td>
              <p style="margin:0 0 4px;font-size:12px;color:#0f766e;font-weight:600;letter-spacing:1px;text-transform:uppercase">Conatus</p>
              <h1 style="margin:0;font-size:22px;color:#0f172a">결제 영수증</h1>
              <p style="margin:8px 0 24px;color:#475569;font-size:14px">결제가 정상 처리되었습니다.</p>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background:#f8fafc;border-radius:8px;padding:16px">
                <tr><td style="padding:6px 12px;color:#64748b;font-size:13px">상품</td><td style="padding:6px 12px;color:#0f172a;font-size:14px;font-weight:600;text-align:right">${product.displayName}</td></tr>
                <tr><td style="padding:6px 12px;color:#64748b;font-size:13px">결제 금액</td><td style="padding:6px 12px;color:#0f172a;font-size:14px;font-weight:600;text-align:right">${formatKrwAmount(amountKrw)}</td></tr>
                ${paymentMethod ? `<tr><td style="padding:6px 12px;color:#64748b;font-size:13px">결제 수단</td><td style="padding:6px 12px;color:#0f172a;font-size:14px;text-align:right">${paymentMethod}</td></tr>` : ""}
                <tr><td style="padding:6px 12px;color:#64748b;font-size:13px">결제 일시</td><td style="padding:6px 12px;color:#0f172a;font-size:14px;text-align:right">${formatDateKr(approvedAt)}</td></tr>
                <tr><td style="padding:6px 12px;color:#64748b;font-size:13px">유효 기간</td><td style="padding:6px 12px;color:#0f172a;font-size:14px;text-align:right">${formatDateOnly(validUntilIso)} 까지</td></tr>
                <tr><td style="padding:6px 12px;color:#64748b;font-size:13px">주문 번호</td><td style="padding:6px 12px;color:#94a3b8;font-size:11px;font-family:monospace;text-align:right;word-break:break-all">${orderId}</td></tr>
              </table>

              ${usage}

              <h3 style="margin:24px 0 8px;font-size:15px;color:#0f172a">환불 정책</h3>
              <ul style="margin:0;padding-left:18px;color:#475569;font-size:13px;line-height:1.7">
                <li>분석·시즌권: 결제 후 7일 이내 미사용 시 전액 환불 가능.</li>
                <li>컨설팅: 예약 24시간 전까지 취소 시 자동 환불.</li>
                <li><a href="${siteUrl}/refund" style="color:#0f766e">환불 정책 전문</a></li>
              </ul>

              <p style="margin:24px 0 0;font-size:12px;color:#94a3b8;line-height:1.6">
                문의: <a href="mailto:conatusipsi@gmail.com" style="color:#0f766e">conatusipsi@gmail.com</a><br/>
                ⓒ ${new Date().getUTCFullYear()} Conatus. 이 메일은 결제 처리에 따라 자동 발송됐어요.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  // text fallback — 핵심 정보만
  const text = [
    `[Conatus] 결제 완료`,
    ``,
    `상품: ${product.displayName}`,
    `결제 금액: ${formatKrwAmount(amountKrw)}`,
    paymentMethod ? `결제 수단: ${paymentMethod}` : "",
    `결제 일시: ${formatDateKr(approvedAt)}`,
    `유효 기간: ${formatDateOnly(validUntilIso)} 까지`,
    `주문 번호: ${orderId}`,
    ``,
    `사용: ${siteUrl}/${product.type === "consulting" || product.type === "bundle" ? "consulting" : "analysis"}`,
    `환불 정책: ${siteUrl}/refund`,
    `문의: conatusipsi@gmail.com`,
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, html, text };
}
