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
    "seoul_top", "seoul", "national_flag", "national_local",
    "private_local", "special",
  ]).optional(),
  region: z.string().max(20).optional(),
  track: z.enum([
    "humanities", "social", "natural", "engineering",
    "medical", "arts", "interdisciplinary",
  ]).optional(),
  trackKind: z.enum([
    "susi_subject", "susi_comprehensive", "susi_essay", "susi_practical",
    "jeongsi_ga", "jeongsi_na", "jeongsi_da",
    "additional", "jaeoegukmin",
  ]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

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
