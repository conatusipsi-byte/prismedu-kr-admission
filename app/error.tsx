"use client";

/**
 * 전역 error.tsx — 모든 페이지의 server/client 에러 catch
 *
 * 페이지별 error.tsx보다 우선순위 낮음. 페이지에 자체 error.tsx가 없을 때 fallback.
 * Sentry.captureException 으로 명시 보고 (DSN 미설정이면 no-op) + 친화 폴백.
 */

import * as React from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";
import { ArrowRight, Home, RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.ReactElement {
  React.useEffect(() => {
    Sentry.captureException(error);
    if (process.env.NODE_ENV !== "production") {
      console.error("[error.tsx]", error);
    }
  }, [error]);

  return (
    <div className="relative min-h-[calc(100dvh-4rem)] flex items-center justify-center px-gutter-sm md:px-gutter py-12">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute top-[20%] left-[10%] h-96 w-96 rounded-full bg-rose-300/20 blur-3xl dark:bg-rose-900/20" />
        <div className="absolute bottom-[10%] right-[10%] h-80 w-80 rounded-full bg-amber-300/15 blur-3xl dark:bg-amber-800/15" />
      </div>

      <div className="relative max-w-xl mx-auto text-center">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-rose-400 to-amber-500 text-white flex items-center justify-center shadow-xl shadow-rose-500/30">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h1 className="mt-6 text-2xl lg:text-3xl font-bold text-foreground tracking-tight">
          예상치 못한 오류가 발생했어요
        </h1>
        <p className="mt-3 text-sm lg:text-base text-muted-foreground break-keep-all max-w-md mx-auto leading-relaxed">
          잠시 후 다시 시도해주세요. 문제가 지속되면 고객센터로 연락주시면
          영업일 기준 3일 이내 응답드립니다.
        </p>

        {error?.digest && (
          <p className="mt-4 text-2xs text-muted-foreground/70 font-mono">
            오류 ID: {error.digest}
          </p>
        )}

        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-2">
          <Button
            onClick={reset}
            size="lg"
            className="bg-mint-600 hover:bg-mint-700 text-white shadow-lg shadow-mint-500/25"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            다시 시도
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/">
              <Home className="h-3.5 w-3.5" />
              홈으로
            </Link>
          </Button>
          <Button asChild size="lg" variant="ghost">
            <Link href="/help">
              고객센터
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
