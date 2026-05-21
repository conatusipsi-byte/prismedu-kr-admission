"use client";

/**
 * /sentry-example-page — Sentry 통합 동작 검증용 페이지.
 *
 * 의도적으로 client·server 양쪽 에러를 트리거할 수 있는 버튼 제공.
 * production 에선 robots noindex — 검색 결과 노출 X.
 *
 * 사용:
 *   1. 본 페이지 진입
 *   2. "Throw client error" / "Throw server error" 클릭
 *   3. Sentry Dashboard → Issues 에서 이벤트 확인 (~1분 내)
 *
 * 보안: 본 페이지는 환경 검증 외 다른 목적 없음. 출시 후 admin-only 또는 삭제 가능.
 */

import * as React from "react";
import * as Sentry from "@sentry/nextjs";

export default function SentryExamplePage(): React.ReactElement {
  const [serverStatus, setServerStatus] = React.useState<string>("");
  const [clientStatus, setClientStatus] = React.useState<string>("");

  const throwClientError = (): void => {
    setClientStatus("throwing…");
    // Sentry 가 자동 캡처. 추가로 manual capture 도 같이.
    try {
      throw new Error(
        "Sentry example client error — " + new Date().toISOString(),
      );
    } catch (e) {
      Sentry.captureException(e);
      setClientStatus(`✅ 클라이언트 에러 전송됨 (${(e as Error).message.slice(0, 60)})`);
    }
  };

  const triggerServerError = async (): Promise<void> => {
    setServerStatus("calling…");
    try {
      const res = await fetch("/api/sentry-example-api");
      const json = (await res.json()) as { ok?: boolean; error?: string };
      setServerStatus(`HTTP ${res.status}: ${JSON.stringify(json).slice(0, 100)}`);
    } catch (e) {
      setServerStatus(`fetch failed: ${(e as Error).message}`);
    }
  };

  return (
    <main className="mx-auto max-w-content px-gutter py-12 flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-bold">Sentry 통합 검증</h1>
        <p className="text-sm text-muted-foreground break-keep-all">
          본 페이지는 Sentry SDK 가 client/server 양쪽 에러를 정상 캡처하는지
          확인용입니다. 출시 후 삭제 또는 admin-only 로 전환하세요.
        </p>
      </header>

      <section className="rounded-2xl border border-border bg-card p-5 flex flex-col gap-3">
        <h2 className="font-semibold">Client error (브라우저)</h2>
        <button
          type="button"
          onClick={throwClientError}
          className="self-start rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Throw client error
        </button>
        {clientStatus && (
          <p className="text-xs text-muted-foreground">{clientStatus}</p>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 flex flex-col gap-3">
        <h2 className="font-semibold">Server error (API route)</h2>
        <button
          type="button"
          onClick={triggerServerError}
          className="self-start rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Trigger server error
        </button>
        {serverStatus && (
          <p className="text-xs text-muted-foreground font-mono">{serverStatus}</p>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        검증 절차: 버튼 클릭 →{" "}
        <a
          href="https://sentry.io/organizations/conatusipsi-e5/issues/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-700 underline"
        >
          Sentry Dashboard
        </a>{" "}
        에서 ~1분 내 이벤트 도착 확인.
      </p>
    </main>
  );
}
