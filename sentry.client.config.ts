/**
 * Sentry client config — browser 런타임.
 *
 * DSN 미설정(env 없음) 시 init을 건너뛰어 silent no-op.
 * 회사 DSN이 새지 않도록 NEXT_PUBLIC_SENTRY_DSN로만 주입 — SENTRY_DSN(서버 전용)과 분리.
 */

import * as Sentry from "@sentry/nextjs";

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (DSN) {
  Sentry.init({
    dsn: DSN,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENV || process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: process.env.NODE_ENV === "production" ? 1.0 : 0,
    // 개인정보 보호 — 네트워크 바디/URL의 민감 토큰 제거는 Sentry SDK 기본 scrubber가 처리.
    // 추가로 profile/email을 event에 싣지 않도록 beforeSend에서 삭제.
    beforeSend(event) {
      if (event.user) {
        delete event.user.email;
        delete event.user.username;
      }
      return event;
    },
    // Next.js Turbopack/HMR에서 발생하는 ChunkLoadError 등은 리포팅 제외
    ignoreErrors: [
      "ChunkLoadError",
      "Loading chunk",
      "Loading CSS chunk",
      "ResizeObserver loop",
    ],
  });
}
