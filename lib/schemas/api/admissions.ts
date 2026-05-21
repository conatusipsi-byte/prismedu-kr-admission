/**
 * /api/admissions/* 입력 스키마
 */

import { z } from "zod";

/* ═══════════════════════════════════════════════════════════════════════
   GET /api/admissions/search
   ═══════════════════════════════════════════════════════════════════════ */

export const AdmissionsSearchQuerySchema = z.object({
  q: z.string().max(100).optional(),
  category: z.enum([
    "seoul", "gyeonggi", "national", "private_local", "special", "military",
  ]).optional(),
  region: z.string().max(20).optional(),
  track: z.enum([
    "humanities", "social", "natural", "engineering",
    "medical", "arts", "interdisciplinary",
  ]).optional(),
  /**
   * 계열 다중 필터 — 콤마 구분 (예: "humanities,social,medical").
   * UniversityCategoryFilter (v2 multi-select) 가 사용. 'business'/'language' 는
   * 도메인 메타 부재로 OR 매칭 유효하지 않을 수 있음 (후속 PR 로 정밀화).
   */
  trackCategory: z
    .string()
    .max(200)
    .optional()
    .transform((v) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : undefined)),
  trackKind: z.enum([
    "susi_subject", "susi_comprehensive", "susi_essay", "susi_practical",
    "jeongsi_ga", "jeongsi_na", "jeongsi_da",
    "additional", "jaeoegukmin",
  ]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
  /** 학위과정 필터 — default '학사'. 전체는 'all' (대학원 포함). */
  degreeCourse: z.enum(["학사", "석사", "박사", "전문학사", "all"]).optional().default("학사"),
});

/**
 * 야간 학과는 입시 추천 도메인 외 — 본 라우트에서 항상 제외.
 * DB 에는 보존(daytime='야간') 하지만 검색 결과 노출 X. 정책 변경 시 본 상수로 관리.
 * 클라이언트 요청 ⑦ (2026-05-21).
 */
export const ADMISSIONS_SEARCH_EXCLUDE_NIGHT = true;

export type AdmissionsSearchQuery = z.infer<typeof AdmissionsSearchQuerySchema>;

/* ═══════════════════════════════════════════════════════════════════════
   POST /api/admissions/jaeoegukmin/eligibility-check
   ═══════════════════════════════════════════════════════════════════════ */

export const JaeoegukminEligibilitySchema = z.object({
  category: z.enum([
    "overseas_korean",
    "foreigner",
    "foreign_education_12yr",
    "north_korean_defector",
  ]),
  overseasMonths: z.number().int().min(0).max(600).optional(),
  parentResidence: z.boolean().optional(),
  foreignNationality: z.boolean().optional(),
  foreignSchoolYears: z.number().int().min(0).max(20).optional(),
});

export type JaeoegukminEligibilityInput = z.infer<typeof JaeoegukminEligibilitySchema>;

/* ═══════════════════════════════════════════════════════════════════════
   POST /api/admissions/analyze
   ═══════════════════════════════════════════════════════════════════════ */

export const AdmissionsAnalyzeSchema = z.object({
  universityId: z.string().min(1).max(50),
  departmentId: z.string().min(1).max(50),
  year: z.number().int().min(2025).max(2099),
});

/* ═══════════════════════════════════════════════════════════════════════
   POST /api/admissions/similar
   ═══════════════════════════════════════════════════════════════════════ */

export const AdmissionsSimilarSchema = z.object({
  universityId: z.string().min(1).max(50),
  departmentId: z.string().min(1).max(50),
  year: z.number().int().min(2025).max(2099),
  trackKind: z.string().min(1),
  limit: z.number().int().min(1).max(50).default(10),
});
