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

/* ═══════════════════════════════════════════════════════════════════════
   Day 6 — 관리자 컨설팅 예약 조회·수정
   ═══════════════════════════════════════════════════════════════════════ */

export const AdminConsultingBookingsQuerySchema = z.object({
  /** 'upcoming' | 'past' | 'cancelled' | 'all' (default: upcoming) */
  status: z.enum(["upcoming", "past", "cancelled", "all"]).default("upcoming"),
  /** YYYY-MM-DD — slot.start_at 기준 from */
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** 검색 — 사용자 이메일, 학생 이름 부분 매칭 (메모리) */
  q: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export type AdminConsultingBookingsQuery = z.infer<typeof AdminConsultingBookingsQuerySchema>;

export const AdminConsultingBookingPatchSchema = z
  .object({
    adminNotes: z.string().max(2000).optional(),
    /** confirmed / completed / no_show 직접 전환 */
    setStatus: z.enum(["completed", "no_show"]).optional(),
    /** 강제 취소 — 24h 정책 우회 */
    forceCancel: z.boolean().optional(),
    cancellationReason: z.string().max(500).optional(),
  })
  .refine(
    (v) =>
      v.adminNotes !== undefined ||
      v.setStatus !== undefined ||
      v.forceCancel === true,
    { message: "변경할 항목이 없습니다 (adminNotes, setStatus, forceCancel 중 하나는 필수)" },
  );
export type AdminConsultingBookingPatch = z.infer<typeof AdminConsultingBookingPatchSchema>;

/* ═══════════════════════════════════════════════════════════════════════
   컨설팅 슬롯 관리 — /api/admin/consulting/slots (admin 슬롯 열기/닫기/생성)
   ═══════════════════════════════════════════════════════════════════════ */

/** GET — 날짜 범위 내 전체 슬롯(available/booked/blocked) 조회. 기본 향후 14일. */
export const AdminConsultingSlotsQuerySchema = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식").optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식").optional(),
    /** 상태 필터 (미지정 = 전체) */
    status: z.enum(["available", "booked", "blocked"]).optional(),
  })
  .refine(
    (v) => !v.from || !v.to || Date.parse(`${v.to}T00:00:00Z`) >= Date.parse(`${v.from}T00:00:00Z`),
    { message: "to 는 from 이후여야 합니다", path: ["to"] },
  );
export type AdminConsultingSlotsQuery = z.infer<typeof AdminConsultingSlotsQuerySchema>;

/** PATCH /[id] — 단일 슬롯 status 토글. booked 은 대상 아님(예약 보호 → 라우트에서 거부). */
export const AdminConsultingSlotPatchSchema = z.object({
  status: z.enum(["available", "blocked"]),
});
export type AdminConsultingSlotPatch = z.infer<typeof AdminConsultingSlotPatchSchema>;

/** POST /generate — 향후 N일치 슬롯 멱등 생성 (slot-schedule 12:00~20:00 60분). */
export const AdminConsultingSlotsGenerateSchema = z.object({
  daysAhead: z.coerce.number().int().min(1).max(60).default(14),
});
export type AdminConsultingSlotsGenerate = z.infer<typeof AdminConsultingSlotsGenerateSchema>;

/** POST /bulk — 특정 KST 날짜 전체 열기/닫기. booked 슬롯은 건너뜀(예약 보호). */
export const AdminConsultingSlotsBulkSchema = z.object({
  /** 대상 KST 날짜 (YYYY-MM-DD) */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식"),
  /** open: blocked→available / close: available→blocked */
  action: z.enum(["open", "close"]),
});
export type AdminConsultingSlotsBulk = z.infer<typeof AdminConsultingSlotsBulkSchema>;

export const AdminConsultingApplicationsQuerySchema = z.object({
  /** 'unbooked' (booking 없음) | 'all' (default: unbooked) */
  filter: z.enum(["unbooked", "all"]).default("unbooked"),
  /** 최소 며칠 경과 (unbooked 필터에서) */
  olderThanDays: z.coerce.number().int().min(0).max(365).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export type AdminConsultingApplicationsQuery = z.infer<typeof AdminConsultingApplicationsQuerySchema>;

/* ═══════════════════════════════════════════════════════════════════════
   GET /api/admin/orders — 주문 목록·필터·페이지네이션
   ═══════════════════════════════════════════════════════════════════════ */

export const AdminOrdersListQuerySchema = z.object({
  status: z
    .enum(["pending", "approved", "failed", "refunded", "cancelled", "all"])
    .default("all"),
  /** 환불 요청 대기만 노출 — refund 필드는 없지만 status=cancelled 또는 별도 환불 상태 도큐먼트로 구현 가능. 일단 status 필터로 시작. */
  /** 검색 — orderId, uid, email, productName 부분 매칭 (메모리 필터) */
  q: z.string().max(100).optional(),
  /** YYYY-MM-DD — createdAt >= from 00:00 KST */
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식").optional(),
  /** YYYY-MM-DD — createdAt < to+1 00:00 KST */
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식").optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().max(500).optional(),
});
