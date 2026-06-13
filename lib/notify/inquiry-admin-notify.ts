/**
 * 새 문의 → 운영자 알림 발송 (2026-06-13).
 *
 * 채널: Resend (이메일). 수신: MASTER_EMAILS(운영자). 향후 카카오 알림톡 추가 가능.
 *
 * 호출: app/api/inquiries POST 가 문의 insert 직후 best-effort 로 호출.
 *
 * 정직성/안전 (P-002):
 *   - MASTER_EMAILS 미설정 → reason="no_recipient" (조용히 skip, 에러 X).
 *   - RESEND_API_KEY 미설정 → reason="no_api_key" (graceful).
 *   - 발송 실패는 문의 접수를 막지 않음 (호출 측이 결과를 로깅만).
 *   - 작성자 개인정보는 템플릿에서 마스킹/발췌 — 전체는 어드민 페이지에서.
 */

import "server-only";
import * as Sentry from "@sentry/nextjs";
import { sendEmail } from "@/lib/email/resend";
import { MASTER_EMAILS } from "@/lib/master";
import { buildInquiryAdminNotifyEmail } from "@/lib/email/templates/inquiry-admin-notify";
import type { InquiryCategoryEmail } from "@/lib/email/templates/inquiry-response";

export type AdminNotifyResult =
  | { ok: true; messageId: string; recipientCount: number }
  | {
      ok: false;
      reason: "no_recipient" | "no_api_key" | "send_failed" | "unknown";
      detail?: string;
    };

export interface SendInquiryAdminNotificationArgs {
  inquiryId: string;
  category: InquiryCategoryEmail;
  title: string;
  body: string;
  /** 작성자 회신 이메일 (마스킹되어 노출, null 가능) */
  authorEmail: string | null;
  createdAt: string;
  siteUrl: string;
}

/**
 * 운영자(MASTER_EMAILS) 전원에게 새 문의 알림 메일 1건 발송.
 * MASTER_EMAILS 가 비어 있으면 no_recipient 로 graceful skip.
 */
export async function sendInquiryAdminNotification(
  args: SendInquiryAdminNotificationArgs,
): Promise<AdminNotifyResult> {
  if (MASTER_EMAILS.length === 0) {
    return { ok: false, reason: "no_recipient", detail: "MASTER_EMAILS 미설정 — 운영자 알림 skip" };
  }

  try {
    const { subject, html, text } = buildInquiryAdminNotifyEmail({
      inquiryId: args.inquiryId,
      category: args.category,
      title: args.title,
      body: args.body,
      authorEmail: args.authorEmail,
      createdAt: args.createdAt,
      siteUrl: args.siteUrl,
    });

    const result = await sendEmail({
      to: [...MASTER_EMAILS],
      subject,
      html,
      text,
      // replyTo 미설정 — 운영자는 어드민 추적 발송 흐름을 사용(직접 회신 시 미추적 방지).
      tags: [
        { name: "kind", value: "inquiry_admin_notify" },
        { name: "category", value: args.category },
      ],
    });

    if (result.ok) {
      return { ok: true, messageId: result.id, recipientCount: MASTER_EMAILS.length };
    }
    if (result.reason === "no_api_key") {
      return { ok: false, reason: "no_api_key" };
    }
    return { ok: false, reason: "send_failed", detail: result.error };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    Sentry.captureException(err, {
      tags: { service: "notify-inquiry-admin" },
      extra: { inquiryId: args.inquiryId },
    });
    return { ok: false, reason: "unknown", detail: err.message };
  }
}
