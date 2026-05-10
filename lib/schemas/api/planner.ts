/**
 * /api/planner — 입시 자동 플래너 (Pro 전용)
 *
 * GET: 사용자 intent + 표준 입시 일정 기반 task 자동 생성. 완료 상태는
 *      users/{uid}/plannerCompletions/{taskId} 에서 머지.
 * PATCH: taskId 완료/미완료 토글.
 */

import { z } from "zod";

export const PlannerCategorySchema = z.enum([
  "csat",
  "naesin",
  "application",
  "interview",
  "essay",
  "practical",
  "documents",
]);

export type PlannerCategory = z.infer<typeof PlannerCategorySchema>;

export const PlannerTaskSchema = z.object({
  /** 결정적 ID — 같은 사용자·intent에 대해 동일하게 생성 */
  id: z.string().min(1).max(120),
  title: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  category: PlannerCategorySchema,
  /** ISO date — 마감/예정일 */
  dueDate: z.string().min(8).max(40),
  completed: z.boolean(),
  /** 어떤 슬롯에서 파생됐는지 (universityId/departmentId/trackKind) — undefined 면 일반 task */
  sourceSlot: z
    .object({
      universityId: z.string(),
      departmentId: z.string(),
      trackKind: z.string(),
    })
    .optional(),
});

export type PlannerTask = z.infer<typeof PlannerTaskSchema>;

export const PlannerGetResponseSchema = z.object({
  tasks: z.array(PlannerTaskSchema),
  /** 결정적 생성 base date (현재 날짜 기준) — 디버깅용 */
  generatedAt: z.string(),
  /** intent 미작성 시 빈 배열 + 안내 메시지 */
  empty: z.boolean(),
});

export type PlannerGetResponse = z.infer<typeof PlannerGetResponseSchema>;

export const PlannerPatchRequestSchema = z.object({
  taskId: z.string().min(1).max(120),
  completed: z.boolean(),
});

export type PlannerPatchRequest = z.infer<typeof PlannerPatchRequestSchema>;
