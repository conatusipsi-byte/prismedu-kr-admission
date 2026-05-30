/**
 * /api/inquiries + /api/admin/inquiries 입력 스키마 (2026-05-30).
 *
 * 도메인:
 *   - improvement: 시스템 개선 요청
 *   - question:    일반 문의
 *
 * email 폴백 흐름 (카카오 가입자 대응):
 *   - 로그인 user.email NULL → contactEmail 필수.
 *   - 비로그인 → contactEmail 필수 (별도 anon 흐름이 추가될 때 사용).
 */

import { z } from "zod";

/** 카테고리 — DB CHECK 와 정확히 일치 */
export const InquiryCategorySchema = z.enum(["improvement", "question"]);
export type InquiryCategory = z.infer<typeof InquiryCategorySchema>;

/** 상태 — DB CHECK 와 정확히 일치 */
export const InquiryStatusSchema = z.enum(["pending", "answered", "closed"]);
export type InquiryStatus = z.infer<typeof InquiryStatusSchema>;

/* ═══════════════════════════════════════════════════════════════════════
   POST /api/inquiries — 사용자 문의 작성
   ═══════════════════════════════════════════════════════════════════════ */

export const InquiryCreateSchema = z.object({
  category: InquiryCategorySchema,
  title: z.string().trim().min(1, "제목을 입력해주세요.").max(200),
  body: z.string().trim().min(1, "내용을 입력해주세요.").max(5000),
  /**
   * 별도 회신 이메일 — 카카오 가입자(이메일 NULL) 또는 다른 주소 지정 시.
   * 빈 문자열은 undefined 로 처리 (폼이 빈 값을 보내도 통과).
   */
  contactEmail: z
    .string()
    .trim()
    .email("올바른 이메일 형식이 아닙니다.")
    .max(254)
    .optional()
    .or(z.literal("").transform(() => undefined)),
});
export type InquiryCreateInput = z.infer<typeof InquiryCreateSchema>;

/* ═══════════════════════════════════════════════════════════════════════
   GET /api/inquiries — 본인 이력 조회
   ═══════════════════════════════════════════════════════════════════════ */

export const InquiryListQuerySchema = z.object({
  status: InquiryStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export type InquiryListQuery = z.infer<typeof InquiryListQuerySchema>;

/* ═══════════════════════════════════════════════════════════════════════
   GET /api/admin/inquiries — 운영자 전체 조회
   ═══════════════════════════════════════════════════════════════════════ */

export const AdminInquiriesListQuerySchema = z.object({
  /** 탭 — 'all' 이면 전체 */
  status: z.enum(["pending", "answered", "closed", "all"]).default("pending"),
  /** 검색 — 제목·내용·이메일 부분 매칭 (메모리) */
  q: z.string().max(100).optional(),
  category: InquiryCategorySchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export type AdminInquiriesListQuery = z.infer<typeof AdminInquiriesListQuerySchema>;

/* ═══════════════════════════════════════════════════════════════════════
   PATCH /api/admin/inquiries/[id]/respond — 운영자 답변 + 이메일 발송
   ═══════════════════════════════════════════════════════════════════════ */

export const AdminInquiryRespondSchema = z.object({
  adminResponse: z.string().trim().min(1, "답변 내용을 입력해주세요.").max(10000),
  /**
   * 발송 후 상태 — answered (기본) / closed (답변 없이 종료는 별도 엔드포인트).
   * answered 만 허용 — 답변 작성 = 발송 + answered 전환.
   */
  status: z.literal("answered").default("answered"),
});
export type AdminInquiryRespondInput = z.infer<typeof AdminInquiryRespondSchema>;

/* ═══════════════════════════════════════════════════════════════════════
   PATCH /api/admin/inquiries/[id] — 상태만 변경 (closed / 재오픈)
   ═══════════════════════════════════════════════════════════════════════ */

export const AdminInquiryStatusSchema = z.object({
  status: z.enum(["pending", "closed"]),
});
export type AdminInquiryStatusInput = z.infer<typeof AdminInquiryStatusSchema>;
