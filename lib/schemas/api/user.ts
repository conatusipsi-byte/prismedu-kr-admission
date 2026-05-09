/**
 * /api/user/* 입력 스키마
 */

import { z } from "zod";

const SchoolYearSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
const SemesterSchema = z.union([z.literal(1), z.literal(2)]);
const GradeSchema = z.number().int().min(1).max(9);

/* ═══════════════════════════════════════════════════════════════════════
   POST /api/user/profile
   ═══════════════════════════════════════════════════════════════════════ */

export const UserProfileUpdateSchema = z.object({
  name: z.string().min(1).max(20).optional(),
  schoolType: z.enum(["general", "autonomous", "special_purpose", "specialized"]).optional(),
  notificationOptIn: z.boolean().optional(),
});

/* ═══════════════════════════════════════════════════════════════════════
   POST /api/user/specs
   ═══════════════════════════════════════════════════════════════════════ */

export const UserSpecsUpsertSchema = z.object({
  asOf: z.object({
    schoolYear: SchoolYearSchema,
    semester: SemesterSchema,
  }),
  schoolRecord: z.object({
    gpaByTerm: z.array(z.object({
      schoolYear: SchoolYearSchema,
      semester: SemesterSchema,
      relativeGpa: z.number().min(1).max(9),
      absoluteGpa: z.number().min(1).max(9).optional(),
      absoluteDistribution: z.object({
        A: z.number().min(0),
        B: z.number().min(0),
        C: z.number().min(0),
      }).optional(),
      totalUnits: z.number().min(0).max(60),
    })).min(1).max(20),
    gpaOverall: z.number().min(1).max(9).optional(),
  }),
  csat: z.object({
    actual: z.boolean(),
    takenAt: z.string(),
    korean: z.object({ grade: GradeSchema, standard: z.number().optional(), percentile: z.number().optional() }),
    math: z.object({ grade: GradeSchema, standard: z.number().optional(), percentile: z.number().optional() }),
    english: z.object({ grade: GradeSchema }),
    history: z.object({ grade: GradeSchema }),
    investigation: z.array(z.object({
      course: z.string(),
      type: z.enum(["social", "science", "vocational"]),
      grade: GradeSchema,
      standard: z.number().optional(),
      percentile: z.number().optional(),
    })),
  }).optional(),
  schoolType: z.enum(["general", "autonomous", "special_purpose", "specialized"]).optional(),
});

export type UserSpecsUpsert = z.infer<typeof UserSpecsUpsertSchema>;
