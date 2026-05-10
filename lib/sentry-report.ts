import "server-only";

/**
 * 라우트 핸들러용 표준 에러 보고 헬퍼.
 *
 * 사용 패턴:
 *   } catch (e) {
 *     reportRouteError("api.match.simulate", e, { uid: auth.uid });
 *     return NextResponse.json({ error: "..." }, { status: 500 });
 *   }
 *
 * - console.error: dev 환경 + Vercel 로그
 * - Sentry.captureException: prod 에러 트래킹 (DSN 미설정이면 no-op)
 *
 * 정직성: 사용자 응답 메시지에는 e.message 를 그대로 노출하지 말 것 — 내부 경로/스택이
 * 새는 걸 막기 위해 라우트마다 친화 메시지로 매핑한다. 본 헬퍼는 보고만 담당.
 */

import * as Sentry from "@sentry/nextjs";

export function reportRouteError(
  routeId: string,
  err: unknown,
  extra?: { uid?: string; [key: string]: unknown },
): void {
  // 1) 항상 콘솔에 — Vercel 로그·dev 진단
  console.error(`[${routeId}] error:`, err);

  // 2) Sentry 보고 (DSN 미설정이면 SDK가 no-op)
  Sentry.captureException(err, {
    tags: { route: routeId },
    user: extra?.uid ? { id: extra.uid } : undefined,
    extra: extra ? sanitizeExtra(extra) : undefined,
  });
}

/** 토큰·키 같은 민감 필드를 extra 에서 제거. */
function sanitizeExtra(extra: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(extra)) {
    if (k === "uid") continue; // user.id 로 이미 보고
    if (/(token|key|secret|password|authorization)/i.test(k)) continue;
    out[k] = v;
  }
  return out;
}
