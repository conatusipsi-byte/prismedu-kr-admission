/**
 * Next.js client instrumentation — 브라우저 진입 직후 Sentry init.
 *
 * Next.js 15.3+ 부터 instrumentation-client.ts 가 표준. 이전 sentry.client.config.ts
 * 의 init 로직을 그대로 import 만 한다 (DSN 미설정이면 no-op).
 */

import "./sentry.client.config";
