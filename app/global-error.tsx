"use client";

/**
 * 전역 global-error.tsx — 루트 레이아웃 자체 에러 catch
 *
 * app/error.tsx 는 페이지 트리 안에서만 잡으며 루트 layout/template 에서 발생한 에러는
 * 잡지 못한다. global-error.tsx 는 layout 자체가 망가져도 표시되는 마지막 보루.
 * Sentry.captureException 으로 에러 보고 + 브랜드 일관 폴백 렌더.
 *
 * 자체 <html>/<body> 가 필요 — 부모 레이아웃이 동작 안 하기 때문.
 */

import * as React from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.ReactElement {
  React.useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="ko">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif",
          background: "#fff",
          color: "#0a0a0a",
        }}
      >
        <div
          style={{
            maxWidth: 480,
            margin: "0 auto",
            padding: "32px 24px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: "linear-gradient(135deg,#fb7185,#f59e0b)",
              color: "#fff",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 28,
              fontWeight: 700,
            }}
            aria-hidden
          >
            !
          </div>
          <h1
            style={{
              marginTop: 24,
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: "-0.01em",
            }}
          >
            서비스에 문제가 발생했어요
          </h1>
          <p
            style={{
              marginTop: 12,
              fontSize: 14,
              color: "#525252",
              lineHeight: 1.6,
              wordBreak: "keep-all",
            }}
          >
            잠시 후 다시 시도해주세요. 문제가 지속되면 고객센터로 연락 주시면
            영업일 기준 3일 이내 응답드립니다.
          </p>

          {error?.digest && (
            <p
              style={{
                marginTop: 16,
                fontSize: 11,
                color: "#a3a3a3",
                fontFamily: "ui-monospace, SFMono-Regular, monospace",
              }}
            >
              오류 ID: {error.digest}
            </p>
          )}

          <div
            style={{
              marginTop: 28,
              display: "flex",
              gap: 8,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={reset}
              style={{
                padding: "10px 20px",
                background: "#00C9A7",
                color: "#fff",
                border: 0,
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              다시 시도
            </button>
            <Link
              href="/"
              style={{
                padding: "10px 20px",
                background: "#fff",
                color: "#0a0a0a",
                border: "1px solid #d4d4d4",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              홈으로
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
