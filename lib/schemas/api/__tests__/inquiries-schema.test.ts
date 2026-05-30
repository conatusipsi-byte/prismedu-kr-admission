/**
 * /api/inquiries 입력 스키마 회귀 (2026-05-30).
 *
 * 검증:
 *   - 필수 필드 (category/title/body) 누락 거부.
 *   - 길이 제한 (title 200 / body 5000 / adminResponse 10000).
 *   - 빈 문자열 contactEmail → undefined 변환.
 *   - 잘못된 이메일 형식 거부.
 *   - 카테고리 / 상태 enum 강제.
 *   - 운영자 상태 전이 스키마 (pending/closed 만 허용).
 */

import { describe, it, expect } from "vitest";
import {
  InquiryCreateSchema,
  AdminInquiryRespondSchema,
  AdminInquiryStatusSchema,
  AdminInquiriesListQuerySchema,
} from "../inquiries";

describe("InquiryCreateSchema", () => {
  it("정상 입력 통과", () => {
    const r = InquiryCreateSchema.safeParse({
      category: "question",
      title: "결제 영수증이 안 와요",
      body: "결제는 했는데 영수증이 도착하지 않았어요.",
    });
    expect(r.success).toBe(true);
  });

  it("category 누락 거부", () => {
    const r = InquiryCreateSchema.safeParse({
      title: "t",
      body: "b",
    });
    expect(r.success).toBe(false);
  });

  it("title 빈 문자열 거부 (trim 후 1자 미만)", () => {
    const r = InquiryCreateSchema.safeParse({
      category: "question",
      title: "   ",
      body: "내용",
    });
    expect(r.success).toBe(false);
  });

  it("title 201자 거부", () => {
    const r = InquiryCreateSchema.safeParse({
      category: "question",
      title: "가".repeat(201),
      body: "내용",
    });
    expect(r.success).toBe(false);
  });

  it("body 5001자 거부 (비용 보호)", () => {
    const r = InquiryCreateSchema.safeParse({
      category: "question",
      title: "t",
      body: "가".repeat(5001),
    });
    expect(r.success).toBe(false);
  });

  it("category enum 외 값 거부", () => {
    const r = InquiryCreateSchema.safeParse({
      category: "complaint",
      title: "t",
      body: "b",
    });
    expect(r.success).toBe(false);
  });

  it("contactEmail 빈 문자열 → undefined 변환 (폼 빈 값 통과)", () => {
    const r = InquiryCreateSchema.safeParse({
      category: "question",
      title: "t",
      body: "b",
      contactEmail: "",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.contactEmail).toBeUndefined();
  });

  it("contactEmail 잘못된 형식 거부", () => {
    const r = InquiryCreateSchema.safeParse({
      category: "question",
      title: "t",
      body: "b",
      contactEmail: "not-an-email",
    });
    expect(r.success).toBe(false);
  });

  it("contactEmail 정상 형식 통과", () => {
    const r = InquiryCreateSchema.safeParse({
      category: "improvement",
      title: "t",
      body: "b",
      contactEmail: "user@example.com",
    });
    expect(r.success).toBe(true);
  });

  it("title/body 앞뒤 공백 trim", () => {
    const r = InquiryCreateSchema.safeParse({
      category: "question",
      title: "  제목  ",
      body: "  본문  ",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.title).toBe("제목");
      expect(r.data.body).toBe("본문");
    }
  });
});

describe("AdminInquiryRespondSchema", () => {
  it("정상 답변 통과", () => {
    const r = AdminInquiryRespondSchema.safeParse({ adminResponse: "답변 내용" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.status).toBe("answered");
  });

  it("빈 답변 거부", () => {
    const r = AdminInquiryRespondSchema.safeParse({ adminResponse: "   " });
    expect(r.success).toBe(false);
  });

  it("답변 10001자 거부", () => {
    const r = AdminInquiryRespondSchema.safeParse({
      adminResponse: "가".repeat(10001),
    });
    expect(r.success).toBe(false);
  });

  it("status='answered' 외 값 거부", () => {
    const r = AdminInquiryRespondSchema.safeParse({
      adminResponse: "답변",
      status: "closed",
    });
    expect(r.success).toBe(false);
  });
});

describe("AdminInquiryStatusSchema", () => {
  it("pending 통과", () => {
    expect(AdminInquiryStatusSchema.safeParse({ status: "pending" }).success).toBe(true);
  });
  it("closed 통과", () => {
    expect(AdminInquiryStatusSchema.safeParse({ status: "closed" }).success).toBe(true);
  });
  it("answered 거부 — 답변 발송은 /respond 만 허용", () => {
    expect(AdminInquiryStatusSchema.safeParse({ status: "answered" }).success).toBe(false);
  });
});

describe("AdminInquiriesListQuerySchema", () => {
  it("status 기본값 = pending", () => {
    const r = AdminInquiriesListQuerySchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.status).toBe("pending");
  });
  it("status all 통과", () => {
    const r = AdminInquiriesListQuerySchema.safeParse({ status: "all" });
    expect(r.success).toBe(true);
  });
  it("limit 201 거부 (상한)", () => {
    const r = AdminInquiriesListQuerySchema.safeParse({ limit: "201" });
    expect(r.success).toBe(false);
  });
});
