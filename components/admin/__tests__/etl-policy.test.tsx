/**
 * ETL admin UI 정책 회귀 (Day 10)
 *
 * 검증 게이트:
 *   1. trustLevel별 시각 분리 (suspicious는 rose 강조)
 *   2. promoted=true 항목은 SuspiciousAdmissionsList에서 자동 제외
 *   3. StagingAdmissionDetailModal — 필수 필드 누락 시 승격 버튼 disabled
 *   4. 자동 승격 차단 — 운영자 입력 없이 promote 호출 불가
 *   5. EtlParseResultPreview — suspicious 시 강조 박스 + 검수 안내
 *   6. "확정 합격" / "검열" / 부정 표현 admin UI에 0건 (P-002 일관)
 *   7. 패턴 라벨 — autoEvaluable=false 명시 ("수동 확인 필요")
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { EtlParseResultPreview } from "../EtlParseResultPreview";
import { EtlStatusOverview } from "../EtlStatusOverview";
import { SuspiciousAdmissionsList } from "../SuspiciousAdmissionsList";
import { StagingAdmissionDetailModal } from "../StagingAdmissionDetailModal";
import {
  MOCK_STAGING_ENTRIES,
  summarizeStaging,
  type StagingEntry,
} from "@/lib/admission/mock-etl-staging";
import type { ParsedAdmissionPartial } from "../../../scripts/etl/parsers/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/admin/etl-status",
}));

const NEGATIVE_TERMS = ["검열", "차단", "거부", "막음", "필터링"];

function basicParsed(overrides: Partial<ParsedAdmissionPartial> = {}): ParsedAdmissionPartial {
  return {
    departmentNameCandidates: ["경영학과"],
    trackKindCandidates: [{ kind: "susi_comprehensive", matchedKeyword: "학생부종합", matchedAtOffset: 0 }],
    trustLevel: "trusted",
    unparsedSections: [],
    rawCounts: { "경영학과": 4 },
    ...overrides,
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   1. EtlParseResultPreview — trustLevel 시각 분리
   ═══════════════════════════════════════════════════════════════════════ */

describe("EtlParseResultPreview — trustLevel 시각 분리", () => {
  it("suspicious → 강조 박스 + AlertTriangle 아이콘 + 검수 안내", () => {
    const { container } = render(
      <EtlParseResultPreview parsed={basicParsed({ trustLevel: "suspicious" })} />,
    );
    const root = container.querySelector('[data-component="etl-parse-result-preview"]') as HTMLElement;
    expect(root.getAttribute("data-trust-level")).toBe("suspicious");
    expect(container.querySelector('[data-element="suspicious-warning"]')).not.toBeNull();
    expect(container.textContent).toMatch(/OCR.*운영자 검수/);
  });

  it("trusted → 강조 박스 미노출", () => {
    const { container } = render(
      <EtlParseResultPreview parsed={basicParsed({ trustLevel: "trusted" })} />,
    );
    expect(container.querySelector('[data-element="suspicious-warning"]')).toBeNull();
  });

  it("trusted-fallback → suspicious 박스 미노출 + Adobe-Korea1 라벨", () => {
    const { container } = render(
      <EtlParseResultPreview parsed={basicParsed({ trustLevel: "trusted-fallback" })} />,
    );
    expect(container.querySelector('[data-element="suspicious-warning"]')).toBeNull();
    expect(container.textContent).toMatch(/Adobe-Korea1/);
  });

  it("autoEvaluable=false → '수동 확인 필요' 라벨 (P-002)", () => {
    const { container } = render(
      <EtlParseResultPreview
        parsed={basicParsed()}
        csatMinimumFinalized={{
          candidateAreas: ["korean", "math", "english", "investigation"],
          requiredCount: 3, sumGradeMax: 6,
          complexity: "with_required",
          autoEvaluable: false,
          originalText: "국·수·영·탐 중 3개 합 6, 수학 또는 탐구 포함",
        }}
      />,
    );
    expect(container.textContent).toMatch(/수동 확인 필요/);
    const badge = container.querySelector('[data-element="csat-min-complexity"]') as HTMLElement;
    expect(badge.getAttribute("data-auto-evaluable")).toBe("false");
  });

  it("autoEvaluable=true → '자동판정' 라벨", () => {
    const { container } = render(
      <EtlParseResultPreview
        parsed={basicParsed()}
        csatMinimumFinalized={{
          candidateAreas: ["korean", "math", "english", "investigation"],
          requiredCount: 4, sumGradeMax: 5,
          complexity: "simple_avg",
          autoEvaluable: true,
          originalText: "국·수·영·탐 4개 영역 등급의 합이 5 이내",
        }}
      />,
    );
    expect(container.textContent).toMatch(/자동판정/);
  });

  it("학과명 rawCount 표시", () => {
    const { container } = render(
      <EtlParseResultPreview
        parsed={basicParsed({ rawCounts: { "경영학과": 8 } })}
      />,
    );
    const candidates = container.querySelector('[data-element="department-candidates"]') as HTMLElement;
    expect(candidates.textContent).toMatch(/경영학과.*×8/);
  });

  it("부정 표현 0건 (P-002)", () => {
    const { container } = render(
      <EtlParseResultPreview parsed={basicParsed({ trustLevel: "suspicious" })} />,
    );
    const text = container.textContent ?? "";
    for (const t of NEGATIVE_TERMS) {
      expect(text, `'${t}' 부정 표현 발견`).not.toContain(t);
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   2. SuspiciousAdmissionsList — promoted 자동 제외 + suspicious 우선 정렬
   ═══════════════════════════════════════════════════════════════════════ */

describe("SuspiciousAdmissionsList — 정렬·필터", () => {
  it("promoted=true 항목 자동 제외 (안전망)", () => {
    const { container } = render(
      <SuspiciousAdmissionsList items={MOCK_STAGING_ENTRIES} onSelect={vi.fn()} />,
    );
    // 서울대(promoted=true) 미노출
    expect(container.textContent).not.toContain("서울대학교");
    // 다른 promoted=false 학교는 노출
    expect(container.textContent).toContain("연세대학교");
    expect(container.textContent).toContain("고려대학교");
  });

  it("suspicious 항목이 위쪽 정렬 (운영자 관심도 우선)", () => {
    const { container } = render(
      <SuspiciousAdmissionsList items={MOCK_STAGING_ENTRIES} onSelect={vi.fn()} />,
    );
    const rows = Array.from(container.querySelectorAll("[data-staging-id]")) as HTMLElement[];
    expect(rows[0].getAttribute("data-trust-level")).toBe("suspicious");
  });

  it("suspicious 행에 rose 톤 + AlertTriangle 마커", () => {
    const { container } = render(
      <SuspiciousAdmissionsList items={MOCK_STAGING_ENTRIES} onSelect={vi.fn()} />,
    );
    const suspiciousRow = container.querySelector('[data-trust-level="suspicious"]') as HTMLElement;
    expect(suspiciousRow.className).toMatch(/rose/);
  });

  it("빈 목록 → 빈 상태 메시지", () => {
    const { container } = render(
      <SuspiciousAdmissionsList items={[]} onSelect={vi.fn()} />,
    );
    expect(container.querySelector('[data-empty="true"]')).not.toBeNull();
    expect(container.textContent).toMatch(/검수 대기 항목이 없어요/);
  });

  it("검수 버튼 클릭 → onSelect 콜백", () => {
    const onSelect = vi.fn();
    render(
      <SuspiciousAdmissionsList items={MOCK_STAGING_ENTRIES.slice(0, 1)} onSelect={onSelect} />,
    );
    fireEvent.click(screen.getAllByTestId("open-detail-modal")[0]);
    expect(onSelect).toHaveBeenCalled();
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   3. StagingAdmissionDetailModal — 필수 필드 + 자동 승격 차단
   ═══════════════════════════════════════════════════════════════════════ */

describe("StagingAdmissionDetailModal — 자동 승격 차단", () => {
  function entry(overrides: Partial<StagingEntry> = {}): StagingEntry {
    return {
      ...MOCK_STAGING_ENTRIES[0],
      ...overrides,
    };
  }

  it("필수 필드 누락 시 승격 버튼 disabled + 누락 안내", () => {
    render(
      <StagingAdmissionDetailModal
        open={true}
        onOpenChange={vi.fn()}
        entry={entry()}
        onPromoted={vi.fn()}
      />,
    );
    const promoteBtn = document.querySelector('[data-testid="promote-button"]') as HTMLButtonElement;
    expect(promoteBtn.disabled).toBe(true);
    // 누락 안내 박스
    expect(document.querySelector('[data-element="missing-fields-notice"]')).not.toBeNull();
  });

  it("필수 필드 모두 채우면 승격 버튼 활성화", async () => {
    render(
      <StagingAdmissionDetailModal
        open={true}
        onOpenChange={vi.fn()}
        entry={entry()}
        onPromoted={vi.fn()}
      />,
    );

    fireEvent.change(document.querySelector("#dept-id") as HTMLInputElement, {
      target: { value: "business" },
    });
    // trackKind는 entry.parsed에서 자동 채워짐 (susi_comprehensive)
    fireEvent.change(document.querySelector("#track-name") as HTMLInputElement, {
      target: { value: "활동우수형(학생부종합)" },
    });
    fireEvent.change(document.querySelector("#quota") as HTMLInputElement, {
      target: { value: "64" },
    });

    await waitFor(() => {
      const btn = document.querySelector('[data-testid="promote-button"]') as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    });
    expect(document.querySelector('[data-element="missing-fields-notice"]')).toBeNull();
  });

  it("승격 fetch 호출 후 onPromoted + dialog 닫힘", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, stagingId: "test_id" }), { status: 200 }),
    );
    const onPromoted = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <StagingAdmissionDetailModal
        open={true}
        onOpenChange={onOpenChange}
        entry={entry()}
        onPromoted={onPromoted}
        fetchOverride={fetchMock as unknown as typeof fetch}
      />,
    );

    fireEvent.change(document.querySelector("#dept-id") as HTMLInputElement, { target: { value: "business" } });
    fireEvent.change(document.querySelector("#track-name") as HTMLInputElement, { target: { value: "활동우수형" } });
    fireEvent.change(document.querySelector("#quota") as HTMLInputElement, { target: { value: "64" } });

    await waitFor(() => {
      const btn = document.querySelector('[data-testid="promote-button"]') as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    });
    fireEvent.click(document.querySelector('[data-testid="promote-button"]') as HTMLElement);

    await waitFor(() => {
      expect(onPromoted).toHaveBeenCalledWith(MOCK_STAGING_ENTRIES[0].id);
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("entry=null → null 반환 (안전 가드)", () => {
    const { container } = render(
      <StagingAdmissionDetailModal
        open={true}
        onOpenChange={vi.fn()}
        entry={null}
        onPromoted={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   4. EtlStatusOverview — suspicious 강조
   ═══════════════════════════════════════════════════════════════════════ */

describe("EtlStatusOverview — suspicious 카운트 강조", () => {
  it("suspicious > 0 → OCR 의심 카드 rose 톤", () => {
    const summary = summarizeStaging(MOCK_STAGING_ENTRIES);
    const { container } = render(<EtlStatusOverview summary={summary} />);
    const root = container.querySelector('[data-component="etl-status-overview"]') as HTMLElement;
    expect(parseInt(root.getAttribute("data-suspicious-count") ?? "0", 10)).toBeGreaterThan(0);
    const card = container.querySelector('[data-stat-card="OCR 의심"]') as HTMLElement;
    expect(card.getAttribute("data-tone")).toBe("rose");
  });

  it("suspicious=0 → 의심 카드 neutral 톤", () => {
    const noSuspicious = summarizeStaging(
      MOCK_STAGING_ENTRIES.filter((e) => e.trustLevel !== "suspicious"),
    );
    const { container } = render(<EtlStatusOverview summary={noSuspicious} />);
    const card = container.querySelector('[data-stat-card="OCR 의심"]') as HTMLElement;
    expect(card.getAttribute("data-tone")).toBe("neutral");
  });

  it("trustLevel 분포 막대 3종 모두 노출", () => {
    const summary = summarizeStaging(MOCK_STAGING_ENTRIES);
    const { container } = render(<EtlStatusOverview summary={summary} />);
    const bars = container.querySelector('[data-element="trust-level-bars"]') as HTMLElement;
    expect(bars.textContent).toMatch(/UTF-8/);
    expect(bars.textContent).toMatch(/Adobe-Korea1/);
    expect(bars.textContent).toMatch(/OCR/);
  });

  it("최근 7일 차트 SVG 노출", () => {
    const summary = summarizeStaging(MOCK_STAGING_ENTRIES);
    const { container } = render(<EtlStatusOverview summary={summary} />);
    expect(container.querySelector('[data-element="last7days-chart"]')).not.toBeNull();
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   5. P-002 정직성 — admin UI 전반 부정 표현 0건 / "확정 합격" 0건
   ═══════════════════════════════════════════════════════════════════════ */

describe("P-002 정직성 — admin UI 톤 일관", () => {
  it("EtlParseResultPreview — '확정 합격' 0건", () => {
    const { container } = render(
      <EtlParseResultPreview parsed={basicParsed({ trustLevel: "suspicious" })} />,
    );
    expect(container.textContent ?? "").not.toMatch(/확정\s*합격/);
  });

  it("SuspiciousAdmissionsList — '확정 합격' 0건", () => {
    const { container } = render(
      <SuspiciousAdmissionsList items={MOCK_STAGING_ENTRIES} onSelect={vi.fn()} />,
    );
    expect(container.textContent ?? "").not.toMatch(/확정\s*합격/);
  });

  it("EtlStatusOverview — 부정 표현 0건", () => {
    const summary = summarizeStaging(MOCK_STAGING_ENTRIES);
    const { container } = render(<EtlStatusOverview summary={summary} />);
    const text = container.textContent ?? "";
    for (const t of NEGATIVE_TERMS) {
      expect(text).not.toContain(t);
    }
  });
});
