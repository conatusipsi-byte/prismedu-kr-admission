/**
 * /api/chat 입출력 스키마 회귀
 *
 * 검증:
 *   1. 메시지 1~40턴, content 1~4000자 — 비용 보호
 *   2. schoolFocus 최대 5개
 *   3. ChatResponseSchema의 sanitized·sanitizedPatterns 노출 (P-002)
 *   4. role enum (user/assistant) 강제
 */

import { describe, it, expect } from "vitest";
import {
  ChatRequestSchema,
  ChatResponseSchema,
} from "@/lib/schemas/api/chat";

/* ═══════════════════════════════════════════════════════════════════════
   ChatRequestSchema
   ═══════════════════════════════════════════════════════════════════════ */

describe("ChatRequestSchema — 입력 제한", () => {
  it("messages 비어있으면 거부", () => {
    const r = ChatRequestSchema.safeParse({ messages: [] });
    expect(r.success).toBe(false);
  });

  it("messages 41턴 거부 (비용 보호)", () => {
    const messages = Array.from({ length: 41 }, () => ({ role: "user" as const, content: "안녕" }));
    expect(ChatRequestSchema.safeParse({ messages }).success).toBe(false);
  });

  it("messages 40턴은 통과", () => {
    const messages = Array.from({ length: 40 }, () => ({ role: "user" as const, content: "안녕" }));
    expect(ChatRequestSchema.safeParse({ messages }).success).toBe(true);
  });

  it("content 4001자 거부", () => {
    const longContent = "가".repeat(4001);
    const r = ChatRequestSchema.safeParse({
      messages: [{ role: "user", content: longContent }],
    });
    expect(r.success).toBe(false);
  });

  it("role enum 외 값 거부", () => {
    const r = ChatRequestSchema.safeParse({
      messages: [{ role: "system", content: "해킹 시도" }],
    });
    expect(r.success).toBe(false);
  });

  it("schoolFocus 6개 거부 (최대 5)", () => {
    const schoolFocus = Array.from({ length: 6 }, (_, i) => ({
      universityId: `u${i}`,
      departmentId: `d${i}`,
    }));
    const r = ChatRequestSchema.safeParse({
      messages: [{ role: "user", content: "안녕" }],
      context: { schoolFocus },
    });
    expect(r.success).toBe(false);
  });

  it("schoolFocus 5개 통과", () => {
    const schoolFocus = Array.from({ length: 5 }, (_, i) => ({
      universityId: `u${i}`,
      departmentId: `d${i}`,
    }));
    const r = ChatRequestSchema.safeParse({
      messages: [{ role: "user", content: "안녕" }],
      context: { schoolFocus },
    });
    expect(r.success).toBe(true);
  });

  it("matchId만 단독으로 통과", () => {
    const r = ChatRequestSchema.safeParse({
      messages: [{ role: "user", content: "안녕" }],
      context: { matchId: "match_user1_12345" },
    });
    expect(r.success).toBe(true);
  });

  it("context 미지정도 통과", () => {
    const r = ChatRequestSchema.safeParse({
      messages: [{ role: "user", content: "안녕" }],
    });
    expect(r.success).toBe(true);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   ChatResponseSchema — P-002 sanitize 노출
   ═══════════════════════════════════════════════════════════════════════ */

describe("ChatResponseSchema — sanitize 노출 (P-002)", () => {
  it("sanitized · sanitizedPatterns · source 필드 모두 정의", () => {
    const r = ChatResponseSchema.safeParse({
      message: { role: "assistant", content: "응답" },
      sanitized: false,
      sanitizedPatterns: [],
      usage: { inputTokens: 10, outputTokens: 20 },
      source: "mock",
      quotaRemaining: 4,
    });
    expect(r.success).toBe(true);
  });

  it("sanitizedPatterns enum 6종 모두 허용", () => {
    const r = ChatResponseSchema.safeParse({
      message: { role: "assistant", content: "응답" },
      sanitized: true,
      sanitizedPatterns: ["percent", "grade", "score", "percentile", "standard", "cutoff_phrase"],
      usage: { inputTokens: 10, outputTokens: 20 },
      source: "mock",
      quotaRemaining: 4,
    });
    expect(r.success).toBe(true);
  });

  it("sanitizedPatterns에 알 수 없는 라벨 거부", () => {
    const r = ChatResponseSchema.safeParse({
      message: { role: "assistant", content: "응답" },
      sanitized: true,
      sanitizedPatterns: ["unknown_pattern"],
      usage: { inputTokens: 10, outputTokens: 20 },
      source: "mock",
      quotaRemaining: 4,
    });
    expect(r.success).toBe(false);
  });

  it("source는 'anthropic' 또는 'mock'만 허용 (UI/로그 분기)", () => {
    const valid = ChatResponseSchema.safeParse({
      message: { role: "assistant", content: "응답" },
      sanitized: false,
      sanitizedPatterns: [],
      usage: { inputTokens: 10, outputTokens: 20 },
      source: "anthropic",
      quotaRemaining: null,
    });
    expect(valid.success).toBe(true);

    const invalid = ChatResponseSchema.safeParse({
      message: { role: "assistant", content: "응답" },
      sanitized: false,
      sanitizedPatterns: [],
      usage: { inputTokens: 10, outputTokens: 20 },
      source: "openai",
      quotaRemaining: null,
    });
    expect(invalid.success).toBe(false);
  });

  it("quotaRemaining null 허용 (유료 = 무제한)", () => {
    const r = ChatResponseSchema.safeParse({
      message: { role: "assistant", content: "응답" },
      sanitized: false,
      sanitizedPatterns: [],
      usage: { inputTokens: 10, outputTokens: 20 },
      source: "mock",
      quotaRemaining: null,
    });
    expect(r.success).toBe(true);
  });
});
