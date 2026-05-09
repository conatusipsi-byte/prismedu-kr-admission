"use client";

/**
 * ChatPageView — server hydrate 결과를 ChatInterface로 전달 (Day 8)
 *
 * Day 7까지는 useSearchParams로 클라에서 직접 파싱했으나, Day 8에선 page.tsx
 * (Server Component)가 컨텍스트를 미리 조회해 props로 전달 → 빈 화면 깜빡임 제거.
 *
 * 환영 메시지는 모드별로 즉시 렌더 (matchId / schoolFocus / general).
 */

import * as React from "react";
import { ChatInterface } from "@/components/chat/ChatInterface";
import type { ChatContextSchool } from "@/lib/admission/chat-context";

const WELCOME_GENERAL =
  "안녕하세요! 한국 대학 입시 AI 카운슬러입니다. 수시·정시·전형·전략 등 무엇이든 물어보세요.\n\n표본 부족 학과는 합격률을 정확히 답변드릴 수 없지만, 모집요강·전형 정보는 자유롭게 안내해드려요.";

const WELCOME_FROM_MATCH =
  "분석 결과를 기반으로 상담을 시작합니다. 결과 페이지의 학과별로 추가 질문을 해주시면, 컨텍스트에 맞춘 답변을 드릴게요.";

const WELCOME_FROM_FOCUS =
  "선택하신 학과를 기준으로 상담을 시작합니다. 학과 추가/제거는 컨텍스트 카드의 '변경' 버튼에서 가능해요.";

const WELCOME_UNAUTHENTICATED =
  "안녕하세요! 한국 대학 입시 AI 카운슬러입니다. 메시지를 보내려면 로그인이 필요해요.";

export interface ChatPageViewProps {
  initialContextSchools: ChatContextSchool[];
  matchId?: string;
  schoolFocus?: Array<{ universityId: string; departmentId: string }>;
  /** 서버에서 검증한 인증 상태 — 미인증이면 환영 메시지에 안내 */
  authenticated: boolean;
}

export function ChatPageView({
  initialContextSchools,
  matchId,
  schoolFocus,
  authenticated,
}: ChatPageViewProps): React.ReactElement {
  const welcome = !authenticated
    ? WELCOME_UNAUTHENTICATED
    : matchId
    ? WELCOME_FROM_MATCH
    : schoolFocus && schoolFocus.length > 0
    ? WELCOME_FROM_FOCUS
    : WELCOME_GENERAL;

  return (
    <ChatInterface
      matchId={matchId}
      schoolFocus={schoolFocus && schoolFocus.length > 0 ? schoolFocus : undefined}
      welcomeMessage={welcome}
      contextSchools={initialContextSchools}
    />
  );
}
