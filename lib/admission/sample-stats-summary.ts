/**
 * /admin/sample-stats 응답 타입 + summarize 헬퍼.
 *
 * Next.js App Router 라우트 파일(/app/api/.../route.ts)은 HTTP method
 * (GET/POST/...) 외 export 시 라우트 타입 검증과 충돌하므로 본 모듈에 분리.
 */

import type { SampleGateResult } from "./sample-gate";

export interface SampleStatsItem {
  id: string;
  universityId: string;
  departmentId: string;
  year: number;
  trackKind: string;
  verifiedCount: number;
  weightedCount: number;
  acceptedCount: number;
  stage1PassedCount?: number;
  stage2AcceptedCount?: number;
  /** sample-gate 결과 — sufficient / 사유별 분류 */
  gate: SampleGateResult;
  updatedAtMs: number;
}

export interface SampleStatsSummary {
  total: number;
  sufficient: number;
  insufficient: number;
  /** 사유별 분포 — 운영자가 ETL 우선순위 결정 */
  byReason: {
    no_data: number;
    below_threshold: number;
    weighted_below: number;
    no_accepted: number;
  };
}

export function summarizeSampleStats(items: SampleStatsItem[]): SampleStatsSummary {
  const summary: SampleStatsSummary = {
    total: items.length,
    sufficient: 0,
    insufficient: 0,
    byReason: { no_data: 0, below_threshold: 0, weighted_below: 0, no_accepted: 0 },
  };
  for (const it of items) {
    if (it.gate.sufficient) {
      summary.sufficient += 1;
    } else {
      summary.insufficient += 1;
      summary.byReason[it.gate.reason] += 1;
    }
  }
  return summary;
}
