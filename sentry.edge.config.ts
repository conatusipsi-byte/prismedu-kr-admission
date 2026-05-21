/**
 * Sentry edge config — Edge Runtime (middleware, opengraph-image.tsx).
 *
 * Node API 비가용 → Sentry SDK 가 edge-호환 모듈만 사용.
 * middleware.ts 가 모든 요청을 통과시키므로 트래픽 많음 — sample rate 보수적.
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
    beforeSend: sentryBeforeSend,
  });
}
