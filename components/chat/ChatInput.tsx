"use client";

/**
 * ChatInput — 메시지 입력 + 전송
 *
 * - shadcn Textarea (auto-resize)
 * - Enter 전송 / Shift+Enter 줄바꿈
 * - 무료 사용자: 잔여 횟수 표시 (0회 시 빨간 강조 + 입력 비활성)
 * - 유료(quotaRemaining=null): 카운터 미노출
 * - 한도 초과 시 onLimitReached 콜백 (부모가 Gated 락카드 표시)
 *
 * 한도 초과 = quotaRemaining === 0. 부모는 보통 LockCard로 입력 영역을 대체.
 */

import * as React from "react";
import { Loader2, SendHorizonal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export interface ChatInputProps {
  /** 전송 콜백 — 부모가 /api/chat 호출 처리 */
  onSend: (text: string) => void | Promise<void>;
  /** AI 응답 대기 중 — 입력 비활성 */
  pending?: boolean;
  /** 무료 사용자 잔여 횟수. null = 유료(무제한). undefined = 아직 미파악(서버 응답 전). */
  quotaRemaining?: number | null;
  /** 무료 한도 (UI 표시용 — `오늘 N/5턴 사용` 형식) */
  quotaLimit?: number | null;
  className?: string;
  placeholder?: string;
}

const MAX_LEN = 4000;

export function ChatInput({
  onSend,
  pending,
  quotaRemaining,
  quotaLimit,
  className,
  placeholder = "수시·정시·전형 등 무엇이든 물어보세요…",
}: ChatInputProps): React.ReactElement {
  const [text, setText] = React.useState("");
  const taRef = React.useRef<HTMLTextAreaElement | null>(null);

  // auto-resize
  React.useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }, [text]);

  const limitReached = quotaRemaining === 0;
  const disabled = !!pending || limitReached;

  async function submit() {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    if (trimmed.length > MAX_LEN) return;
    setText("");
    await onSend(trimmed);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    }
  }

  // 무료 카운터 — 유료(null)일 땐 미노출
  const showCounter = quotaRemaining != null && quotaLimit != null && quotaLimit > 0;
  const counterClass =
    quotaRemaining != null && quotaRemaining <= 1
      ? "text-rose-600 dark:text-rose-400 font-medium"
      : "text-muted-foreground";

  return (
    <div
      data-component="chat-input"
      data-disabled={disabled ? "true" : "false"}
      className={cn("flex flex-col gap-1.5", className)}
    >
      <div className="flex items-end gap-2">
        <Textarea
          ref={taRef}
          rows={1}
          value={text}
          maxLength={MAX_LEN}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={disabled}
          placeholder={
            limitReached
              ? "오늘 무료 상담 한도를 모두 사용했어요."
              : placeholder
          }
          aria-label="메시지 입력"
          className={cn(
            "min-h-[44px] resize-none",
            "focus-visible:ring-mint-500",
          )}
        />
        <Button
          type="button"
          size="sm"
          disabled={disabled || text.trim().length === 0}
          onClick={() => void submit()}
          className="bg-mint-600 hover:bg-mint-700"
          aria-label="전송"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <SendHorizonal className="h-4 w-4" />
          )}
        </Button>
      </div>
      <div className="flex items-center justify-between text-2xs">
        {showCounter ? (
          <span data-element="chat-quota" className={counterClass}>
            오늘 {quotaLimit! - quotaRemaining!}/{quotaLimit}턴 사용
          </span>
        ) : (
          <span className="text-muted-foreground">Enter 전송 · Shift+Enter 줄바꿈</span>
        )}
        <span className={cn("text-muted-foreground", text.length > MAX_LEN - 100 && "text-amber-600")}>
          {text.length}/{MAX_LEN}
        </span>
      </div>
    </div>
  );
}
