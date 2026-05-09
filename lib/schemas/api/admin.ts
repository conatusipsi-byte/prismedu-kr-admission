/**
 * /api/admin/* 입력 스키마
 */

import { z } from "zod";

const DateRangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식").optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식").optional(),
});

/* ═══════════════════════════════════════════════════════════════════════
   GET /api/admin/etl-status
   ═══════════════════════════════════════════════════════════════════════ */

export const AdminEtlStatusQuerySchema = z.object({
  year: z.coerce.number().int().min(2025).max(2099).optional(),
  phase: z.enum(["initial", "conversion", "all"]).default("all"),
});

/* ═══════════════════════════════════════════════════════════════════════
   GET /api/admin/sample-stats
   ═══════════════════════════════════════════════════════════════════════ */

export const AdminSampleStatsQuerySchema = z.object({
  year: z.coerce.number().int().min(2025).max(2099),
  trackKind: z.string().optional(),
  /** "sufficient" / "insufficient" 필터 */
  status: z.enum(["sufficient", "insufficient"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

/* ═══════════════════════════════════════════════════════════════════════
   GET /api/admin/sanitize-monitor
   ═══════════════════════════════════════════════════════════════════════ */

export const AdminSanitizeMonitorQuerySchema = z.object({
  ...DateRangeSchema.shape,
  /** "daily" 시계열 vs "events" 최근 샘플 */
  view: z.enum(["daily", "events"]).default("daily"),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/* ═══════════════════════════════════════════════════════════════════════
   GET /api/admin/etl-status (Day 10 — 실 구현)
   ───────────────────────────────────────────────────────────────────────
   admissionsStaging 컬렉션 조회 — trustLevel·promoted·연도 필터 + 페이지네이션.
   ═══════════════════════════════════════════════════════════════════════ */

export const AdminEtlStatusListQuerySchema = z.object({
  /** 미승격(검수 대기)만 노출하려면 false */
  promoted: z.enum(["true", "false", "all"]).default("false"),
  /** trustLevel 필터 */
  trustLevel: z.enum(["trusted", "trusted-fallback", "suspicious", "all"]).default("all"),
  year: z.coerce.number().int().min(2025).max(2099).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().max(500).optional(),
});

/* ═══════════════════════════════════════════════════════════════════════
   POST /api/admin/etl-promote
   ───────────────────────────────────────────────────────────────────────
   admissionsStaging → admissions/{year} 승격. 필수 필드 검증 후 트랜잭션.
   자동 승격 절대 차단 — 운영자가 검수 후 명시적으로 호출.
   ═══════════════════════════════════════════════════════════════════════ */

export const AdminEtlPromoteSchema = z.object({
  stagingId: z.string().min(1).max(200),
  /** 운영자가 검수하며 보강한 학과 ID — 추출 후보 중 선택 또는 직접 입력 */
  departmentId: z.string().min(1).max(50),
  /** 운영자가 검수하며 확정한 트랙 종류 — 추출 후보 중 선택 또는 직접 입력 */
  trackKind: z.enum([
    "susi_subject",
    "susi_comprehensive",
    "susi_essay",
    "susi_practical",
    "jeongsi_ga",
    "jeongsi_na",
    "jeongsi_da",
    "additional",
    "jaeoegukmin",
  ]),
  /** 트랙 정식명 (예: "활동우수형(학생부종합)") */
  trackName: z.string().min(1).max(100),
  /** 정원 — 모집요강 본문에서 운영자 직접 입력 */
  quotaInitial: z.number().int().min(1).max(10_000),
  /** 운영자가 unparsedSections에서 보강한 추가 메모 (선택) */
  reviewerNotes: z.string().max(2000).optional(),
});

export type AdminEtlPromoteInput = z.infer<typeof AdminEtlPromoteSchema>;

/* ═══════════════════════════════════════════════════════════════════════
   GET /api/admin/users — 사용자 목록·검색·페이지네이션 (Day 12)
   ═══════════════════════════════════════════════════════════════════════ */

export const AdminUsersListQuerySchema = z.object({
  q: z.string().max(100).optional(),
  plan: z.enum(["free", "pro", "elite", "all"]).default("all"),
  status: z.enum(["active", "disabled", "all"]).default("all"),
  masterOnly: z.enum(["true", "false"]).default("false"),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().max(500).optional(),
});

/* ═══════════════════════════════════════════════════════════════════════
   POST /api/admin/users/[uid] — 사용자 mutation
   ═══════════════════════════════════════════════════════════════════════ */

export const AdminUserMutationSchema = z.object({
  action: z.enum(["promote", "revoke", "disable", "enable"]),
  reason: z.string().max(500).optional(),
});

export type AdminUserMutationInput = z.infer<typeof AdminUserMutationSchema>;
