/**
 * /api/admission-fit — AI 적합도 분석 (Layer 1)
 *
 * 학생 프로필 + 특정 학과/전형의 "요구"(전형방법·반영비율·수능최저·계열)를 AI가 비교해
 * "적합도 등급(강/중/약 부합) + 강·약점 + 보강 추천"을 산출. 입결(합격선) 불필요.
 *
 * ⚠️ 합격 "확률"이 아니라 "전형 요구 대비 적합도 판단" — 통계 합격률(Layer 2)과 분리.
 *
 * 비용 구조(최우선): 검색/목록은 AI 호출 0. 본 분석은 학생이 특정 학과 1개에 대해
 * 명시적으로 요청할 때만 호출 + ai-cache(프로필+학과 동일 시 0토큰) + rate-limit.
 */
import { z } from "zod";

export const FIT_TRACK_KINDS = [
  "susi_subject", "susi_comprehensive", "susi_essay", "susi_practical",
  "jeongsi_ga", "jeongsi_na", "jeongsi_da", "additional", "jaeoegukmin",
] as const;

export const AdmissionFitRequestSchema = z.object({
  universityId: z.string().min(1).max(50),
  departmentId: z.string().min(1).max(50),
  trackKind: z.enum(FIT_TRACK_KINDS),
});
export type AdmissionFitRequest = z.infer<typeof AdmissionFitRequestSchema>;

export const FIT_TIERS = ["strong", "moderate", "weak"] as const;
export type FitTier = (typeof FIT_TIERS)[number];

/** AI 가 출력하는 핵심 본문 (parse 대상). */
export const AdmissionFitCoreSchema = z.object({
  /** 전형 요구 대비 적합도 등급 (합격률 아님) */
  fitTier: z.enum(FIT_TIERS),
  /** 1~2문장 종합 요약 */
  summary: z.string().min(1).max(400),
  strengths: z.array(z.string().min(1).max(200)).max(5),
  weaknesses: z.array(z.string().min(1).max(200)).max(5),
  recommendations: z.array(z.string().min(1).max(200)).max(5),
  caveats: z.array(z.string().min(1).max(300)).max(5),
});
export type AdmissionFitCore = z.infer<typeof AdmissionFitCoreSchema>;

export const CsatMinStatusSchema = z.object({
  status: z.enum(["met", "not_met", "complex", "none", "unknown"]),
  note: z.string(),
});

export const AdmissionFitResponseSchema = AdmissionFitCoreSchema.extend({
  /** 결정적 사실 — 수능최저 충족(AI 아님, min-req-classifier) */
  csatMinimum: CsatMinStatusSchema,
  context: z.object({
    universityName: z.string(),
    departmentName: z.string(),
    trackKind: z.enum(FIT_TRACK_KINDS),
    trackName: z.string(),
  }),
  source: z.enum(["anthropic", "mock"]),
  cached: z.boolean(),
  usage: z.object({
    inputTokens: z.number().int().min(0),
    outputTokens: z.number().int().min(0),
  }),
});
export type AdmissionFitResponse = z.infer<typeof AdmissionFitResponseSchema>;

export const FIT_TIER_LABEL: Record<FitTier, string> = {
  strong: "강한 부합",
  moderate: "부분 부합",
  weak: "약한 부합",
};
