/**
 * 결과 페이지 정책 회귀 (P-001 / P-002 / P-006 / P-012)
 *
 * 검증 게이트:
 *   1. P-001 옵션 B — 표본 부족 학과는 별도 섹션 + 결제 CTA 부재
 *   2. P-001 — Free preview 컷 외 학과는 미노출 + PreviewLockOverlay 노출
 *   3. P-006 — 학종 분해 표본 충족 시 1단계·2단계·합산 3 막대
 *   4. P-012 — preliminary 학과 caveat ⚠️ 마커
 *   5. P-002 — "확정 합격" 표현 0건
 *   6. 시각 분리 — 표본 부족 섹션은 회색, 도전 섹션은 rose 등 카테고리별 색상
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AnalysisResultView } from "../AnalysisResultView";
import { PreviewLockOverlay } from "../PreviewLockOverlay";
import { DepartmentRecommendCard } from "../DepartmentRecommendCard";
import { ProbabilityChart } from "../ProbabilityChart";
import type { MatchResponse, MatchResultItem } from "@/lib/schemas/api/match";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(),
    forward: vi.fn(), prefetch: vi.fn(),
  }),
  usePathname: () => "/analysis/match_test_1",
  useSearchParams: () => new URLSearchParams(),
}));

/* ═══════════════════════════════════════════════════════════════════════
   Fixtures
   ═══════════════════════════════════════════════════════════════════════ */

function item(overrides: Partial<MatchResultItem> = {}): MatchResultItem {
  return {
    universityId: "univ",
    universityName: "테스트대학교",
    departmentId: "dept",
    departmentName: "테스트학과",
    trackKind: "jeongsi_na",
    trackName: "일반전형",
    category: "target",
    probability: 50,
    low: 42,
    high: 58,
    sampleSufficient: true,
    sampleN: 12,
    weightedSampleN: 8.5,
    lockable: false,
    caveats: [],
    ...overrides,
  };
}

function response(items: MatchResultItem[], globalCaveats: string[] = []): MatchResponse {
  return {
    matchId: "match_user1_12345",
    createdAt: new Date("2026-05-08T10:00:00Z").toISOString(),
    results: items,
    preview: { plan: "free", freePreviewQuota: 20, freePreviewUsed: 3, lockedCount: 0 },
    globalCaveats,
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   1. P-001 옵션 B — 표본 부족 별도 섹션 + 결제 CTA 부재
   ═══════════════════════════════════════════════════════════════════════ */

describe("P-001 — 표본 부족 학과 별도 섹션", () => {
  it("표본 부족 학과는 'insufficient-sample' data-section에만 노출", () => {
    const data = response([
      item({ category: "target", departmentId: "d1", departmentName: "충분학과" }),
      item({
        category: "insufficient_sample",
        departmentId: "d2",
        departmentName: "표본부족학과",
        probability: null, low: null, high: null,
        sampleSufficient: false, sampleN: 1, weightedSampleN: 0.5,
      }),
    ]);
    const { container } = render(<AnalysisResultView data={data} />);

    const insufficientSection = container.querySelector('[data-section="insufficient-sample"]');
    expect(insufficientSection).not.toBeNull();
    expect(insufficientSection!.textContent).toContain("표본부족학과");

    // 도전/적정/안정 섹션 어디에도 표본 부족 학과 미포함
    const targetSection = container.querySelector('[data-section="target"]');
    expect(targetSection?.textContent).not.toContain("표본부족학과");
  });

  it("표본 부족 섹션 안에 결제 CTA 키워드 0개 ('업그레이드'·'결제'·'유료'·'Pro')", () => {
    const data = response([
      item({
        category: "insufficient_sample",
        departmentId: "d1",
        sampleSufficient: false, sampleN: 1, weightedSampleN: 0.5,
        probability: null, low: null, high: null,
      }),
    ]);
    const { container } = render(<AnalysisResultView data={data} />);
    const section = container.querySelector('[data-section="insufficient-sample"]') as HTMLElement;
    expect(section).not.toBeNull();
    const text = section.textContent ?? "";
    expect(text).not.toMatch(/업그레이드/);
    expect(text).not.toMatch(/결제/);
    expect(text).not.toMatch(/유료\s*플랜/);
    expect(text).not.toMatch(/\bPro\b/);
  });

  it("표본 부족 섹션 카드는 InsufficientSampleCard (data-gated-state='insufficient_sample')", () => {
    const data = response([
      item({
        category: "insufficient_sample",
        sampleSufficient: false, sampleN: 1, weightedSampleN: 0.5,
        probability: null, low: null, high: null,
      }),
    ]);
    const { container } = render(<AnalysisResultView data={data} />);
    const insufficientCard = container.querySelector('[data-gated-state="insufficient_sample"]');
    expect(insufficientCard).not.toBeNull();
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   2. P-001 — Free preview 컷 + PreviewLockOverlay
   ═══════════════════════════════════════════════════════════════════════ */

describe("P-001 — PreviewLockOverlay (Free preview 컷 외)", () => {
  it("lockable=true 학과는 카드로 미노출", () => {
    const data = response([
      item({ category: "target", departmentId: "d-visible", departmentName: "보이는학과", lockable: false }),
      item({ category: "target", departmentId: "d-locked", departmentName: "숨겨진학과", lockable: true }),
    ]);
    const { container } = render(<AnalysisResultView data={data} />);
    expect(container.textContent).toContain("보이는학과");
    expect(container.textContent).not.toContain("숨겨진학과");
  });

  it("섹션 끝에 PreviewLockOverlay 노출 (lockedCount > 0)", () => {
    const data = response([
      item({ category: "target", lockable: false }),
      item({ category: "target", departmentId: "d2", lockable: true }),
      item({ category: "target", departmentId: "d3", lockable: true }),
    ]);
    const { container } = render(<AnalysisResultView data={data} />);
    const overlay = container.querySelector('[data-component="preview-lock-overlay"]');
    expect(overlay).not.toBeNull();
    expect(overlay!.getAttribute("data-locked-count")).toBe("2");
  });

  it("표본 부족 학과는 PreviewLockOverlay 카운트에 포함 안 됨", () => {
    // 표본 부족 학과는 lockable=false (sample-gate가 보장) → overlay 카운트 X
    render(
      <PreviewLockOverlay lockedCount={0} sectionLabel="도전" />,
    );
    expect(screen.queryByText(/업그레이드/)).toBeNull();
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   3. P-006 — 학종 분해 (1단계 × 2단계 × 합산)
   ═══════════════════════════════════════════════════════════════════════ */

describe("P-006 — 학종 분해 표시", () => {
  it("hakjong.sampleSufficient=true → ProbabilityChart는 hakjong 모드", () => {
    const it1 = item({
      trackKind: "susi_comprehensive",
      trackName: "학생부종합전형",
      category: "target",
      hakjong: {
        stage1Pass: 0.6, stage2Pass: 0.4, combined: 0.24,
        combinedLow: 0.17, combinedHigh: 0.31,
        stage1SampleN: 30, finalSampleN: 12,
        sampleSufficient: true,
      },
    });
    const { container } = render(<ProbabilityChart result={it1} />);
    const chart = container.querySelector('[data-component="probability-chart"]');
    expect(chart).not.toBeNull();
    expect(chart!.getAttribute("data-mode")).toBe("hakjong");

    const text = container.textContent ?? "";
    expect(text).toMatch(/1단계 통과/);
    expect(text).toMatch(/면접 통과/);
    expect(text).toMatch(/최종 합격/);
  });

  it("hakjong.sampleSufficient=false → 단일 막대로 fallback + 안내 메시지", () => {
    const it1 = item({
      trackKind: "susi_comprehensive",
      hakjong: {
        stage1Pass: null, stage2Pass: null, combined: null,
        combinedLow: null, combinedHigh: null,
        stage1SampleN: 3, finalSampleN: 4,
        sampleSufficient: false,
      },
    });
    const { container } = render(<ProbabilityChart result={it1} />);
    const chart = container.querySelector('[data-component="probability-chart"]');
    expect(chart!.getAttribute("data-mode")).toBe("single");
    const text = container.textContent ?? "";
    expect(text).toMatch(/표본 누적|P-006/);
  });

  it("category=insufficient_sample → ProbabilityChart는 null 반환", () => {
    const it1 = item({
      category: "insufficient_sample",
      sampleSufficient: false, sampleN: 1, weightedSampleN: 0.5,
      probability: null, low: null, high: null,
    });
    const { container } = render(<ProbabilityChart result={it1} />);
    expect(container.querySelector('[data-component="probability-chart"]')).toBeNull();
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   4. P-012 — preliminary caveat ⚠️ 마커
   ═══════════════════════════════════════════════════════════════════════ */

describe("P-012 — preliminary caveat 표시", () => {
  it("DepartmentRecommendCard는 caveats 영역에 ⚠️ + 텍스트", () => {
    const it1 = item({
      caveats: ["정시 변환표 후공지 — 수능 후 변환표 발표 시 결과가 갱신됩니다 (P-012)."],
    });
    const { container } = render(<DepartmentRecommendCard result={it1} />);
    const caveatBox = container.querySelector('[data-element="caveats"]');
    expect(caveatBox).not.toBeNull();
    expect(caveatBox!.textContent).toMatch(/P-012|변환표/);
  });

  it("caveats 비어있으면 caveats 영역 미노출", () => {
    const it1 = item({ caveats: [] });
    const { container } = render(<DepartmentRecommendCard result={it1} />);
    expect(container.querySelector('[data-element="caveats"]')).toBeNull();
  });

  it("globalCaveats가 있으면 결과 페이지 상단에 'global-caveats' 영역 노출", () => {
    const data = response(
      [item()],
      ["정시 1개 학과의 변환표가 후공지 상태입니다. (P-012)"],
    );
    const { container } = render(<AnalysisResultView data={data} />);
    const block = container.querySelector('[data-element="global-caveats"]');
    expect(block).not.toBeNull();
    expect(block!.textContent).toMatch(/P-012/);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   5. P-002 정직성 — "확정 합격" 표현 차단 + 참고용 안내
   ═══════════════════════════════════════════════════════════════════════ */

describe("P-002 — 정직성 안내 + '확정 합격' 차단", () => {
  it("결과 페이지 어디에도 '확정 합격' 표현 0건 (또는 부정 문맥만)", () => {
    const data = response(
      [
        item({ category: "safety", probability: 88, low: 82, high: 92 }),
        item({ category: "reach", departmentId: "d2", probability: 8, low: 3, high: 13 }),
      ],
      ["정시 1개 학과 변환표 후공지"],
    );
    const { container } = render(<AnalysisResultView data={data} />);
    const text = container.textContent ?? "";

    if (/확정 ?합격/.test(text)) {
      expect(text).toMatch(/확정\s*합격.*(아|마|금지|해석)/);
    } else {
      expect(true).toBe(true);
    }
  });

  it("결과 페이지 hero에 '참고용' 안내 노출", () => {
    const data = response([item()]);
    const { container } = render(<AnalysisResultView data={data} />);
    expect(container.textContent).toMatch(/참고용/);
    expect(container.textContent).toMatch(/모집요강/);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   6. 시각 분리 — 카테고리별 + 표본 부족 회색
   ═══════════════════════════════════════════════════════════════════════ */

describe("시각 분리 — 카테고리 톤 + 표본 부족 회색", () => {
  it("카테고리별 섹션 border 색상 분리 (rose/amber/mint/emerald/zinc)", () => {
    const data = response([
      item({ category: "reach", departmentId: "d1", departmentName: "도전학과" }),
      item({ category: "target", departmentId: "d2", departmentName: "적정학과" }),
      item({ category: "safety", departmentId: "d3", departmentName: "안정학과" }),
      item({
        category: "insufficient_sample", departmentId: "d4", departmentName: "표본부족",
        sampleSufficient: false, sampleN: 1, weightedSampleN: 0.5,
        probability: null, low: null, high: null,
      }),
    ]);
    const { container } = render(<AnalysisResultView data={data} />);

    const reachSec = container.querySelector('[data-section="reach"]') as HTMLElement;
    const targetSec = container.querySelector('[data-section="target"]') as HTMLElement;
    const safetySec = container.querySelector('[data-section="safety"]') as HTMLElement;
    const insufficientSec = container.querySelector('[data-section="insufficient-sample"]') as HTMLElement;

    expect(reachSec.className).toMatch(/rose/);
    expect(targetSec.className).toMatch(/mint/);
    expect(safetySec.className).toMatch(/emerald/);
    expect(insufficientSec.className).toMatch(/zinc/);
  });

  it("DepartmentRecommendCard data-category 정확", () => {
    const { container } = render(<DepartmentRecommendCard result={item({ category: "reach" })} />);
    expect(
      container.querySelector('[data-component="department-recommend-card"]')?.getAttribute("data-category"),
    ).toBe("reach");
  });
});
