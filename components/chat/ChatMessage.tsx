"use client";

/**
 * ChatMessage — 카운슬러 채팅 말풍선 (사용자 / AI)
 *
 * P-002 정직성 — UI 시각 표현 (Day 7 핵심):
 *   - sanitized=true 메시지에 ⚠️ 배지 + 안내
 *   - 안내 톤은 **긍정적** — "정확한 정보 보호" / "정제" / "신중"
 *   - "검열", "차단", "거부" 같은 부정 표현 0건 (회귀 테스트가 강제)
 *   - 사용자가 ⚠️ 보고 신뢰도 ↑ 느끼게 (책임감 있는 AI)
 *
 * 패턴별 한국어 라벨:
 *   percent       → 임의 합격률 추정
 *   grade         → 임의 등급 추정
 *   score         → 임의 점수 추정
 *   percentile    → 임의 백분위 추정
 *   standard      → 임의 표준점수 추정
 *   cutoff_phrase → 임의 합격선 추정
 */

import * as React from "react";
import { Bot, ShieldCheck, User } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export interface ChatMessageData {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** sanitize 발동 여부 — assistant 메시지에만 의미 */
  sanitized?: boolean;
  /** sanitize가 매칭한 패턴 라벨 — UI 안내 텍스트용 */
  sanitizedPatterns?: string[];
  /** ms since epoch — 시간 표시 */
  timestamp?: number;
}

export interface ChatMessageProps {
  message: ChatMessageData;
  className?: string;
}

const PATTERN_LABEL_KO: Record<string, string> = {
  percent: "임의 합격률 추정",
  grade: "임의 등급 추정",
  score: "임의 점수 추정",
  percentile: "임의 백분위 추정",
  standard: "임의 표준점수 추정",
  cutoff_phrase: "임의 합격선 추정",
};

export function ChatMessage({ message, className }: ChatMessageProps): React.ReactElement {
  const isUser = message.role === "user";
  return (
    <div
      data-component="chat-message"
      data-role={message.role}
      data-sanitized={message.sanitized ? "true" : "false"}
      className={cn(
        "flex w-full gap-2",
        isUser ? "justify-end" : "justify-start",
        className,
      )}
    >
      {!isUser && (
        <div
          aria-hidden
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-950/40 dark:text-brand-400"
        >
          <Bot className="h-4 w-4" />
        </div>
      )}

      <div className={cn("flex max-w-[85%] flex-col gap-1", isUser ? "items-end" : "items-start")}>
        <div
          className={cn(
            "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed break-words",
            isUser
              ? "bg-brand-600 text-white whitespace-pre-wrap"
              : "bg-zinc-50 text-zinc-900 dark:bg-zinc-900/50 dark:text-zinc-100",
          )}
        >
          {isUser ? (
            message.content
          ) : (
            // AI 응답은 마크다운 — 헤딩·리스트·테이블·강조 렌더링.
            // @tailwindcss/typography 미설치 환경이라 components prop 으로 인라인 스타일.
            <div className="space-y-1.5">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>{message.content}</ReactMarkdown>
            </div>
          )}
        </div>

        {!isUser && message.sanitized && (
          <SanitizeNotice patterns={message.sanitizedPatterns ?? []} />
        )}

        {message.timestamp != null && (
          <span className="text-2xs text-muted-foreground">
            {formatTime(message.timestamp)}
          </span>
        )}
      </div>

      {isUser && (
        <div
          aria-hidden
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
        >
          <User className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}

/**
 * sanitize 안내 — 긍정적 톤.
 *
 * 메인 문구: "정확한 정보 보호를 위해 일부 표현이 정제되었습니다"
 *   - "정확한 정보" — 사용자에게 책임감 있는 AI라는 신호
 *   - "정제" — 부정적이지 않은 처리 표현 (검열·차단·거부 회피)
 *
 * 회귀 테스트가 부정 표현을 차단하므로 본 텍스트 변경 시 회귀 통과 확인.
 */
function SanitizeNotice({ patterns }: { patterns: string[] }): React.ReactElement {
  // 패턴 라벨을 한국어 + 중복 제거
  const labels = Array.from(
    new Set(patterns.map((p) => PATTERN_LABEL_KO[p] ?? "임의 수치 추정")),
  );

  return (
    <div
      data-element="sanitize-notice"
      className="flex max-w-full flex-col gap-1 rounded-md border border-amber-200 bg-amber-50/70 px-2.5 py-1.5 text-2xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/15 dark:text-amber-200"
    >
      <div className="flex items-center gap-1.5 font-medium">
        <ShieldCheck aria-hidden className="h-3 w-3" />
        정확한 정보 보호를 위해 일부 표현이 정제되었습니다
      </div>
      {labels.length > 0 && (
        <div data-element="sanitize-patterns" className="flex flex-wrap gap-1">
          {labels.map((label) => (
            <Badge
              key={label}
              variant="outline"
              className="border-amber-300 bg-amber-100/40 text-2xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200"
            >
              {label}
            </Badge>
          ))}
        </div>
      )}
      <p className="text-2xs leading-relaxed text-amber-800/80 dark:text-amber-200/80">
        합격 사례 표본이 누적되면 분석 페이지에서 정확한 수치가 자동으로 표시됩니다.
      </p>
    </div>
  );
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

/**
 * react-markdown 컴포넌트 매핑 — Tailwind 인라인 클래스.
 *
 * @tailwindcss/typography 가 없는 환경에서 prose-* 대용. 채팅 말풍선 안에
 * 들어가는 좁은 폭을 가정하고 여백·폰트 크기를 챗 톤에 맞춤.
 */
const MARKDOWN_COMPONENTS = {
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="mt-2 mb-1 text-base font-bold">{children}</h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="mt-2 mb-1 text-sm font-bold">{children}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="mt-2 mb-1 text-sm font-semibold">{children}</h3>
  ),
  h4: ({ children }: { children?: React.ReactNode }) => (
    <h4 className="mt-1.5 mb-0.5 text-sm font-semibold">{children}</h4>
  ),
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="leading-relaxed">{children}</p>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="ml-4 list-disc space-y-0.5">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="ml-4 list-decimal space-y-0.5">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="leading-relaxed">{children}</li>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em className="italic">{children}</em>
  ),
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="rounded bg-zinc-200/70 px-1 py-0.5 text-2xs font-mono dark:bg-zinc-700/70">{children}</code>
  ),
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre className="overflow-x-auto rounded-lg bg-zinc-200/70 p-2 text-2xs dark:bg-zinc-800/70">{children}</pre>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="border-l-2 border-brand-400 pl-2 text-muted-foreground">{children}</blockquote>
  ),
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-2xs">{children}</table>
    </div>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="border border-zinc-300/70 px-2 py-1 text-left font-semibold dark:border-zinc-700/70">{children}</th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="border border-zinc-300/70 px-2 py-1 dark:border-zinc-700/70">{children}</td>
  ),
  a: ({ children, href }: { children?: React.ReactNode; href?: string }) => (
    <a href={href} className="text-brand-600 underline" target="_blank" rel="noopener noreferrer">{children}</a>
  ),
};
