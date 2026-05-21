/**
 * Resend transactional 메일 클라이언트 (서버 전용).
 *
 * 사용처:
 *   - 결제 영수증 / 환불 안내
 *   - 합격예측 리포트 발송
 *   - 시즌 알림 (모집요강 시즌 7~11월)
 *   - 운영 알림 (어드민 sanitize_events 이벤트 등)
 *
 * Supabase Auth 의 가입 confirmation·비밀번호 reset 메일은 별도 경로:
 *   Auth 가 직접 Resend SMTP 로 발송 (Management API config).
 *   본 모듈은 앱 코드에서 직접 발송이 필요한 transactional 케이스 전용.
 *
 * 정직성 (P-002):
 *   - RESEND_API_KEY 미설정 시 no-op + warn (가짜 성공 응답 X).
 *   - 실패 시 Sentry 캡처 + 명시적 에러 결과 반환.
 *   - PII 마스킹은 호출 측 책임 (수신주소 자체는 발송 목적상 redact 불가).
 */

import "server-only";
import { Resend } from "resend";
import * as Sentry from "@sentry/nextjs";

/** 기본 발신 — Resend Dashboard 에서 verify 된 conatusipsi.com 도메인. */
export const DEFAULT_FROM = "Conatus <noreply@conatusipsi.com>";

/**
 * 호출 측이 ENV 부재를 명시적으로 처리할 수 있도록 sendEmail 의 결과는
 * discriminated union — `ok: true / false`.
 */
export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; reason: "no_api_key" | "send_failed"; error?: string };

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  /** plain-text fallback — 미제공 시 Resend 가 html 에서 자동 생성. */
  text?: string;
  from?: string;
  /** 회신 주소 (선택). 기본 미설정. */
  replyTo?: string | string[];
  /** Resend headers — tag/X-Entity-Ref-Id 등 운영 메타 첨부 시 사용. */
  tags?: Array<{ name: string; value: string }>;
}

/**
 * Singleton 클라이언트 — process lifetime 동안 1회 생성.
 * API key 가 없으면 null. 호출 측이 null 가드 후 사용.
 */
let _client: Resend | null | undefined;
function getClient(): Resend | null {
  if (_client !== undefined) return _client;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn("[email/resend] RESEND_API_KEY 미설정 — 메일 발송 no-op");
    _client = null;
    return null;
  }
  _client = new Resend(key);
  return _client;
}

/** 테스트용 — singleton 초기화. */
export function __resetResendClient(): void {
  _client = undefined;
}

/**
 * 트랜잭션 메일 발송.
 *
 * 호출 예:
 *   await sendEmail({
 *     to: user.email,
 *     subject: "결제 완료",
 *     html: receiptHtml,
 *     tags: [{ name: "kind", value: "order_receipt" }],
 *   });
 */
export async function sendEmail(opts: SendEmailOptions): Promise<SendEmailResult> {
  const client = getClient();
  if (!client) {
    return { ok: false, reason: "no_api_key" };
  }

  try {
    const res = await client.emails.send({
      from: opts.from ?? DEFAULT_FROM,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
      replyTo: opts.replyTo,
      tags: opts.tags,
    });
    if (res.error) {
      const msg = res.error.message ?? String(res.error);
      Sentry.captureException(new Error(`[email/resend] send failed: ${msg}`), {
        tags: { service: "resend" },
        extra: { subject: opts.subject },
      });
      return { ok: false, reason: "send_failed", error: msg };
    }
    if (!res.data?.id) {
      return { ok: false, reason: "send_failed", error: "no_id_returned" };
    }
    return { ok: true, id: res.data.id };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    Sentry.captureException(err, {
      tags: { service: "resend" },
      extra: { subject: opts.subject },
    });
    return { ok: false, reason: "send_failed", error: err.message };
  }
}
