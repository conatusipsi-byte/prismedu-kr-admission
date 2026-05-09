/**
 * Sanitize 이벤트 데이터 모델 + 집계 로직 (P-002)
 *
 * /api/chat 라우트가 sanitizeCounselorResponse 발동 시 본 모듈로 이벤트 기록.
 * /admin/sanitize-monitor 페이지가 본 모듈로 통계·로그 조회.
 *
 * Firestore: monitoring/sanitizeEvents/{eventId}
 *
 * ⚠️ 개인정보 정책:
 *   - 사용자 ID는 저장 시 hash 적용 (saltedUidHash)
 *   - 원본 응답은 운영자 검수 외에는 노출 X (rules + 마스킹)
 *   - 30일 retention — 자동 삭제 (별도 cron, 후속 PR)
 */

import type { Timestamp } from "@/types/admission";

/* ═══════════════════════════════════════════════════════════════════════
   타입
   ═══════════════════════════════════════════════════════════════════════ */

export type SanitizeTriggerType =
  | "insufficient_sample" // 표본 부족 학과에 합격률 추정 시도
  | "blocked_keyword"     // 차단 키워드 (확정 합격·% 수치 등)
  | "regression_suspect"; // 회귀 의심 — 가드 우회 패턴

export interface SanitizeEvent {
  id: string;
  /** ISO timestamp (조회 인덱스용) */
  occurredAt: string;
  /** Firestore Timestamp (저장용) */
  serverTimestamp?: Timestamp;
  /** 사용자 ID — hash 적용 (예: "u_a1b2c3...") */
  saltedUidHash: string;
  /** 트리거 종류 */
  triggerType: SanitizeTriggerType;
  /** 발동된 차단 키워드·패턴 (예: "확률", "%", "확정") */
  matchedKeywords: string[];
  /** 원본 LLM 응답 — 첫 500자만. 마스터 외 read 차단 (rules) */
  originalResponseExcerpt: string;
  /** sanitize 후 실제 사용자 노출 응답 */
  sanitizedResponse: string;
  /** 사용자 컨텍스트 (학과·학년 등) — 학생 식별 정보 X */
  userContext?: {
    grade?: number;
    schoolType?: string;
  };
  /** 관련 학과 (표본 부족 트리거 시) */
  relatedDepartments?: Array<{
    universityId: string;
    departmentId: string;
  }>;
  /** 운영자 검수 — 회귀 의심 처리 후 resolved=true */
  resolved: boolean;
  resolvedBy?: string;
  resolvedAt?: string;
  resolveNote?: string;
}

/* ═══════════════════════════════════════════════════════════════════════
   집계 통계
   ═══════════════════════════════════════════════════════════════════════ */

export type StatPeriod = "24h" | "7d" | "30d";

export interface SanitizeStats {
  period: StatPeriod;
  /** 총 발동 횟수 */
  totalTriggers: number;
  /** 차단된 키워드 종류 수 (unique) */
  uniqueKeywords: number;
  /** 표본 부족 트리거 수 */
  insufficientSampleCount: number;
  /** 회귀 의심 건수 */
  regressionSuspectCount: number;
  /** 미해결(resolved=false) 회귀 의심 — 운영자 즉시 점검 필요 */
  unresolvedRegressionCount: number;
  /** 총 LLM 응답 대비 발동률 (0~1) — chat 호출 카운트가 별도 컬렉션에서 옴 */
  triggerRate: number;
}

export interface TrendPoint {
  /** ISO bucket 시작 (예: "2026-05-08T15:00:00Z" — hourly) */
  bucketStart: string;
  /** 해당 시간대 발동 횟수 */
  count: number;
  /** 트리거 타입별 분해 */
  byType: Record<SanitizeTriggerType, number>;
}

/* ═══════════════════════════════════════════════════════════════════════
   집계 함수 — pure (mock·실 데이터 모두 동일 입력)
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * 임계치 — 회귀 의심 빨간 뱃지 강조 기준
 * (period 별 다른 임계 적용)
 */
export const REGRESSION_ALERT_THRESHOLD: Record<StatPeriod, number> = {
  "24h": 3,
  "7d": 10,
  "30d": 30,
};

const PERIOD_HOURS: Record<StatPeriod, number> = {
  "24h": 24,
  "7d": 24 * 7,
  "30d": 24 * 30,
};

/**
 * 이벤트 배열 → 통계 집계.
 *
 * @param events       전체 이벤트 (조회한 기간 안)
 * @param totalChatCalls 같은 기간의 총 /api/chat 호출 수 (별도 카운터)
 * @param period       기간 라벨
 */
export function computeStats(
  events: SanitizeEvent[],
  totalChatCalls: number,
  period: StatPeriod,
): SanitizeStats {
  const totalTriggers = events.length;
  const allKeywords = new Set<string>();
  let insufficient = 0;
  let regression = 0;
  let unresolved = 0;

  for (const ev of events) {
    ev.matchedKeywords.forEach((k) => allKeywords.add(k));
    if (ev.triggerType === "insufficient_sample") insufficient++;
    if (ev.triggerType === "regression_suspect") {
      regression++;
      if (!ev.resolved) unresolved++;
    }
  }

  return {
    period,
    totalTriggers,
    uniqueKeywords: allKeywords.size,
    insufficientSampleCount: insufficient,
    regressionSuspectCount: regression,
    unresolvedRegressionCount: unresolved,
    triggerRate: totalChatCalls > 0 ? totalTriggers / totalChatCalls : 0,
  };
}

/**
 * 이벤트 배열 → 시계열 그래프 포인트.
 * 24h: hourly bucket / 7d: daily / 30d: daily
 */
export function computeTrend(
  events: SanitizeEvent[],
  period: StatPeriod,
  now: Date = new Date(),
): TrendPoint[] {
  const hours = PERIOD_HOURS[period];
  const bucketHours = period === "24h" ? 1 : 24;
  const bucketCount = Math.ceil(hours / bucketHours);

  // bucket 초기화
  const buckets: Map<string, TrendPoint> = new Map();
  for (let i = 0; i < bucketCount; i++) {
    const start = new Date(now.getTime() - (bucketCount - 1 - i) * bucketHours * 3600_000);
    // hour-aligned
    start.setMinutes(0, 0, 0);
    if (bucketHours === 24) start.setHours(0, 0, 0, 0);
    const key = start.toISOString();
    buckets.set(key, {
      bucketStart: key,
      count: 0,
      byType: {
        insufficient_sample: 0,
        blocked_keyword: 0,
        regression_suspect: 0,
      },
    });
  }

  // 이벤트 분포
  for (const ev of events) {
    const t = new Date(ev.occurredAt);
    if (Number.isNaN(t.getTime())) continue;
    // bucket key 산출
    const aligned = new Date(t);
    aligned.setMinutes(0, 0, 0);
    if (bucketHours === 24) aligned.setHours(0, 0, 0, 0);
    const key = aligned.toISOString();
    const bucket = buckets.get(key);
    if (!bucket) continue; // out of period
    bucket.count++;
    bucket.byType[ev.triggerType]++;
  }

  return [...buckets.values()].sort((a, b) =>
    a.bucketStart.localeCompare(b.bucketStart),
  );
}

/**
 * 사용자 ID → 마스킹 (UI 노출용).
 * "u_a1b2c3d4..." → "u_a1b…"
 */
export function maskUid(saltedUidHash: string): string {
  if (saltedUidHash.length <= 5) return saltedUidHash;
  return saltedUidHash.slice(0, 4) + "…";
}

/**
 * 원본 응답 발췌 (UI 마스킹).
 * - 마스터가 모달에서 전체 보기 가능
 * - 테이블에선 첫 80자 + ellipsis
 */
export function truncateExcerpt(text: string, max = 80): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trim() + "…";
}
