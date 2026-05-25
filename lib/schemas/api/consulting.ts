/**
 * /api/consulting/* 입력 스키마.
 *
 * 본 파일이 자료 모델 — Day 3 신청서 + Day 4 예약 생성·취소.
 *
 * DB 제약과 일치 (supabase/migrations/20260522100000_consulting_system.sql):
 *   - student_grade ∈ {1, 2, 3}
 *   - consultation_topics 배열 길이 ≥ 1
 *   - questions 길이 ≤ 1000
 *   - target_universities 는 DB 단에서 길이 제약 없음 → API 에서 5개 cap
 */

import { z } from "zod";

/** 상담 주제 enum — UI chip + API 검증 공유. 주제 추가 시 본 배열만 수정. */
export const CONSULTATION_TOPICS = [
  "정시 전략",
  "수시 전략",
  "학종 자소서",
  "학종 면접",
  "논술 전략",
  "진로 상담",
  "기타",
] as const;

export type ConsultationTopic = (typeof CONSULTATION_TOPICS)[number];

const ConsultationTopicSchema = z.enum(CONSULTATION_TOPICS as readonly [string, ...string[]]);

const MAX_TARGET_UNIVERSITIES = 5;
const TARGET_UNIVERSITY_MAX_LEN = 40;

/**
 * 컨설팅 신청서 입력. POST /api/consulting/applications body.
 */
export const ConsultingApplicationCreateSchema = z.object({
  studentName: z
    .string()
    .trim()
    .min(2, "이름은 2자 이상이어야 합니다")
    .max(20, "이름은 20자 이내여야 합니다")
    .regex(/^[가-힣A-Za-z\s]+$/, "이름은 한글 또는 영문만 입력해주세요"),
  studentGrade: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  highSchool: z
    .string()
    .trim()
    .max(60, "고등학교명이 너무 깁니다")
    .optional()
    .or(z.literal("")),
  consultationTopics: z
    .array(ConsultationTopicSchema)
    .min(1, "상담 주제를 1개 이상 선택해주세요")
    .max(CONSULTATION_TOPICS.length, "유효하지 않은 주제입니다"),
  currentGrades: z
    .string()
    .trim()
    .max(500, "현재 성적 메모는 500자 이내여야 합니다")
    .optional()
    .or(z.literal("")),
  targetUniversities: z
    .array(z.string().trim().min(1).max(TARGET_UNIVERSITY_MAX_LEN))
    .max(MAX_TARGET_UNIVERSITIES, `희망 대학은 최대 ${MAX_TARGET_UNIVERSITIES}개까지 입력 가능합니다`)
    .optional(),
  questions: z
    .string()
    .trim()
    .min(50, "질문은 50자 이상 입력해주세요")
    .max(1000, "질문은 1000자 이내여야 합니다"),
});

export type ConsultingApplicationCreate = z.infer<typeof ConsultingApplicationCreateSchema>;

/* ═══════════════════════════════════════════════════════════════════════
   Day 4 — 예약 생성/취소 입력 스키마
   ═══════════════════════════════════════════════════════════════════════ */

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const UuidSchema = z.string().regex(UUID_RE, "유효하지 않은 UUID 형식");

/** POST /api/consulting/bookings body */
export const ConsultingBookingCreateSchema = z.object({
  timeSlotId: UuidSchema,
  applicationId: UuidSchema,
});
export type ConsultingBookingCreate = z.infer<typeof ConsultingBookingCreateSchema>;

/** PATCH /api/consulting/bookings/[id] body */
export const ConsultingBookingCancelSchema = z.object({
  reason: z.string().trim().max(500, "취소 사유는 500자 이내").optional(),
});
export type ConsultingBookingCancel = z.infer<typeof ConsultingBookingCancelSchema>;
