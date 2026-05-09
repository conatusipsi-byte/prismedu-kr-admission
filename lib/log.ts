/**
 * 클라이언트 전용 에러 로거.
 *
 * dev: console.error — stack trace·React 경고와 섞여 디버깅 편함.
 * prod: 콘솔 출력 없음 + Sentry로 리포트(@sentry/nextjs가 DSN 없으면 no-op).
 *       서버 쪽 API 라우트의 console.error는 그대로 — 서버 로그엔 남아야 운영/CS 대응 가능.
 */
export function logError(...args: unknown[]) {
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.error(...args);
    return;
  }
  // prod: Error 객체 찾아서 Sentry로. 없으면 message로.
  const errorArg = args.find((a) => a instanceof Error) as Error | undefined;
  const context = args.filter((a) => !(a instanceof Error));
  import("@sentry/nextjs")
    .then(({ captureException, captureMessage }) => {
      if (errorArg) {
        captureException(errorArg, { extra: { context } });
      } else if (context.length > 0) {
        captureMessage(context.map((c) => (typeof c === "string" ? c : JSON.stringify(c))).join(" "), "error");
      }
    })
    .catch(() => { /* SDK 미설치 환경에서 무시 */ });
}
