/**
 * Next.js client instrumentation — 브라우저 진입 직후 Sentry init.
 *
 * Next.js 15.3+ 표준 패턴 (Turbopack 호환):
 *   - init 코드는 본 파일 안에서 직접 호출 (sentry.client.config.ts 별도 파일 X)
 *   - onRouterTransitionStart export — App Router navigation 트레이스 활성화
 *
 * DSN 미설정 시 init 건너뛰어 silent no-op (회사 DSN 누설 방지를 위해
 * NEXT_PUBLIC_SENTRY_DSN 로만 주입 — SENTRY_DSN(서버 전용)과 분리).
 *
 * 환경 구분:
 *   - VERCEL_ENV: production / preview / development (Vercel 빌드 자동 주입)
 *   - 로컬 dev/build: development 폴백
 *
 * Replay 정책:
 *   - 정상 세션 녹화 X (replaysSessionSampleRate = 0)
 *   - 에러 발생 시에만 100% 녹화 (replaysOnErrorSampleRate = 1.0)
 *   - production 외 환경(preview·dev) 은 0 — 노이즈 감소
 */

import * as Sentry from "@sentry/nextjs";
import { sentryBeforeSend } from "@/lib/sentry-pii-filter";

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;
const ENV =
  process.env.NEXT_PUBLIC_VERCEL_ENV ||
  process.env.VERCEL_ENV ||
  process.env.NODE_ENV ||
  "development";
const IS_PROD = ENV === "production";

if (DSN) {
  Sentry.init({
    dsn: DSN,
    environment: ENV,
    tracesSampleRate: IS_PROD ? 0.1 : 0,
    replaysSessionSampleRate: 0, // 정상 세션 녹화 X (개인정보 보호 + 비용)
    replaysOnErrorSampleRate: IS_PROD ? 1.0 : 0, // 에러 시 100% 녹화
    // PII 마스킹 — lib/sentry-pii-filter 의 공용 hook 사용.
    // 한국 입시 도메인 민감 필드(내신·등급·합격확률·학생부 등) 도 함께 redact.
    beforeSend: sentryBeforeSend,
    // Next.js Turbopack/HMR에서 발생하는 ChunkLoadError 등은 리포팅 제외
    ignoreErrors: [
      "ChunkLoadError",
      "Loading chunk",
      "Loading CSS chunk",
      "ResizeObserver loop",
      "Non-Error promise rejection captured",
    ],
  });
}

/**
 * App Router navigation 트레이스 — Next.js 15.3+ 가 본 export 를 호출.
 * Sentry SDK 가 router transition 을 트레이스로 wrapping 한다 (route change 성능 추적).
 */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
