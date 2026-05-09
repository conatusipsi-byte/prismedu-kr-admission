/**
 * /api/chat 입출력 스키마
 *
 * 메시지 N턴 제한 — Anthropic 토큰 비용 보호 (특히 무료 사용자).
 * 컨텍스트 옵션:
 *   - matchId: 분석 결과 페이지에서 카운슬러 진입 시 매칭 컨텍스트 자동 주입
 *   - schoolFocus: 사용자가 특정 학과만 콕 집어 상담할 때
 */

import { z } from "zod";

export const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});

export const ChatRequestSchema = z.object({
  messages: z.array(ChatMessageSchema).min(1).max(40),
  /** 대화 식별자 — sanitize 메트릭 conversationId로 사용 */
  conversationId: z.string().min(1).max(64).optional(),
  context: z
    .object({
      /** 분석 결과 페이지에서 카운슬러 진입 시 매칭 컨텍스트 */
      matchId: z.string().min(1).max(128).optional(),
      /** 사용자가 콕 집어 상담할 학과 (universityId/departmentId 페어 최대 5개) */
      schoolFocus: z
        .array(
          z.object({
            universityId: z.string().min(1).max(50),
            departmentId: z.string().min(1).max(50),
          }),
        )
        .max(5)
        .optional(),
    })
    .optional(),
});

export type ChatRequestInput = z.infer<typeof ChatRequestSchema>;
export type ChatMessageInput = z.infer<typeof ChatMessageSchema>;

/* ═══════════════════════════════════════════════════════════════════════
   응답
   ═══════════════════════════════════════════════════════════════════════ */

export const ChatResponseSchema = z.object({
  message: ChatMessageSchema,
  /** sanitize 트리거 여부 — UI에 ⚠️ 배지 표시 (P-002 정직성 — 검열 사실 노출) */
  sanitized: z.boolean(),
  /** sanitize가 매칭한 패턴 라벨 목록 (UI 안내 텍스트용) */
  sanitizedPatterns: z
    .array(z.enum(["percent", "grade", "score", "percentile", "standard", "cutoff_phrase"]))
    .default([]),
  usage: z.object({
    inputTokens: z.number().int().min(0),
    outputTokens: z.number().int().min(0),
  }),
  /** 응답 출처 — "anthropic" (실 호출) 또는 "mock" (API 키 미등록) */
  source: z.enum(["anthropic", "mock"]),
  /** 무료 사용자 잔여 횟수 (UI 카운터용). 유료는 Infinity 대신 null. */
  quotaRemaining: z.number().int().min(0).nullable(),
});

export type ChatResponseBody = z.infer<typeof ChatResponseSchema>;
