/**
 * POST /api/spec-analysis — 학종 비교과 정성 분석 (Pro 전용)
 *
 * 자율·동아리·진로·세특·행특 정량 입력 → AI 정성 분석.
 * 정직성(P-002): 데이터 부족 시 추측치 X, "정보 부족" 명시.
 */

import { z } from "zod";
import { KrSpecsSchema } from "@/lib/schemas/api/match";

export const SpecAnalysisRequestSchema = z.object({
  /** KrSpecsSchema 동일 — 분석 폼 페이로드 재사용 */
  specs: KrSpecsSchema,
  /** 어떤 전공을 목표로 하는지 — 적합도 평가 컨텍스트 */
  focusMajor: z.string().min(1).max(40).optional(),
});

export type SpecAnalysisRequest = z.infer<typeof SpecAnalysisRequestSchema>;

const ActivityScoreSchema = z.object({
  /** 활동 영역 (자율/동아리/진로/세특/행특) */
  area: z.enum([
    "autonomous",
    "club",
    "career",
    "detailedAbility",
    "behavioralCharacteristics",
  ]),
  /** 0~100. null = 입력 데이터 부족으로 평가 불가 (P-002) */
  score: z.number().int().min(0).max(100).nullable(),
  comment: z.string().min(1).max(400),
});

export const SpecAnalysisResponseSchema = z.object({
  /** 영역별 정량 점수 + 코멘트 */
  activities: z.array(ActivityScoreSchema),
  /** 강점 — 1~5개 */
  strengths: z.array(z.string().min(1).max(200)).max(5),
  /** 약점 — 1~5개 */
  weaknesses: z.array(z.string().min(1).max(200)).max(5),
  /** 추천 액션 — 부족 영역 보강 */
  recommendations: z.array(z.string().min(1).max(200)).max(5),
  /** 정직성 caveat — 데이터 부족 영역 또는 일반론 한계 */
  caveats: z.array(z.string().min(1).max(200)).max(5),
  /** 응답 출처 */
  source: z.enum(["anthropic", "mock"]),
  usage: z.object({
    inputTokens: z.number().int().min(0),
    outputTokens: z.number().int().min(0),
  }),
});

export type SpecAnalysisResponse = z.infer<typeof SpecAnalysisResponseSchema>;
