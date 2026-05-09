/**
 * P-002 — Sanitize 모니터링 대시보드 정책 회귀
 *
 * 검증:
 *   1. 사용자 ID 마스킹 (saltedUidHash 첫 4자만 노출)
 *   2. 회귀 의심 미해결 임계 초과 시 빨간 강조 + data-alert="true"
 *   3. 미해결 회귀 의심 행은 별도 시각 토큰 (rose 톤)
 *   4. 원본 응답이 80자 잘려 테이블에 노출
 *   5. 모달에서 원본 전체 + 매칭 키워드 노출 (master 검수용)
 *   6. computeStats / computeTrend 계산 정확
 */

import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SanitizeStatsCards } from "../SanitizeStatsCards";
import { SanitizeLogTable } from "../SanitizeLogTable";
import { SanitizeLogDetailModal } from "../SanitizeLogDetailModal";
import {
  computeStats,
  computeTrend,
  maskUid,
  type SanitizeEvent,
  type SanitizeStats,
} from "@/lib/admission/sanitize-events";
import { generateMockEvents } from "@/lib/admission/mock-sanitize-events";

const SAMPLE_LOG: SanitizeEvent = {
  id: "test-1",
  occurredAt: "2026-05-08T10:30:00Z",
  saltedUidHash: "u_abc123def456",
  triggerType: "regression_suspect",
  matchedKeywords: ["확정", "보장"],
  originalResponseExcerpt:
    "이 학과는 본인 스펙이라면 거의 확정적으로 합격하실 수 있습니다. 보장 가능한 수준이고 작년 컷이 ...",
  sanitizedResponse: "본 학과 합격 가능성은 분석 페이지에서 확인하시기 바랍니다.",
  resolved: false,
};

/* ═══════════════════════════════════════════════════════════════════════
   1. maskUid — 사용자 ID 마스킹 (P-002 정직성·개인정보)
   ═══════════════════════════════════════════════════════════════════════ */

describe("maskUid — 사용자 ID 마스킹", () => {
  it("uid 첫 4자만 노출 + ellipsis", () => {
    expect(maskUid("u_abc123def456")).toBe("u_ab…");
  });

  it("짧은 uid 는 그대로 (5자 이하)", () => {
    expect(maskUid("u_a")).toBe("u_a");
  });

  it("LogTable 행에 마스킹된 uid 노출 — 전체 hash 미노출", () => {
    const { container } = render(
      <SanitizeLogTable logs={[SAMPLE_LOG]} pageSize={10} />,
    );
    const masked = container.querySelector('[data-element="masked-uid"]');
    expect(masked?.textContent).toBe("u_ab…");
    // 전체 hash 가 본문 어디에도 없음 (P-002)
    expect(container.textContent).not.toContain("abc123def456");
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   2. SanitizeStatsCards — 임계 초과 시 빨간 강조
   ═══════════════════════════════════════════════════════════════════════ */

describe("SanitizeStatsCards — 회귀 임계", () => {
  function makeStats(overrides: Partial<SanitizeStats>): SanitizeStats {
    return {
      period: "24h",
      totalTriggers: 10,
      uniqueKeywords: 5,
      insufficientSampleCount: 6,
      regressionSuspectCount: 1,
      unresolvedRegressionCount: 1,
      triggerRate: 0.05,
      ...overrides,
    };
  }

  it("미해결 회귀 임계 미달 — data-alert='false'", () => {
    const { container } = render(
      <SanitizeStatsCards stats={makeStats({ unresolvedRegressionCount: 1, period: "24h" })} />,
    );
    const alertCard = container.querySelector('[data-element="stat-card"][data-alert="true"]');
    expect(alertCard).toBeNull();
  });

  it("미해결 회귀 임계 초과 — data-alert='true' + rose 토큰", () => {
    // 24h 임계 = 3
    const { container } = render(
      <SanitizeStatsCards
        stats={makeStats({
          period: "24h",
          regressionSuspectCount: 5,
          unresolvedRegressionCount: 4,
        })}
      />,
    );
    const alertCard = container.querySelector('[data-element="stat-card"][data-alert="true"]');
    expect(alertCard).not.toBeNull();
    expect(alertCard?.className ?? "").toMatch(/rose-/);
    // "임계 초과" 뱃지
    expect(container.textContent).toContain("임계 초과");
  });

  it("발동률 % 단위 + 표본 부족 카운트 노출", () => {
    const { container } = render(
      <SanitizeStatsCards
        stats={makeStats({ triggerRate: 0.0123, insufficientSampleCount: 7 })}
      />,
    );
    expect(container.textContent).toMatch(/1\.23\s*%/);
    expect(container.textContent).toContain("7");
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   3. SanitizeLogTable — 미해결 회귀 행 강조 + 80자 잘림
   ═══════════════════════════════════════════════════════════════════════ */

describe("SanitizeLogTable — 시각·잘림", () => {
  it("미해결 회귀 의심 행은 data-unresolved-regression='true'", () => {
    const { container } = render(
      <SanitizeLogTable logs={[SAMPLE_LOG]} pageSize={10} />,
    );
    const row = container.querySelector('[data-element="log-row"]');
    expect(row?.getAttribute("data-unresolved-regression")).toBe("true");
    expect(row?.className ?? "").toMatch(/rose-/);
  });

  it("해결된 행은 강조 없음", () => {
    const resolved: SanitizeEvent = { ...SAMPLE_LOG, resolved: true };
    const { container } = render(<SanitizeLogTable logs={[resolved]} />);
    const row = container.querySelector('[data-element="log-row"]');
    expect(row?.getAttribute("data-unresolved-regression")).toBe("false");
    expect(row?.className ?? "").not.toMatch(/\bbg-rose-50\b/);
  });

  it("originalResponseExcerpt 80자 이상 잘림", () => {
    const long: SanitizeEvent = {
      ...SAMPLE_LOG,
      originalResponseExcerpt: "가".repeat(200),
    };
    const { container } = render(<SanitizeLogTable logs={[long]} />);
    const excerpt = container.querySelector('[data-element="excerpt"]');
    expect(excerpt?.textContent?.length ?? 0).toBeLessThanOrEqual(81); // 60자 + ellipsis
    expect(excerpt?.textContent).toContain("…");
  });

  it("행 클릭 시 onRowClick 호출", () => {
    let clicked: SanitizeEvent | null = null;
    const { container } = render(
      <SanitizeLogTable
        logs={[SAMPLE_LOG]}
        onRowClick={(log) => {
          clicked = log;
        }}
      />,
    );
    const row = container.querySelector('[data-element="log-row"]') as HTMLElement;
    fireEvent.click(row);
    expect(clicked).not.toBeNull();
    if (clicked) expect((clicked as SanitizeEvent).id).toBe(SAMPLE_LOG.id);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   4. SanitizeLogDetailModal — 원본 + 키워드 + 마스킹
   ═══════════════════════════════════════════════════════════════════════ */

describe("SanitizeLogDetailModal — 원본 노출 + 마스킹", () => {
  // Radix Dialog 가 Portal 로 document.body 에 렌더하므로 RTL container 가 아닌
  // document.body 또는 screen 으로 검사.

  it("모달 열림 시 원본 응답 전체 + 매칭 키워드 노출", () => {
    render(<SanitizeLogDetailModal log={SAMPLE_LOG} onClose={() => {}} />);
    const original = document.querySelector('[data-element="original-excerpt"]');
    expect(original?.textContent ?? "").toContain("거의 확정적으로 합격");
    // 매칭 키워드 — modal portal 안에 노출
    expect(document.body.textContent ?? "").toContain("확정");
    expect(document.body.textContent ?? "").toContain("보장");
  });

  it("모달에서도 사용자 ID 마스킹 — 전체 hash 미노출", () => {
    render(<SanitizeLogDetailModal log={SAMPLE_LOG} onClose={() => {}} />);
    const masked = document.querySelector('[data-element="masked-uid"]');
    expect(masked?.textContent ?? "").toContain("u_ab");
    expect(document.body.textContent ?? "").not.toContain("abc123def456");
  });

  it("미해결 회귀 의심 — 'master 전용' + '미해결' 뱃지", () => {
    render(<SanitizeLogDetailModal log={SAMPLE_LOG} onClose={() => {}} />);
    expect(document.body.textContent ?? "").toContain("master 전용");
    expect(document.body.textContent ?? "").toContain("미해결");
  });

  it("log=null 시 모달 미렌더", () => {
    render(<SanitizeLogDetailModal log={null} onClose={() => {}} />);
    expect(
      document.querySelector('[data-component="sanitize-log-detail-modal"]'),
    ).toBeNull();
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   5. computeStats / computeTrend — 집계 정확성
   ═══════════════════════════════════════════════════════════════════════ */

describe("computeStats / computeTrend — 집계", () => {
  const events = generateMockEvents();

  it("빈 입력 — totalTriggers=0, triggerRate=0", () => {
    const stats = computeStats([], 100, "24h");
    expect(stats.totalTriggers).toBe(0);
    expect(stats.triggerRate).toBe(0);
  });

  it("triggerRate 계산 정확", () => {
    const stats = computeStats(events.slice(0, 5), 100, "24h");
    expect(stats.totalTriggers).toBe(5);
    expect(stats.triggerRate).toBeCloseTo(0.05, 5);
  });

  it("regressionSuspect / insufficient_sample / blocked_keyword 카운트 분해", () => {
    const stats = computeStats(events, 1000, "30d");
    const sum =
      stats.insufficientSampleCount +
      stats.regressionSuspectCount +
      events.filter((e) => e.triggerType === "blocked_keyword").length;
    expect(sum).toBe(events.length);
  });

  it("computeTrend 24h — 24개 hourly bucket 생성", () => {
    const trend = computeTrend(events, "24h", new Date("2026-05-08T18:00:00Z"));
    expect(trend.length).toBe(24);
    // bucketStart 가 시간 단위 정렬
    for (const t of trend) {
      const d = new Date(t.bucketStart);
      expect(d.getUTCMinutes()).toBe(0);
      expect(d.getUTCSeconds()).toBe(0);
    }
  });

  it("computeTrend 30d — daily bucket + 모든 type 카운트", () => {
    const trend = computeTrend(events, "30d", new Date("2026-05-08T23:59:00Z"));
    expect(trend.length).toBeGreaterThanOrEqual(29);
    // byType 모든 키 존재
    expect(trend[0].byType).toHaveProperty("insufficient_sample");
    expect(trend[0].byType).toHaveProperty("blocked_keyword");
    expect(trend[0].byType).toHaveProperty("regression_suspect");
  });
});
