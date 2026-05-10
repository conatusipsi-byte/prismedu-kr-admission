/**
 * POST /api/compare — 학과 비교 (Pro 전용)
 *
 * 사용자가 2~4개 학과/전형을 골라 모집인원·전년 컷·반영비·표본통계·합격률을
 * 한 번에 받는 라우트. baseSpecId 가 있으면 합격률도 계산.
 */

import { z } from "zod";

const TrackKindSchema = z.enum([
  "susi_subject",
  "susi_comprehensive",
  "susi_essay",
  "susi_practical",
  "jeongsi_ga",
  "jeongsi_na",
  "jeongsi_da",
  "additional",
  "jaeoegukmin",
]);

export const CompareItemSchema = z.object({
  universityId: z.string().min(1).max(50),
  departmentId: z.string().min(1).max(50),
  /** 같은 학과·연도에 여러 전형 운영 가능 — 비교 단위는 (학과,트랙) */
  trackKind: TrackKindSchema,
  /** 같은 kind 내 복수 전형이 있을 때 식별 (생략 시 첫 번째 전형 사용) */
  trackName: z.string().min(1).max(50).optional(),
});

export const CompareRequestSchema = z.object({
  items: z.array(CompareItemSchema).min(2).max(4),
  /** 선택 — 이전 분석 결과 ID. 있으면 합격률·카테고리 계산. */
  baseSpecId: z.string().min(1).max(128).optional(),
});

export type CompareRequest = z.infer<typeof CompareRequestSchema>;
export type CompareItemInput = z.infer<typeof CompareItemSchema>;
