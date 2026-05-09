/**
 * Sentry server config — Node.js 런타임 (API routes, SSR).
 * 서버 DSN은 SENTRY_DSN (public 접두사 없음) — 로그에 노출되지 않도록 주의.
 */

import * as Sentry from "@sentry/nextjs";

const DSN = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

if (DSN) {
  Sentry.init({
    dsn: DSN,
    environment: process.env.SENTRY_ENV || process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0,
    // 서버 이벤트는 민감할 수 있음 — request body는 Sentry SDK가 기본 scrub하되,
    // 명시적으로 user email을 제거.
    beforeSend(event) {
      if (event.user) {
        delete event.user.email;
        delete event.user.username;
      }
      return event;
    },
  });
}
