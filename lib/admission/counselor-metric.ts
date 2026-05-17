/**
 * 카운슬러 sanitize 메트릭 기록 — server only.
 *
 * Supabase 마이그레이션:
 *   - daily aggregate (monitoring/counselorSanitize/daily) → 폐기.
 *     날짜별 집계는 sanitize_events 테이블 GROUP BY 로 admin 대시보드에서 계산.
 *   - 개별 sample (monitoring/counselorSanitize/events) → sanitize_events 테이블.
 *   - Sentry warn 로그는 유지 (트리거 즉시 알림).
 *
 * 비용 통제:
 *   - 발동 사례만 sanitize_events 에 기록 (SAMPLE_RATE 비율)
 *   - 비발동 호출은 별도 기록 X (admin 에서 카운슬러 총 호출 수는 counselor_metrics 테이블 또는
 *     별도 카운터로 계산)
 */

import "server-only";
import * as Sentry from "@sentry/nextjs";
import { getAdminSupabase } from "@/lib/supabase-server";
import type {
  SanitizeContext,
  SanitizeResult,
} from "./counselor-postprocess";

/** 개별 이벤트 도큐먼트 저장 비율 (0.0~1.0). */
const SAMPLE_RATE = 0.2;

export async function recordSanitizeMetric(
  result: SanitizeResult,
  ctx: SanitizeContext,
): Promise<void> {
  if (!result.triggered) return;

  try {
    await Promise.all([
      maybeRecordEventSample(result, ctx),
      logSentry(result, ctx),
    ]);
  } catch (e) {
    Sentry.captureException(e, { tags: { source: "counselor-sanitize-metric" } });
  }
}

async function maybeRecordEventSample(
  result: SanitizeResult,
  ctx: SanitizeContext,
): Promise<void> {
  if (Math.random() > SAMPLE_RATE) return;

  const sb = getAdminSupabase();
  const originalParts = result.replacedSentences.map((r) => r.original).join("\n");
  const sanitizedParts = result.replacedSentences.map((r) => r.original /* sanitize 전후 비교 보존 */).join("\n");
  const patterns = result.replacedSentences.map((r) => r.matchedPattern);

  const { error } = await sb.from("sanitize_events").insert({
    user_id: ctx.uid ?? null,
    conversation_id: ctx.conversationId ?? null,
    original_text: originalParts.slice(0, 4000),
    sanitized_text: sanitizedParts.slice(0, 4000),
    trigger_reasons: {
      patterns,
      contextSchools: ctx.insufficientSampleSchools.slice(0, 5),
      totalSentences: result.metricMeta.totalSentences,
      matchedSentences: result.metricMeta.matchedSentences,
    },
    triggered: true,
  });
  if (error) {
    Sentry.captureException(error, { tags: { source: "counselor-sanitize-metric-write" } });
  }
}

function logSentry(result: SanitizeResult, ctx: SanitizeContext): Promise<void> {
  const patterns = result.replacedSentences.map((r) => r.matchedPattern).join(",");
  Sentry.captureMessage(
    `[counselor] sanitize triggered — ${result.replacedSentences.length} sentence(s) replaced [${patterns}]`,
    {
      level: "warning",
      tags: { source: "counselor-sanitize", pattern: patterns },
      extra: {
        uid: ctx.uid,
        conversationId: ctx.conversationId,
        contextSchools: ctx.insufficientSampleSchools.slice(0, 5),
        matchedSentences: result.metricMeta.matchedSentences,
        totalSentences: result.metricMeta.totalSentences,
      },
    },
  );
  return Promise.resolve();
}
