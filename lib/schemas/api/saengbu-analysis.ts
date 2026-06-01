/**
 * POST /api/saengbu-analysis — 생기부(학생부) AI 정성 분석 (Pro 전용)
 *
 * 생기부 전체 텍스트 → 학생부종합전형 5축 루브릭 정성 분석.
 * spec-analysis 패턴 재사용 (정량 입력 대신 자유 텍스트 입력).
 *
 * 정직성(P-002) + 윤리:
 *   - 근거 없는 영역은 score=null + "정보 부족" (추정 X)
 *   - 합격 보장·특정 대학 합격선/등급/확률 수치 생성 금지
 *   - score 는 "역량 루브릭(참고용)"이지 합격 가능성이 아님
 *   - 생기부 = 민감 개인정보 → consent 필수(서버단 재검증), 원문 미저장
 */

import { z } from "zod";

/** 학종 5축 평가요소 (KCUE/대교협 학생부종합 평가요소 기반). */
export const SAENGBU_AXES = [
  "academic", // 학업역량 — 교과 성취·세특 학업 충실도·지적 호기심
  "majorFit", // 전공적합성(진로역량) — 전공 관련 활동·탐구의 깊이·일관성
  "activity", // 활동·경험 — 창의적 체험활동(자율·동아리·진로) 다양성·지속성·주도성
  "community", // 인성·공동체역량 — 행특·협업·리더십·나눔·성실
  "growth", // 발전가능성 — 자기주도성·성장 궤적·잠재력
] as const;
export type SaengbuAxis = (typeof SAENGBU_AXES)[number];

export const SaengbuAnalysisRequestSchema = z.object({
  /** 생기부 전체 텍스트 (NEIS 발급분 복사). 50~30000자. */
  text: z
    .string()
    .min(50, "생기부 텍스트가 너무 짧습니다 (최소 50자). 전체 내용을 붙여넣어주세요.")
    .max(30000, "생기부 텍스트가 너무 깁니다 (최대 30000자). 핵심 항목 위주로 줄여주세요."),
  /** 목표 전공/학과 — 전공적합성 평가 컨텍스트 (선택) */
  focusMajor: z.string().min(1).max(40).optional(),
  /** 개인정보 처리 동의 — 필수. true 아니면 분석 거부 (서버단 방어). */
  consent: z.literal(true, {
    errorMap: () => ({ message: "생기부 분석을 위해 개인정보 처리 동의가 필요합니다." }),
  }),
});
export type SaengbuAnalysisRequest = z.infer<typeof SaengbuAnalysisRequestSchema>;

const AxisScoreSchema = z.object({
  axis: z.enum(SAENGBU_AXES),
  /** 0~100 역량 루브릭 점수. null = 생기부에 근거 부족으로 평가 불가 (P-002) */
  score: z.number().int().min(0).max(100).nullable(),
  comment: z.string().min(1).max(400),
});

export const SaengbuAnalysisResponseSchema = z.object({
  /** 5축 루브릭 점수 + 코멘트 */
  axes: z.array(AxisScoreSchema),
  /** 강점 — 최대 5 */
  strengths: z.array(z.string().min(1).max(200)).max(5),
  /** 보완점 — 최대 5 */
  weaknesses: z.array(z.string().min(1).max(200)).max(5),
  /** 추천 보강 액션 — 최대 5 */
  recommendations: z.array(z.string().min(1).max(200)).max(5),
  /** 목표 전공 적합성 코멘트 (focusMajor 입력 시) */
  majorFit: z
    .object({ major: z.string().min(1).max(60), comment: z.string().min(1).max(500) })
    .nullable(),
  /** 정직성·윤리 안내 — 항상 1개 이상 */
  caveats: z.array(z.string().min(1).max(300)).min(1).max(6),
  /** 응답 출처 */
  source: z.enum(["anthropic", "mock"]),
  /** 캐시 히트 여부 (동일 생기부 재분석 — 신규 토큰 미사용) */
  cached: z.boolean().default(false),
  usage: z.object({
    inputTokens: z.number().int().min(0),
    outputTokens: z.number().int().min(0),
  }),
});
export type SaengbuAnalysisResponse = z.infer<typeof SaengbuAnalysisResponseSchema>;
