/**
 * GET /api/sentry-example-api — Sentry server-side 캡처 검증.
 *
 * 의도적으로 throw 하여 Sentry Node SDK 가 이벤트를 잡는지 확인.
 * NextResponse 직전 throw 라 onRequestError → captureRequestError 가
 * 자동 캡처 (instrumentation.ts 의 export 참조).
 */

import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";

class SentryExampleAPIError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SentryExampleAPIError";
  }
}

export const dynamic = "force-dynamic";

export function GET(): NextResponse {
  const err = new SentryExampleAPIError(
    "Sentry example server error — " + new Date().toISOString(),
  );
  // 추가로 명시 capture (onRequestError fallback)
  Sentry.captureException(err);
  // 클라이언트에 에러 응답 반환 — 의도된 실패
  return NextResponse.json(
    { ok: false, error: err.message },
    { status: 500 },
  );
}
