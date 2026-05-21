/**
 * Sentry server config — Node.js 런타임 (API routes, SSR).
 *
 * 서버 DSN 은 SENTRY_DSN (public 접두사 없음) — 로그·번들 노출 방지.
 * NEXT_PUBLIC_SENTRY_DSN 도 fallback 으로 인정 (단일 키 운용).
 *
 * environment: VERCEL_ENV 우선 — Vercel 의 production/preview/development 자동 구분.
 */

import * as Sentry from "@sentry/nextjs";
import { sentryBeforeSend } from "@/lib/sentry-pii-filter";

const DSN = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
const ENV = process.env.VERCEL_ENV || process.env.NODE_ENV || "development";
const IS_PROD = ENV === "production";

if (DSN) {
  Sentry.init({
    dsn: DSN,
    environment: ENV,
    tracesSampleRate: IS_PROD ? 0.1 : 0,
    // 서버 이벤트 — 요청/응답 body 의 user_specs / match results / spec snapshot 등
    // 민감 입시 데이터가 attach 될 수 있음. PII 필터로 자동 redact.
    beforeSend: sentryBeforeSend,
  });
}
