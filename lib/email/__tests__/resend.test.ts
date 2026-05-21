/**
 * Resend client 회귀 테스트.
 *
 * 검증:
 *   - RESEND_API_KEY 미설정 시 no-op + reason="no_api_key"
 *   - 정상 발송 시 ok=true + id 반환
 *   - 에러 응답 시 ok=false + reason="send_failed"
 *   - 예외 throw 시 ok=false + Sentry capture
 *   - 기본 from = "Conatus <noreply@conatusipsi.com>"
 *   - 호출 측이 from 명시 시 우선
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Sentry mock — captureException 호출 검증
const captureExceptionMock = vi.fn();
vi.mock("@sentry/nextjs", () => ({
  captureException: (...args: unknown[]) => captureExceptionMock(...args),
}));

// Resend SDK mock — 인스턴스의 emails.send 만 가짜 구현
const sendMock = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

// server-only 차단 우회
vi.mock("server-only", () => ({}));

const ORIG_ENV = process.env.RESEND_API_KEY;

beforeEach(async () => {
  sendMock.mockReset();
  captureExceptionMock.mockReset();
  process.env.RESEND_API_KEY = "re_test_xxx";
  // singleton 초기화
  const mod = await import("../resend");
  mod.__resetResendClient();
});

afterEach(() => {
  process.env.RESEND_API_KEY = ORIG_ENV;
});

describe("sendEmail", () => {
  it("RESEND_API_KEY 미설정 → no-op + reason='no_api_key'", async () => {
    delete process.env.RESEND_API_KEY;
    const { sendEmail, __resetResendClient } = await import("../resend");
    __resetResendClient();
    const result = await sendEmail({
      to: "u@example.com",
      subject: "t",
      html: "<p>t</p>",
    });
    expect(result).toEqual({ ok: false, reason: "no_api_key" });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("정상 발송 → ok=true + id 반환", async () => {
    sendMock.mockResolvedValue({ data: { id: "msg_123" }, error: null });
    const { sendEmail } = await import("../resend");
    const result = await sendEmail({
      to: "u@example.com",
      subject: "Test",
      html: "<p>Hi</p>",
    });
    expect(result).toEqual({ ok: true, id: "msg_123" });
    expect(sendMock).toHaveBeenCalledTimes(1);
    // 기본 from 확인
    expect(sendMock.mock.calls[0][0]).toMatchObject({
      from: "Conatus <noreply@conatusipsi.com>",
      to: "u@example.com",
      subject: "Test",
    });
  });

  it("호출 측이 from 명시 → 우선 적용", async () => {
    sendMock.mockResolvedValue({ data: { id: "m" }, error: null });
    const { sendEmail } = await import("../resend");
    await sendEmail({
      to: "u@example.com",
      subject: "t",
      html: "<p>t</p>",
      from: "Conatus Billing <billing@conatusipsi.com>",
    });
    expect(sendMock.mock.calls[0][0].from).toBe(
      "Conatus Billing <billing@conatusipsi.com>",
    );
  });

  it("Resend error response → ok=false + Sentry capture", async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: { message: "Invalid recipient" },
    });
    const { sendEmail } = await import("../resend");
    const result = await sendEmail({
      to: "u@example.com",
      subject: "t",
      html: "<p>t</p>",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("send_failed");
      expect(result.error).toBe("Invalid recipient");
    }
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
  });

  it("예외 throw → ok=false + Sentry capture", async () => {
    sendMock.mockRejectedValue(new Error("network down"));
    const { sendEmail } = await import("../resend");
    const result = await sendEmail({
      to: "u@example.com",
      subject: "t",
      html: "<p>t</p>",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("send_failed");
      expect(result.error).toMatch(/network down/);
    }
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
  });

  it("tags + replyTo 전달", async () => {
    sendMock.mockResolvedValue({ data: { id: "m" }, error: null });
    const { sendEmail } = await import("../resend");
    await sendEmail({
      to: "u@example.com",
      subject: "t",
      html: "<p>t</p>",
      tags: [{ name: "kind", value: "receipt" }],
      replyTo: "support@conatusipsi.com",
    });
    expect(sendMock.mock.calls[0][0]).toMatchObject({
      tags: [{ name: "kind", value: "receipt" }],
      replyTo: "support@conatusipsi.com",
    });
  });
});
