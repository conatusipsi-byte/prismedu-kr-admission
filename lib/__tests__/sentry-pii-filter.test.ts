/**
 * 회귀 가드 (P2 4-1): Sentry beforeSend 가 생기부 원문/스펙 등 민감 본문을 새지 않게 한다.
 * - AI 분석 엔드포인트(saengbu/spec)는 request.data 전체 redact (free-form 'text' 포함).
 * - 일반 엔드포인트는 키 패턴 스크럽(민감 키만 [Filtered], 나머지 보존).
 * - user PII(email/ip)·extra 제거.
 */
import { describe, it, expect } from "vitest";
import { sentryBeforeSend } from "@/lib/sentry-pii-filter";
import type { ErrorEvent, EventHint } from "@sentry/nextjs";

const hint = {} as EventHint;
const run = (e: Partial<ErrorEvent>) => sentryBeforeSend(e as ErrorEvent, hint);

describe("sentryBeforeSend — 생기부/스펙 본문 보호 (P2 4-1)", () => {
  it("saengbu-analysis: request.data(생기부 text) 전체 redact", () => {
    const ev = run({
      request: { url: "https://x/api/saengbu-analysis", data: { text: "학생 생기부 원문...", consent: true } },
    });
    expect(ev?.request?.data).toBe("[Filtered]");
    expect(JSON.stringify(ev)).not.toContain("생기부 원문");
  });

  it("spec-analysis: request.data(specs) 전체 redact", () => {
    const ev = run({
      request: { url: "https://x/api/spec-analysis?foo=1", data: { specs: { basic: { naesin: 1.2 } } } },
    });
    expect(ev?.request?.data).toBe("[Filtered]");
  });

  it("일반 엔드포인트: 본문은 키 패턴 스크럽 (text 보존, 민감 키만 redact)", () => {
    const ev = run({
      request: { url: "https://x/api/inquiries", data: { title: "문의", token: "secret-abc", email: "a@b.com" } },
    });
    const data = ev?.request?.data as Record<string, unknown>;
    expect(data.title).toBe("문의"); // 일반 필드 보존 (디버깅)
    expect(data.token).toBe("[Filtered]");
    expect(data.email).toBe("[Filtered]");
  });

  it("user PII(email/username/ip) 제거", () => {
    const ev = run({ user: { id: "u1", email: "a@b.com", username: "n", ip_address: "1.2.3.4" } });
    expect(ev?.user?.email).toBeUndefined();
    expect(ev?.user?.ip_address).toBeUndefined();
    expect(ev?.user?.id).toBe("u1"); // 식별자 자체는 보존
  });

  it("extra 의 민감 키 스크럽", () => {
    const ev = run({ extra: { uid: "u1", csatScore: 380, apiKey: "sk-xxx" } });
    const extra = ev?.extra as Record<string, unknown>;
    expect(extra.uid).toBe("u1");
    expect(extra.apiKey).toBe("[Filtered]");
  });
});
