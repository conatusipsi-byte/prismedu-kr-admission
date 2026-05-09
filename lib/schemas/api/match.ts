/**
 * /api/match/* + /api/intent/validate 입력 스키마
 */

import { z } from "zod";

const TrackKindSchema = z.enum([
  "susi_subject", "susi_comprehensive", "susi_essay", "susi_practical",
  "jeongsi_ga", "jeongsi_na", "jeongsi_da",
  "additional", "jaeoegukmin",
]);

const SlotSchema = z.object({
  universityId: z.string().min(1).max(50),
  departmentId: z.string().min(1).max(50),
  trackKind: TrackKindSchema,
  trackName: z.string().min(1).max(50),
  priority: z.number().int().min(1).max(10),
});

/* ═══════════════════════════════════════════════════════════════════════
   POST /api/match — 합격률 분석
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * 분석 폼(Step 1~3)에서 직접 보내는 입력. 기존 MatchInputSchema(specId·filter
 * 위주)는 Phase 1 호환을 위해 보존하되, 신규 클라이언트는 본 스키마로 보낸다.
 *
 * 모든 점수·등급은 nullable — 사용자가 부분 입력해도 매칭 가능하게 한다
 * (정직성 원칙: 미입력은 데이터 없음으로 처리, 페널티 없음).
 */
const GradeSchema = z.number().int().min(1).max(9);

const NaesinTermSchema = z.object({
  schoolYear: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  semester: z.union([z.literal(1), z.literal(2)]),
  relativeGpa: z.number().min(1).max(9).nullable(),
  absoluteGpa: z.number().min(1).max(9).nullable(),
  totalUnits: z.number().int().min(0).max(100).nullable(),
});

const CsatAreaScoreSchema = z.object({
  standard: z.number().int().min(0).max(200).nullable(),
  percentile: z.number().min(0).max(100).nullable(),
  grade: GradeSchema.nullable(),
});

export const KrSpecsSchema = z.object({
  basic: z.object({
    gradeLevel: z.enum(["high1", "high2", "high3", "n_repeat"]),
    track: z.enum(["humanities", "natural", "arts"]),
    /** 분석 폼의 외국 고교 답변. "yes"는 클라이언트가 jaeoegukmin로 redirect 처리 — 서버는 거절(P-013). */
    abroadHighSchool: z.enum(["no"]),
  }),
  score: z.object({
    naesin: z.array(NaesinTermSchema).max(6),
    csat: z.object({
      actual: z.boolean(),
      korean: CsatAreaScoreSchema.extend({
        course: z.enum(["speech_writing", "language_media"]).nullable(),
      }),
      math: CsatAreaScoreSchema.extend({
        course: z.enum(["calculus", "probability_statistics", "geometry"]).nullable(),
      }),
      english: z.object({ grade: GradeSchema.nullable() }),
      history: z.object({ grade: GradeSchema.nullable() }),
      investigation: z
        .array(
          z.object({
            course: z.string().max(40),
            type: z.enum(["social", "science", "vocational"]),
            standard: z.number().int().min(0).max(200).nullable(),
            percentile: z.number().min(0).max(100).nullable(),
            grade: GradeSchema.nullable(),
          }),
        )
        .max(2),
    }),
  }),
  extra: z.object({
    autonomous: z.object({
      hours: z.number().int().min(0).nullable(),
      participationCount: z.number().int().min(0).nullable(),
    }),
    club: z.object({
      hours: z.number().int().min(0).nullable(),
      participationCount: z.number().int().min(0).nullable(),
      yearsPersistent: z.number().int().min(0).max(3).nullable(),
    }),
    volunteering: z.object({
      hours: z.number().int().min(0).nullable(),
      participationCount: z.number().int().min(0).nullable(),
    }),
    career: z.object({
      hours: z.number().int().min(0).nullable(),
      participationCount: z.number().int().min(0).nullable(),
      majorAlignment: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).nullable(),
    }),
    detailedAbility: z.object({
      entriesCount: z.number().int().min(0).nullable(),
      majorRelatedCount: z.number().int().min(0).nullable(),
      qualityScore: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).nullable(),
    }),
    behavioralCharacteristics: z.object({
      qualityScore: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).nullable(),
    }),
    schoolType: z.enum(["general", "autonomous", "special_purpose", "specialized"]).nullable(),
  }),
  /** 결과 좁히기 필터 — 1000개 학과 매칭 비용 폭증 방지 */
  filter: z
    .object({
      region: z.string().max(20).optional(),
      category: z.string().max(20).optional(),
      /** 학과 후보 상한 — 무료 사용자 기본 60, 유료 200 (서버 강제) */
      limit: z.number().int().min(1).max(500).optional(),
    })
    .optional(),
});

export type KrSpecsInput = z.infer<typeof KrSpecsSchema>;

/**
 * 기존 stub 호환 입력 (specId/filter 만). 신규 분석 폼은 KrSpecsSchema 사용 권장.
 * 두 입력은 union으로 받아 라우트가 분기 처리.
 */
export const MatchInputSchema = z.union([
  KrSpecsSchema,
  z.object({
    /** 사용자 specs ID — 미지정 시 최신 사용 */
    specId: z.string().optional(),
    /** 필터 */
    filter: z
      .object({
        track: z
          .enum([
            "humanities",
            "social",
            "natural",
            "engineering",
            "medical",
            "arts",
            "interdisciplinary",
          ])
          .optional(),
        region: z.string().max(20).optional(),
        category: z.string().max(20).optional(),
      })
      .optional(),
  }),
]);

export type MatchInput = z.infer<typeof MatchInputSchema>;

/* ═══════════════════════════════════════════════════════════════════════
   POST /api/match 응답
   ═══════════════════════════════════════════════════════════════════════ */

export const MatchResultItemSchema = z.object({
  universityId: z.string(),
  universityName: z.string(),
  departmentId: z.string(),
  departmentName: z.string(),
  trackKind: TrackKindSchema,
  trackName: z.string(),
  category: z.enum(["reach", "hard_target", "target", "safety", "insufficient_sample"]),
  probability: z.number().min(0).max(100).nullable(),
  low: z.number().min(0).max(100).nullable(),
  high: z.number().min(0).max(100).nullable(),
  sampleSufficient: z.boolean(),
  sampleN: z.number().int().min(0),
  weightedSampleN: z.number().min(0),
  /** 학종 트랙에 한해 채워짐 (P-006 분해) */
  hakjong: z
    .object({
      stage1Pass: z.number().min(0).max(1).nullable(),
      stage2Pass: z.number().min(0).max(1).nullable(),
      combined: z.number().min(0).max(1).nullable(),
      combinedLow: z.number().min(0).max(1).nullable(),
      combinedHigh: z.number().min(0).max(1).nullable(),
      stage1SampleN: z.number().int().min(0),
      finalSampleN: z.number().int().min(0),
      sampleSufficient: z.boolean(),
    })
    .optional(),
  /** Free 사용자 락 — 결과 페이지가 마스킹 처리 */
  lockable: z.boolean(),
  /** 트랙·학과별 정직성 caveat (P-002, P-012). 빈 배열일 수 있음. */
  caveats: z.array(z.string()).default([]),
});

export const MatchResponseSchema = z.object({
  matchId: z.string(),
  createdAt: z.string(),
  /** P-001 옵션 B: 표본 부족 학과는 별도 섹션. 분류는 결과 페이지가 category로 결정. */
  results: z.array(MatchResultItemSchema),
  /** 무료 사용자 free preview 컷 메타 */
  preview: z.object({
    plan: z.enum(["free", "pro", "elite"]),
    freePreviewQuota: z.number().int().min(0),
    freePreviewUsed: z.number().int().min(0),
    lockedCount: z.number().int().min(0),
  }),
  /** 응답 단위 caveat (정시 변환표 preliminary, 표본 부족 비율 등) */
  globalCaveats: z.array(z.string()).default([]),
});

export type MatchResultItem = z.infer<typeof MatchResultItemSchema>;
export type MatchResponse = z.infer<typeof MatchResponseSchema>;

/* ═══════════════════════════════════════════════════════════════════════
   POST /api/match/simulate — what-if
   ═══════════════════════════════════════════════════════════════════════ */

export const MatchSimulateSchema = z.object({
  baseSpecId: z.string(),
  override: z.object({
    csat: z.object({
      koreanGrade: z.number().int().min(1).max(9).optional(),
      mathGrade: z.number().int().min(1).max(9).optional(),
      englishGrade: z.number().int().min(1).max(9).optional(),
      investigationGradeAvg: z.number().min(1).max(9).optional(),
    }).optional(),
    naesinGpa: z.number().min(1).max(9).optional(),
  }),
});

/* ═══════════════════════════════════════════════════════════════════════
   POST /api/intent/validate — 가/나/다군 중복지원 검증 (P-003)
   ═══════════════════════════════════════════════════════════════════════ */

export const IntentValidateSchema = z.object({
  intent: z.object({
    susi: z.array(SlotSchema).max(6),
    jeongsi: z.object({
      ga: SlotSchema.optional(),
      na: SlotSchema.optional(),
      da: SlotSchema.optional(),
    }),
  }),
});

export type IntentValidateInput = z.infer<typeof IntentValidateSchema>;
