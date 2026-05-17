"use client";

/**
 * ChatLoadingIndicator — AI 응답 대기 중 표시
 *
 * - 점 3개 펄스 애니메이션
 * - 30초 이상 경과 시 "응답이 늦어지고 있습니다" 안내 (사용자가 멈춤·이탈 의심 X)
 *
 * 본 컴포넌트는 ChatInterface의 응답 대기 상태에서만 mount/unmount.
 */

import * as React from "react";
import { Bot } from "lucide-react";
import { cn } from "@/lib/utils";

const SLOW_THRESHOLD_MS = 30_000;

export interface ChatLoadingIndicatorProps {
  className?: string;
}

export function ChatLoadingIndicator({
  className,
}: ChatLoadingIndicatorProps): React.ReactElement {
  const [slow, setSlow] = React.useState(false);

  React.useEffect(() => {
    const t = setTimeout(() => setSlow(true), SLOW_THRESHOLD_MS);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      data-component="chat-loading-indicator"
      data-slow={slow ? "true" : "false"}
      className={cn("flex w-full gap-2", className)}
    >
      <div
        aria-hidden
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-950/40 dark:text-brand-400"
      >
        <Bot className="h-4 w-4" />
      </div>
      <div className="flex max-w-[85%] flex-col gap-1">
        <div
          aria-live="polite"
          aria-label="AI 응답 대기 중"
          className="flex items-center gap-1 rounded-2xl bg-zinc-50 px-3.5 py-3 dark:bg-zinc-900/50"
        >
          <Dot delay={0} />
          <Dot delay={150} />
          <Dot delay={300} />
        </div>
        {slow && (
          <span className="text-2xs text-muted-foreground">
            응답이 늦어지고 있어요. 잠시만 더 기다려주세요…
          </span>
        )}
      </div>
    </div>
  );
}

function Dot({ delay }: { delay: number }): React.ReactElement {
  return (
    <span
      className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-400 dark:bg-zinc-500"
      style={{ animationDelay: `${delay}ms`, animationDuration: "1.2s" }}
    />
  );
}
