"use client";

/**
 * ChatInterface — /chat 페이지 본체 (Day 8: 컨텍스트 변경 통합)
 *
 * 책임:
 *   1. 메시지 배열 상태 관리 (1~40턴)
 *   2. /api/chat POST + 응답 분기 (정상 / sanitized / 한도 초과 / 401)
 *   3. 자동 스크롤
 *   4. 무료 한도 도달 시 입력 영역 → Gated.LockCard
 *   5. ★ 컨텍스트 변경 흐름 (Day 8)
 *      - ChatContextBadge "변경" 클릭 → ChatContextDialog open
 *      - 확인 시: contextSchools 갱신 + conversationId 새로 발급 + 메시지 초기화 +
 *        환영 메시지 재생성 (대화 분리, 정직성 일관)
 *
 * 컨텍스트(matchId, schoolFocus, contextSchools)는 props로 받아 /api/chat에 그대로 전달.
 */

import * as React from "react";
import { LockCard } from "@/components/access/Gated";
import { ChatMessage, type ChatMessageData } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { ChatLoadingIndicator } from "./ChatLoadingIndicator";
import {
  ChatContextBadge,
  type ChatContextDept,
} from "./ChatContextBadge";
import { ChatContextDialog } from "./ChatContextDialog";

export interface ChatInterfaceProps {
  /** 분석 결과 기반 진입 시 matchId */
  matchId?: string;
  /** 학과 콕 집어 진입 (URL params에서 파싱한 결과) */
  schoolFocus?: Array<{ universityId: string; departmentId: string }>;
  /** 환영 메시지 */
  welcomeMessage?: string;
  /** 무료 일별 한도 (UI 표시용) */
  initialQuotaLimit?: number;
  /** 서버에서 hydrate한 컨텍스트 학과 */
  contextSchools?: ChatContextDept[];
  /** 테스트·스토리북 주입용 */
  fetchOverride?: typeof fetch;
  className?: string;
}

interface ChatApiResponse {
  message: { role: "assistant"; content: string };
  sanitized: boolean;
  sanitizedPatterns: string[];
  usage: { inputTokens: number; outputTokens: number };
  source: "anthropic" | "mock";
  quotaRemaining: number | null;
}

const WELCOME_AFTER_CONTEXT_CHANGE =
  "컨텍스트가 변경되어 새 대화를 시작합니다. 새로운 학과 기준으로 무엇이든 물어보세요.";
const WELCOME_AFTER_CLEARED_CONTEXT =
  "컨텍스트를 일반 모드로 변경했어요. 학과 무관한 입시 전략을 물어보세요.";

export function ChatInterface({
  matchId,
  schoolFocus,
  welcomeMessage,
  initialQuotaLimit = 5,
  contextSchools: initialContextSchools = [],
  fetchOverride,
  className,
}: ChatInterfaceProps): React.ReactElement {
  // ── 컨텍스트 state (Day 8 — 변경 가능) ─────────────────────────
  const [contextSchools, setContextSchools] = React.useState<ChatContextDept[]>(initialContextSchools);
  const [activeSchoolFocus, setActiveSchoolFocus] = React.useState<
    Array<{ universityId: string; departmentId: string }> | undefined
  >(schoolFocus);
  const [conversationId, setConversationId] = React.useState<string>(() => generateConversationId());
  const [dialogOpen, setDialogOpen] = React.useState(false);

  // ── 메시지 / 응답 state ────────────────────────────────────────
  const [messages, setMessages] = React.useState<ChatMessageData[]>(() => {
    if (!welcomeMessage) return [];
    return [{ id: "welcome", role: "assistant", content: welcomeMessage, timestamp: Date.now() }];
  });
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [quotaRemaining, setQuotaRemaining] = React.useState<number | null | undefined>(undefined);
  const [quotaLimit, setQuotaLimit] = React.useState<number>(initialQuotaLimit);
  const [limitReached, setLimitReached] = React.useState(false);

  // 자동 스크롤
  const scrollEndRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    const el = scrollEndRef.current;
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages.length, pending]);

  // ── 컨텍스트 변경 ─────────────────────────────────────────────
  function handleContextApply(next: ChatContextDept[]): void {
    setContextSchools(next);
    // schoolFocus도 함께 갱신 (다음 /api/chat 호출 시 전달)
    setActiveSchoolFocus(
      next.length > 0
        ? next.map((s) => ({ universityId: s.universityId, departmentId: s.departmentId }))
        : undefined,
    );
    // 대화 분리 — 새 conversationId + 메시지 초기화 + 새 환영 메시지
    setConversationId(generateConversationId());
    setError(null);
    const welcome = next.length > 0 ? WELCOME_AFTER_CONTEXT_CHANGE : WELCOME_AFTER_CLEARED_CONTEXT;
    setMessages([
      { id: `welcome_${Date.now()}`, role: "assistant", content: welcome, timestamp: Date.now() },
    ]);
  }

  // ── 메시지 전송 ───────────────────────────────────────────────
  async function handleSend(text: string): Promise<void> {
    if (limitReached) return;
    setError(null);

    const userMsg: ChatMessageData = {
      id: `u_${Date.now()}`,
      role: "user",
      content: text,
      timestamp: Date.now(),
    };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setPending(true);

    try {
      const fetchFn = fetchOverride ?? fetch;
      const res = await fetchFn("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages
            .filter((m) => !m.id.startsWith("welcome"))
            .map((m) => ({ role: m.role, content: m.content })),
          conversationId,
          context: {
            matchId,
            schoolFocus: activeSchoolFocus,
          },
        }),
      });

      if (res.status === 429) {
        const data = (await res.json().catch(() => ({}))) as { error?: string; quota?: { used: number; limit: number } };
        setLimitReached(true);
        if (data.quota) {
          setQuotaRemaining(0);
          setQuotaLimit(data.quota.limit);
        }
        setError(data.error ?? "오늘 무료 상담 한도를 모두 사용했어요.");
        return;
      }

      if (res.status === 401) {
        setError("로그인이 만료됐어요. 다시 로그인해주세요.");
        return;
      }

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `상담 응답 실패 (${res.status})`);
      }

      const data = (await res.json()) as ChatApiResponse;
      const aiMsg: ChatMessageData = {
        id: `a_${Date.now()}`,
        role: "assistant",
        content: data.message.content,
        sanitized: data.sanitized,
        sanitizedPatterns: data.sanitizedPatterns,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, aiMsg]);
      setQuotaRemaining(data.quotaRemaining);
      if (data.quotaRemaining === 0) setLimitReached(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      data-component="chat-interface"
      data-pending={pending ? "true" : "false"}
      data-limit-reached={limitReached ? "true" : "false"}
      data-conversation-id={conversationId}
      className={["flex h-full min-h-[60vh] flex-col gap-4", className].filter(Boolean).join(" ")}
    >
      {/* 컨텍스트 배지 + 변경 dialog */}
      <ChatContextBadge
        matchId={matchId}
        contextSchools={contextSchools}
        onChangeRequested={() => setDialogOpen(true)}
      />
      <ChatContextDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        currentSchools={contextSchools}
        matchId={matchId}
        matchInitialSchools={matchId ? initialContextSchools : undefined}
        onApply={handleContextApply}
        fetchOverride={fetchOverride}
      />

      {/* 메시지 목록 */}
      <div
        data-element="chat-messages"
        className="flex-1 overflow-y-auto rounded-lg border bg-background p-4"
      >
        {messages.length === 0 && !pending && (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground">
              궁금한 점을 입력하면 AI 카운슬러가 답변해드려요.
            </p>
          </div>
        )}
        <div className="flex flex-col gap-3">
          {messages.map((m) => (
            <ChatMessage key={m.id} message={m} />
          ))}
          {pending && <ChatLoadingIndicator />}
          <div ref={scrollEndRef} />
        </div>
      </div>

      {/* 에러 */}
      {error && !limitReached && (
        <div
          role="alert"
          data-testid="chat-error"
          className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive"
        >
          {error}
        </div>
      )}

      {/* 입력 영역 */}
      {limitReached ? (
        <div data-element="chat-limit-lock" className="flex flex-col gap-2">
          <LockCard feature="aiCounselor" upgradeHref="/payment" />
          <p className="text-center text-2xs text-muted-foreground">
            오늘 무료 한도 {quotaLimit}회를 모두 사용했어요. 내일 자정에 초기화돼요.
          </p>
        </div>
      ) : (
        <ChatInput
          onSend={handleSend}
          pending={pending}
          quotaRemaining={quotaRemaining}
          quotaLimit={quotaLimit}
        />
      )}
    </div>
  );
}

/** 32자 hex — UUID v4 대용. 충돌 회피용으로 충분. */
function generateConversationId(): string {
  // crypto.randomUUID는 환경별 호환 — Math.random fallback
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `conv_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
  }
  let out = "conv_";
  const charset = "abcdef0123456789";
  for (let i = 0; i < 24; i++) out += charset[Math.floor(Math.random() * 16)];
  return out;
}
