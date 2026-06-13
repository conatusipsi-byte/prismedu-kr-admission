/**
 * /api/admissions/* 입력 스키마
 */

import { z } from "zod";

/* ═══════════════════════════════════════════════════════════════════════
   GET /api/admissions/search
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * UniversityCategory v2 — 5+1 enum. RegionFilter (UI) 의 RegionGroup 과 1:1 매핑.
 * View 가 REGION_GROUP_TO_CATEGORIES 로 변환 후 `category=seoul,special` 형태로 전달.
 */
const VALID_UNIVERSITY_CATEGORIES = [
  "seoul", "gyeonggi", "national", "private_local", "special", "military",
] as const;

/**
 * AdmissionTrackKind 7+1+1종. TrackFilter (UI) 가 multi-select 로 전송.
 * 단일 토글 → "susi_subject" / 다중 → "susi_subject,susi_comprehensive".
 */
const VALID_TRACK_KINDS = [
  "susi_subject", "susi_comprehensive", "susi_essay", "susi_practical",
  "jeongsi_ga", "jeongsi_na", "jeongsi_da",
  "additional", "jaeoegukmin",
] as const;
type ValidTrackKind = (typeof VALID_TRACK_KINDS)[number];

export const AdmissionsSearchQuerySchema = z.object({
  q: z.string().max(100).optional(),
  /**
   * 대학 카테고리 다중 필터 — 콤마 구분 (예: "seoul,gyeonggi").
   * RegionFilter UI 5분류(서울권/경기권/지방국립/지방사립/특수대학) → REGION_GROUP_TO_CATEGORIES
   * 매핑으로 변환된 UniversityCategory 들이 들어옴. 유효하지 않은 값은 서버에서 필터 제외.
   */
  category: z
    .string()
    .max(200)
    .optional()
    .transform((v) => {
      if (!v) return undefined;
      const parts = v.split(",").map((s) => s.trim()).filter(Boolean);
      const valid = parts.filter((p) =>
        (VALID_UNIVERSITY_CATEGORIES as readonly string[]).includes(p),
      );
      return valid.length > 0 ? valid : undefined;
    }),
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
  /**
   * 전형 다중 필터 — 콤마 구분 (예: "susi_subject,susi_comprehensive").
   * TrackFilter UI 가 매번 토글된 AdmissionTrackKind[] 를 .join(",") 으로 전달.
   * 유효하지 않은 값은 transform 단계에서 필터 아웃. 매칭 의미는 OR (학과의
   * department_admissions.available_track_kinds 와 1개 이상 겹치면 통과).
   */
  trackKind: z
    .string()
    .max(200)
    .optional()
    .transform((v) => {
      if (!v) return undefined;
      const parts = v.split(",").map((s) => s.trim()).filter(Boolean);
      const valid = parts.filter((p) =>
        (VALID_TRACK_KINDS as readonly string[]).includes(p),
      ) as ValidTrackKind[];
      return valid.length > 0 ? valid : undefined;
    }),
  /**
   * 특별전형 다중 필터 — 콤마 구분 (예: "agricultural,etc").
   * specialType 기반(농어촌=agricultural / 기회균형·저소득=low_income / 특성화 등=etc).
   * RPC 가 tracks jsonb 의 specialType 을 검사(OR 매칭). general/overseas 는 필터 비대상
   * (overseas=재외국민은 /admissions/jaeoegukmin 전용 경로). 유효하지 않은 값은 필터 아웃.
   */
  specialType: z
    .string()
    .max(100)
    .optional()
    .transform((v) => {
      if (!v) return undefined;
      const valid = v
        .split(",").map((s) => s.trim()).filter(Boolean)
        .filter((p) => ["agricultural", "low_income", "etc"].includes(p));
      return valid.length > 0 ? valid : undefined;
    }),
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
