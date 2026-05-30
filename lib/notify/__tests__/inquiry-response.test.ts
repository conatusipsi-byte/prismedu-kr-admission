/**
 * lib/notify/inquiry-response 회귀 (2026-05-30).
 *
 * 검증:
 *   - contactEmail 우선 / userEmail 폴백 / 둘 다 NULL 시 skip.
 *   - sendEmail 호출 시 reply-to / tags / subject 정상 전달.
 *   - no_api_key / send_failed 결과 매핑.
 *   - 예외 발생 시 unknown reason + Sentry capture (resend 자체에서 처리).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const sendEmailMock = vi.fn();
vi.mock("@/lib/email/resend", () => ({
  sendEmail: (...args: unknown[]) => sendEmailMock(...args),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

beforeEach(() => {
  sendEmailMock.mockReset();
});

const baseArgs = {
  inquiryId: "11111111-2222-3333-4444-555555555555",
  category: "question" as const,
  title: "결제 영수증이 안 와요",
  originalBody: "원본 본문",
  adminResponse: "답변 본문",
  createdAt: "2026-05-30T05:00:00Z",
  answeredAt: "2026-05-30T06:00:00Z",
  siteUrl: "https://conatusipsi.com",
};

describe("sendInquiryResponseEmail", () => {
  it("contactEmail 우선 — 둘 다 있으면 contactEmail 로 발송", async () => {
    sendEmailMock.mockResolvedValue({ ok: true, id: "msg_123" });
    const { sendInquiryResponseEmail } = await import("../inquiry-response");
    const r = await sendInquiryResponseEmail({
      ...baseArgs,
      contactEmail: "contact@example.com",
      userEmail: "user@example.com",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.to).toBe("contact@example.com");
      expect(r.channel).toBe("email");
    }
    expect(sendEmailMock.mock.calls[0][0]).toMatchObject({
      to: "contact@example.com",
    });
  });

  it("contactEmail NULL → userEmail 폴백", async () => {
    sendEmailMock.mockResolvedValue({ ok: true, id: "msg_124" });
    const { sendInquiryResponseEmail } = await import("../inquiry-response");
    const r = await sendInquiryResponseEmail({
      ...baseArgs,
      contactEmail: null,
      userEmail: "user@example.com",
    });
    expect(r.ok).toBe(true);
    expect(sendEmailMock.mock.calls[0][0]).toMatchObject({ to: "user@example.com" });
  });

  it("양쪽 NULL → no_recipient skip (카카오 가입자)", async () => {
    const { sendInquiryResponseEmail } = await import("../inquiry-response");
    const r = await sendInquiryResponseEmail({
      ...baseArgs,
      contactEmail: null,
      userEmail: null,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("no_recipient");
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("Resend no_api_key → no_api_key 매핑", async () => {
    sendEmailMock.mockResolvedValue({ ok: false, reason: "no_api_key" });
    const { sendInquiryResponseEmail } = await import("../inquiry-response");
    const r = await sendInquiryResponseEmail({
      ...baseArgs,
      contactEmail: null,
      userEmail: "user@example.com",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("no_api_key");
  });

  it("Resend send_failed → send_failed + detail 전달", async () => {
    sendEmailMock.mockResolvedValue({
      ok: false,
      reason: "send_failed",
      error: "Invalid recipient",
    });
    const { sendInquiryResponseEmail } = await import("../inquiry-response");
    const r = await sendInquiryResponseEmail({
      ...baseArgs,
      contactEmail: "bad@",
      userEmail: null,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("send_failed");
      expect(r.detail).toBe("Invalid recipient");
    }
  });

  it("sendEmail 호출 시 reply-to = conatusipsi@gmail.com + tags 첨부", async () => {
    sendEmailMock.mockResolvedValue({ ok: true, id: "msg_125" });
    const { sendInquiryResponseEmail } = await import("../inquiry-response");
    await sendInquiryResponseEmail({
      ...baseArgs,
      contactEmail: "u@example.com",
      userEmail: null,
    });
    const args = sendEmailMock.mock.calls[0][0];
    expect(args.replyTo).toBe("conatusipsi@gmail.com");
    expect(args.tags).toEqual(
      expect.arrayContaining([
        { name: "kind", value: "inquiry_response" },
        { name: "category", value: "question" },
      ]),
    );
    expect(args.subject).toContain("결제 영수증이 안 와요");
    expect(args.html).toContain("답변 본문");
  });

  it("sendEmail 예외 throw → unknown reason", async () => {
    sendEmailMock.mockRejectedValue(new Error("boom"));
    const { sendInquiryResponseEmail } = await import("../inquiry-response");
    const r = await sendInquiryResponseEmail({
      ...baseArgs,
      contactEmail: "u@example.com",
      userEmail: null,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("unknown");
      expect(r.detail).toMatch(/boom/);
    }
  });
});
