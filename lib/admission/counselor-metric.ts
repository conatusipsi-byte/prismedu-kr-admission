/**
 * 카운슬러 sanitize 메트릭 기록 — server only
 *
 * 모든 카운슬러 응답에 대해 일별 카운터를 갱신:
 *   monitoring/counselorSanitize/daily/{YYYY-MM-DD}
 *     totalCalls, triggeredCalls, totalReplacements, byPattern{*}
 *
 * 발동 시 추가로 Sentry warn 레벨 로그 + 개별 이벤트 도큐먼트 (샘플링) 저장:
 *   monitoring/counselorSanitize/events/{eventId}
 *     uid, conversationId, original, matchedPattern, recordedAt
 *
 * 비용 통제:
 *   - 일별 집계는 모든 호출 기록 (counter 1회 write)
 *   - 개별 이벤트는 SAMPLE_RATE 비율로만 저장 (운영자 검수용 표본)
 *
 * admin 대시보드는 이 컬렉션을 읽어 발동률 시계열 / 패턴 분포 / 최근 사례를 노출.
 */

import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import * as Sentry from "@sentry/nextjs";
import { getAdminDb } from "@/lib/firebase-admin";
import type {
  SanitizeContext,
  SanitizeResult,
  PatternLabel,
} from "./counselor-postprocess";

/** 개별 이벤트 도큐먼트 저장 비율 (0.0~1.0).
 *  발동 사례 100건당 평균 SAMPLE_RATE × 100건 보관 — 운영자 표본 검수에 충분. */
const SAMPLE_RATE = 0.2;

/**
 * sanitize 결과를 Firestore + Sentry 에 기록.
 *
 * @param result sanitize 호출 결과
 * @param ctx    sanitize 컨텍스트 (uid, conversationId)
 */
export async function recordSanitizeMetric(
  result: SanitizeResult,
  ctx: SanitizeContext,
): Promise<void> {
  try {
    await Promise.all([
      updateDailyCounter(result),
      result.triggered ? maybeRecordEventSample(result, ctx) : Promise.resolve(),
      result.triggered ? logSentry(result, ctx) : Promise.resolve(),
    ]);
  } catch (e) {
    // 메트릭 기록 실패는 사용자 응답에 영향 X — 조용히 Sentry로만
    Sentry.captureException(e, { tags: { source: "counselor-sanitize-metric" } });
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   일별 집계
   ═══════════════════════════════════════════════════════════════════════ */

async function updateDailyCounter(result: SanitizeResult): Promise<void> {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const ref = getAdminDb()
    .collection("monitoring")
    .doc("counselorSanitize")
    .collection("daily")
    .doc(today);

  const update: Record<string, unknown> = {
    date: today,
    totalCalls: FieldValue.increment(1),
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (result.triggered) {
    update.triggeredCalls = FieldValue.increment(1);
    update.totalReplacements = FieldValue.increment(result.replacedSentences.length);

    // 패턴별 카운트
    const patternCounts = countByPattern(result.replacedSentences.map((r) => r.matchedPattern));
    for (const [pattern, count] of Object.entries(patternCounts)) {
      update[`byPattern.${pattern}`] = FieldValue.increment(count);
    }
  }

  await ref.set(update, { merge: true });
}

function countByPattern(labels: PatternLabel[]): Record<PatternLabel, number> {
  const out = {
    percent: 0, grade: 0, score: 0,
    percentile: 0, standard: 0, cutoff_phrase: 0,
  } as Record<PatternLabel, number>;
  for (const l of labels) out[l] = (out[l] ?? 0) + 1;
  return out;
}

/* ═══════════════════════════════════════════════════════════════════════
   개별 이벤트 샘플 (운영자 검수용)
   ═══════════════════════════════════════════════════════════════════════ */

async function maybeRecordEventSample(
  result: SanitizeResult,
  ctx: SanitizeContext,
): Promise<void> {
  if (Math.random() > SAMPLE_RATE) return;

  const ref = getAdminDb()
    .collection("monitoring")
    .doc("counselorSanitize")
    .collection("events")
    .doc(); // auto id

  await ref.set({
    uid: ctx.uid ?? null,
    conversationId: ctx.conversationId ?? null,
    contextSchoolCount: ctx.insufficientSampleSchools.length,
    contextSchools: ctx.insufficientSampleSchools.slice(0, 5), // 최대 5개만 (PII 우려는 없으나 도큐먼트 사이즈 절약)
    replacedSentences: result.replacedSentences.map((r) => ({
      original: r.original.slice(0, 500), // 본문 잘림 — 평균 응답이 짧아 충분
      matchedPattern: r.matchedPattern,
    })),
    totalSentences: result.metricMeta.totalSentences,
    matchedSentences: result.metricMeta.matchedSentences,
    recordedAt: FieldValue.serverTimestamp(),
  });
}

/* ═══════════════════════════════════════════════════════════════════════
   Sentry warn
   ═══════════════════════════════════════════════════════════════════════ */

function logSentry(result: SanitizeResult, ctx: SanitizeContext): void {
  const patterns = result.replacedSentences.map((r) => r.matchedPattern).join(",");
  Sentry.captureMessage(
    `[counselor] sanitize triggered — ${result.replacedSentences.length} sentence(s) replaced [${patterns}]`,
    {
      level: "warning",
      tags: {
        source: "counselor-sanitize",
        pattern: patterns,
      },
      extra: {
        uid: ctx.uid,
        conversationId: ctx.conversationId,
        contextSchools: ctx.insufficientSampleSchools.slice(0, 5),
        matchedSentences: result.metricMeta.matchedSentences,
        totalSentences: result.metricMeta.totalSentences,
      },
    },
  );
}
