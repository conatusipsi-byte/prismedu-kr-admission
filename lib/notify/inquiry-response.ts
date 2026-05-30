/**
 * 문의 답변 알림 — 채널 추상화 (2026-05-30).
 *
 * 현재 채널: Resend (이메일).
 * 향후 채널: 카카오 알림톡 (biz 채널 + 템플릿 심사 통과 후 추가).
 *
 * 호출 측 (app/api/admin/inquiries/[id]/respond/route.ts) 는 본 모듈의 결과
 * (NotifyResult) 를 그대로 inquiries.response_email_sent_at / response_email_error 에 기록.
 *
 * 정직성 (P-002):
 *   - 회신 주소가 양쪽 다 NULL → reason="no_recipient" 반환 (발송 skip 명시).
 *   - Resend API key 미설정 → reason="no_api_key" (조용히 종료).
 *   - 발송 실패는 답변 저장을 차단하지 않음. 사용자에겐 운영자 측에서 별도 안내.
 *
 * 카카오 알림톡 추가 시:
 *   sendInquiryResponseAlimtalk({ inquiry, alimtalkTemplate, ... })
 *   를 본 모듈에 추가하고, 호출 측이 채널 우선순위 (alimtalk → email 폴백) 정함.
 */

import "server-only";
import * as Sentry from "@sentry/nextjs";
import { sendEmail } from "@/lib/email/resend";
import {
  buildInquiryResponseEmail,
  type InquiryCategoryEmail,
} from "@/lib/email/templates/inquiry-response";

/** 채널 발송 결과 — 모든 채널 공통 형식. */
export type NotifyResult =
  | { ok: true; channel: "email" | "alimtalk"; messageId: string; to: string }
  | {
      ok: false;
      reason:
        | "no_recipient"     // 회신 주소 양쪽 다 NULL (카카오 가입자 케이스)
        | "no_api_key"       // 외부 서비스 키 미설정
        | "send_failed"      // 외부 서비스 호출 실패
        | "unknown";
      detail?: string;
    };

export interface SendInquiryResponseEmailArgs {
  inquiryId: string;
  category: InquiryCategoryEmail;
  title: string;
  originalBody: string;
  adminResponse: string;
  createdAt: string;
  answeredAt: string;
  /** 우선순위 1 — DB inquiries.contact_email */
  contactEmail: string | null;
  /** 우선순위 2 — auth.users.email (카카오 가입자는 NULL 가능) */
  userEmail: string | null;
  /** SITE_URL — 메일 내 CTA */
  siteUrl: string;
}

/**
 * 이메일 채널로 답변 발송.
 *
 * 회신 주소 우선순위:
 *   1) contactEmail (사용자가 명시한 별도 주소)
 *   2) userEmail (auth.users.email)
 *   3) 둘 다 NULL → skip (no_recipient)
 */
export async function sendInquiryResponseEmail(
  args: SendInquiryResponseEmailArgs,
): Promise<NotifyResult> {
  const recipient = args.contactEmail ?? args.userEmail ?? null;
  if (!recipient) {
    return { ok: false, reason: "no_recipient", detail: "user.email + contact_email 모두 NULL" };
  }

  try {
    const { subject, html, text } = buildInquiryResponseEmail({
      inquiryId: args.inquiryId,
      category: args.category,
      title: args.title,
      originalBody: args.originalBody,
      adminResponse: args.adminResponse,
      createdAt: args.createdAt,
      answeredAt: args.answeredAt,
      siteUrl: args.siteUrl,
    });

    const result = await sendEmail({
      to: recipient,
      subject,
      html,
      text,
      // 답장 가능 — 운영 이메일로 즉시 후속 대화.
      replyTo: "conatusipsi@gmail.com",
      tags: [
        { name: "kind", value: "inquiry_response" },
        { name: "category", value: args.category },
      ],
    });

    if (result.ok) {
      return { ok: true, channel: "email", messageId: result.id, to: recipient };
    }
    if (result.reason === "no_api_key") {
      return { ok: false, reason: "no_api_key" };
    }
    return { ok: false, reason: "send_failed", detail: result.error };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    Sentry.captureException(err, {
      tags: { service: "notify-inquiry-response" },
      extra: { inquiryId: args.inquiryId },
    });
    return { ok: false, reason: "unknown", detail: err.message };
  }
}

/**
 * 향후 알림톡 채널 — placeholder. 비즈니스 채널 + 템플릿 심사 통과 후 구현.
 *
 * export async function sendInquiryResponseAlimtalk(...): Promise<NotifyResult> { ... }
 */
