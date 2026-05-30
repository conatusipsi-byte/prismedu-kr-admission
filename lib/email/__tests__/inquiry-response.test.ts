/**
 * lib/email/templates/inquiry-response 회귀 (2026-05-30).
 *
 * 검증:
 *   - subject 가 카테고리 라벨 + 원본 제목 포함.
 *   - HTML 에 답변·원본·CTA·문의 ID 포함.
 *   - 사용자 입력 XSS 차단 (escape).
 *   - 줄바꿈 → <br> 변환.
 *   - text fallback 핵심 정보.
 *   - improvement / question 카테고리별 라벨 분기.
 */

import { describe, it, expect } from "vitest";
import { buildInquiryResponseEmail } from "../templates/inquiry-response";

const baseArgs = {
  inquiryId: "11111111-2222-3333-4444-555555555555",
  category: "question" as const,
  title: "결제 영수증이 안 와요",
  originalBody: "결제는 했는데 영수증이 도착하지 않았어요.\n언제쯤 받을 수 있을까요?",
  adminResponse: "확인해보니 메일 서버 지연이었어요.\n방금 재발송했습니다.",
  createdAt: "2026-05-30T05:00:00Z",
  answeredAt: "2026-05-30T06:00:00Z",
  siteUrl: "https://conatusipsi.com",
};

describe("buildInquiryResponseEmail", () => {
  it("subject — '문의 답변' + 원본 제목 포함 (question)", () => {
    const r = buildInquiryResponseEmail(baseArgs);
    expect(r.subject).toContain("문의 답변");
    expect(r.subject).toContain("결제 영수증이 안 와요");
  });

  it("subject — improvement 카테고리는 '시스템 개선 요청 답변'", () => {
    const r = buildInquiryResponseEmail({ ...baseArgs, category: "improvement" });
    expect(r.subject).toContain("시스템 개선 요청 답변");
  });

  it("html — 답변/원본/CTA/문의 ID 포함", () => {
    const r = buildInquiryResponseEmail(baseArgs);
    expect(r.html).toContain("방금 재발송했습니다");
    expect(r.html).toContain("결제는 했는데");
    expect(r.html).toContain("/inquiries");
    expect(r.html).toContain(baseArgs.inquiryId);
  });

  it("html — 줄바꿈이 <br /> 로 변환됨 (답변·원본 양쪽)", () => {
    const r = buildInquiryResponseEmail(baseArgs);
    // 답변 본문 — 첫 줄 다음에 <br />
    expect(r.html).toContain("확인해보니 메일 서버 지연이었어요.<br />방금 재발송했습니다.");
    // 원본 본문 — 첫 줄 다음에 <br />
    expect(r.html).toContain("결제는 했는데 영수증이 도착하지 않았어요.<br />언제쯤 받을 수 있을까요?");
  });

  it("html — XSS 차단 (사용자 입력 escape)", () => {
    const r = buildInquiryResponseEmail({
      ...baseArgs,
      title: '<script>alert("xss")</script>',
      originalBody: '<img src="x" onerror="alert(1)" />',
      adminResponse: "안전한 답변",
    });
    expect(r.html).not.toContain('<script>');
    expect(r.html).not.toContain('onerror="alert');
    expect(r.html).toContain('&lt;script&gt;');
  });

  it("html — 답변 일시 KST 변환 (UTC + 9)", () => {
    const r = buildInquiryResponseEmail(baseArgs);
    // 2026-05-30T06:00:00Z = 2026-05-30 15:00 KST
    expect(r.html).toContain("2026.05.30 15:00 KST");
  });

  it("text fallback — 답변·원본·문의 ID·답장 안내 포함", () => {
    const r = buildInquiryResponseEmail(baseArgs);
    expect(r.text).toContain("방금 재발송했습니다");
    expect(r.text).toContain("결제는 했는데");
    expect(r.text).toContain(baseArgs.inquiryId);
    expect(r.text).toContain("/inquiries");
  });

  it("html — reply 가능 안내 노출", () => {
    const r = buildInquiryResponseEmail(baseArgs);
    expect(r.html).toContain("답장");
  });
});
