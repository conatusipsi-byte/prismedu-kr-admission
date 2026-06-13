/**
 * lib/notify/inquiry-admin-notify 회귀 (2026-06-13).
 *
 * 검증:
 *   - MASTER_EMAILS 비어있음 → no_recipient skip (sendEmail 미호출, graceful).
 *   - MASTER_EMAILS 설정 → 전원 수신, ok + recipientCount.
 *   - no_api_key / send_failed 매핑.
 *   - 개인정보: html 에 작성자 이메일 마스킹(전체 노출 X), 본문 발췌.
 *   - 예외 → unknown + Sentry.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const sendEmailMock = vi.fn();
vi.mock("@/lib/email/resend", () => ({
  sendEmail: (...args: unknown[]) => sendEmailMock(...args),
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

// MASTER_EMAILS 가변 — 같은 배열 참조를 mutate (모듈이 호출시점에 읽음)
const h = vi.hoisted(() => ({ masters: [] as string[] }));
vi.mock("@/lib/master", () => ({ MASTER_EMAILS: h.masters }));

beforeEach(() => {
  sendEmailMock.mockReset();
  h.masters.length = 0;
});

const baseArgs = {
  inquiryId: "11111111-2222-3333-4444-555555555555",
  category: "question" as const,
  title: "합격 분석이 안 돼요",
  body: "정시 분석 버튼을 눌러도 결과가 안 나옵니다. 확인 부탁드립니다.",
  authorEmail: "honggildong@gmail.com",
  createdAt: "2026-06-13T05:00:00Z",
  siteUrl: "https://conatusipsi.com",
};

describe("sendInquiryAdminNotification", () => {
  it("MASTER_EMAILS 미설정 → no_recipient skip (sendEmail 미호출)", async () => {
    const { sendInquiryAdminNotification } = await import("../inquiry-admin-notify");
    const r = await sendInquiryAdminNotification(baseArgs);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("no_recipient");
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("MASTER_EMAILS 설정 → 전원 수신 + ok + recipientCount", async () => {
    h.masters.push("admin1@conatusipsi.com", "admin2@conatusipsi.com");
    sendEmailMock.mockResolvedValue({ ok: true, id: "msg_admin_1" });
    const { sendInquiryAdminNotification } = await import("../inquiry-admin-notify");
    const r = await sendInquiryAdminNotification(baseArgs);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.recipientCount).toBe(2);
      expect(r.messageId).toBe("msg_admin_1");
    }
    expect(sendEmailMock.mock.calls[0][0]).toMatchObject({
      to: ["admin1@conatusipsi.com", "admin2@conatusipsi.com"],
    });
  });

  it("개인정보 — html 에 작성자 이메일 마스킹(전체 노출 X) + 발췌", async () => {
    h.masters.push("admin@conatusipsi.com");
    sendEmailMock.mockResolvedValue({ ok: true, id: "msg_admin_2" });
    const { sendInquiryAdminNotification } = await import("../inquiry-admin-notify");
    await sendInquiryAdminNotification(baseArgs);
    const sent = sendEmailMock.mock.calls[0][0];
    expect(sent.html).not.toContain("honggildong@gmail.com"); // 전체 이메일 노출 금지
    expect(sent.html).toContain("@gmail.com"); // 도메인은 노출(마스킹된 형태)
    expect(sent.subject).toContain("합격 분석이 안 돼요");
    expect(sent.tags).toEqual(
      expect.arrayContaining([{ name: "kind", value: "inquiry_admin_notify" }]),
    );
  });

  it("Resend no_api_key → no_api_key 매핑", async () => {
    h.masters.push("admin@conatusipsi.com");
    sendEmailMock.mockResolvedValue({ ok: false, reason: "no_api_key" });
    const { sendInquiryAdminNotification } = await import("../inquiry-admin-notify");
    const r = await sendInquiryAdminNotification(baseArgs);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("no_api_key");
  });

  it("Resend send_failed → send_failed + detail", async () => {
    h.masters.push("admin@conatusipsi.com");
    sendEmailMock.mockResolvedValue({ ok: false, reason: "send_failed", error: "boom" });
    const { sendInquiryAdminNotification } = await import("../inquiry-admin-notify");
    const r = await sendInquiryAdminNotification(baseArgs);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("send_failed");
      expect(r.detail).toBe("boom");
    }
  });

  it("authorEmail NULL 이어도 발송(마스킹 미입력 표기)", async () => {
    h.masters.push("admin@conatusipsi.com");
    sendEmailMock.mockResolvedValue({ ok: true, id: "msg_admin_3" });
    const { sendInquiryAdminNotification } = await import("../inquiry-admin-notify");
    const r = await sendInquiryAdminNotification({ ...baseArgs, authorEmail: null });
    expect(r.ok).toBe(true);
    expect(sendEmailMock.mock.calls[0][0].html).toContain("미입력");
  });

  it("sendEmail 예외 → unknown", async () => {
    h.masters.push("admin@conatusipsi.com");
    sendEmailMock.mockRejectedValue(new Error("kaboom"));
    const { sendInquiryAdminNotification } = await import("../inquiry-admin-notify");
    const r = await sendInquiryAdminNotification(baseArgs);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("unknown");
      expect(r.detail).toMatch(/kaboom/);
    }
  });
});
