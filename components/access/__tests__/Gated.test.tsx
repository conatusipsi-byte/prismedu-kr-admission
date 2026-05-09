/**
 * Gated 컴포넌트 — 회귀 테스트
 *
 * 핵심 안전 보장 (P-001 옵션 B):
 *   1. insufficient_sample 카드는 절대 결제 CTA 표시하지 않음
 *      → "업그레이드"·"결제"·"플랜"·"구독" 등 결제 관련 키워드 0건
 *   2. lock 카드는 항상 업그레이드 CTA 표시
 *   3. paid_plan / in_free_preview 는 항상 children 그대로 (락 UI 0건)
 *   4. 색상·아이콘 토큰 정확히 분리:
 *      - insufficient: data-gated-state="insufficient_sample" + 시계(Clock) 아이콘
 *      - locked:        data-gated-state="locked"             + 자물쇠(Lock) 아이콘
 *
 * 본 회귀가 깨지면 P-001 정책 위반 → 사용자 환불 분쟁 위험.
 * 따라서 PR 머지 게이트로 사용 강제.
 */

import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { Gated } from "../Gated";

const Child = () => <div data-testid="child-content">합격 확률 78%</div>;

/** 결제 관련 키워드 — 본 단어들이 insufficient_sample 카드에 등장하면 P-001 위반. */
const PAYMENT_KEYWORDS = ["업그레이드", "결제", "플랜", "구독", "구매", "유료"];

/* ═══════════════════════════════════════════════════════════════════════
   1. paid_plan / 미지정 — children 그대로
   ═══════════════════════════════════════════════════════════════════════ */

describe("Gated — paid_plan / 미지정", () => {
  it("reason 미지정 시 children 그대로 렌더", () => {
    render(
      <Gated feature="analysis">
        <Child />
      </Gated>,
    );
    expect(screen.getByTestId("child-content")).toBeInTheDocument();
    // 어떤 게이트 상태도 노출되면 안 됨
    expect(document.querySelector("[data-gated-state]")).toBeNull();
  });

  it("reason='paid_plan' 시 children 그대로 렌더", () => {
    render(
      <Gated feature="analysis" reason="paid_plan">
        <Child />
      </Gated>,
    );
    expect(screen.getByTestId("child-content")).toBeInTheDocument();
    expect(document.querySelector("[data-gated-state]")).toBeNull();
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   2. in_free_preview — children + 카운터
   ═══════════════════════════════════════════════════════════════════════ */

describe("Gated — in_free_preview", () => {
  it("children 노출 + 카운터 배지 표시", () => {
    render(
      <Gated
        feature="analysis"
        reason="in_free_preview"
        previewCounter={{ current: 5, max: 20 }}
      >
        <Child />
      </Gated>,
    );
    expect(screen.getByTestId("child-content")).toBeInTheDocument();

    const root = document.querySelector('[data-gated-state="in_free_preview"]');
    expect(root).not.toBeNull();

    const counter = document.querySelector('[data-gated-state="counter"]');
    expect(counter).not.toBeNull();
    expect(counter?.textContent).toMatch(/5\s*\/\s*20/);
  });

  it("previewCounter 미지정 시 카운터 배지 미노출 (children 만 렌더)", () => {
    render(
      <Gated feature="analysis" reason="in_free_preview">
        <Child />
      </Gated>,
    );
    expect(screen.getByTestId("child-content")).toBeInTheDocument();
    expect(document.querySelector('[data-gated-state="counter"]')).toBeNull();
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   3. insufficient_sample — P-001 핵심: 결제 CTA 절대 X
   ═══════════════════════════════════════════════════════════════════════ */

describe("Gated — insufficient_sample (P-001 핵심)", () => {
  it("data-gated-state='insufficient_sample' 마킹", () => {
    render(<Gated feature="analysis" reason="insufficient_sample" />);
    const root = document.querySelector('[data-gated-state="insufficient_sample"]');
    expect(root).not.toBeNull();
  });

  it("'표본 부족' 배지 노출", () => {
    render(<Gated feature="analysis" reason="insufficient_sample" />);
    expect(screen.getByText(/표본 부족/)).toBeInTheDocument();
  });

  it("sampleN 지정 시 메시지에 표시", () => {
    render(
      <Gated feature="analysis" reason="insufficient_sample" sampleN={3} />,
    );
    expect(screen.getByText(/3건/)).toBeInTheDocument();
  });

  it("[핵심 회귀] 결제 관련 키워드가 카드 안에 절대 등장하지 않음", () => {
    const { container } = render(
      <Gated feature="analysis" reason="insufficient_sample" sampleN={2} />,
    );
    const cardText = container.textContent ?? "";

    for (const keyword of PAYMENT_KEYWORDS) {
      expect(
        cardText,
        `❌ P-001 위반: insufficient_sample 카드에 "${keyword}" 등장. 본 카드는 결제 CTA 절대 X.`,
      ).not.toContain(keyword);
    }
  });

  it("[핵심 회귀] 카드에 링크(`<a>` 또는 button asChild) 0개 — CTA 자체 부재", () => {
    const { container } = render(
      <Gated feature="analysis" reason="insufficient_sample" />,
    );
    const root = container.querySelector('[data-gated-state="insufficient_sample"]') as HTMLElement | null;
    expect(root).not.toBeNull();
    if (root) {
      const linksAndButtons = root.querySelectorAll("a, button");
      expect(
        linksAndButtons.length,
        "❌ P-001 위반: insufficient_sample 카드에 인터랙티브 요소 발견.",
      ).toBe(0);
    }
  });

  it("'분석 페이지에서 자동 표시' 또는 '표본이 더 누적되면' 안내 텍스트 등장", () => {
    render(<Gated feature="analysis" reason="insufficient_sample" />);
    const text = document.body.textContent ?? "";
    expect(
      /자동으로 표시|표본이.*누적/.test(text),
      "안내 카드에 '표본 누적 시 자동 표시' 메시지가 있어야 사용자에게 정직한 안내",
    ).toBe(true);
  });

  it("children 은 렌더되지 않음 (대신 안내 카드)", () => {
    render(
      <Gated feature="analysis" reason="insufficient_sample">
        <Child />
      </Gated>,
    );
    expect(screen.queryByTestId("child-content")).toBeNull();
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   4. free_plan_over_preview_quota — 락 카드 + 업그레이드 CTA
   ═══════════════════════════════════════════════════════════════════════ */

describe("Gated — free_plan_over_preview_quota (락 카드)", () => {
  it("data-gated-state='locked' 마킹", () => {
    render(<Gated feature="analysis" reason="free_plan_over_preview_quota" />);
    expect(document.querySelector('[data-gated-state="locked"]')).not.toBeNull();
  });

  it("[핵심] 업그레이드 CTA(Link to /pricing) 항상 노출", () => {
    render(<Gated feature="analysis" reason="free_plan_over_preview_quota" />);
    const link = screen.getByRole("link", { name: /업그레이드/ });
    expect(link).toBeInTheDocument();
    expect(link.getAttribute("href")).toBe("/pricing");
  });

  it("upgradeHref 커스터마이징 동작", () => {
    render(
      <Gated
        feature="analysis"
        reason="free_plan_over_preview_quota"
        upgradeHref="/pricing?plan=elite"
      />,
    );
    const link = screen.getByRole("link", { name: /업그레이드/ });
    expect(link.getAttribute("href")).toBe("/pricing?plan=elite");
  });

  it("feature 별 라벨 다르게 노출", () => {
    const features = ["analysis", "autoPlanner", "compare", "whatIf", "aiCounselor"] as const;
    const labels = ["합격률 분석", "자동 플래너", "대학·학과 비교", "가정 시뮬레이터", "AI 카운슬러"];

    for (let i = 0; i < features.length; i++) {
      const { unmount } = render(
        <Gated feature={features[i]} reason="free_plan_over_preview_quota" />,
      );
      // getAllByText — feature 라벨이 헤더 + 업그레이드 카피 양쪽에 등장 가능 (e.g., AI 카운슬러)
      expect(screen.getAllByText(new RegExp(labels[i])).length).toBeGreaterThan(0);
      unmount();
    }
  });

  it("children 은 렌더되지 않음 (대신 락 카드)", () => {
    render(
      <Gated feature="analysis" reason="free_plan_over_preview_quota">
        <Child />
      </Gated>,
    );
    expect(screen.queryByTestId("child-content")).toBeNull();
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   5. 시각적 분리 — 색상·아이콘 토큰 검증
   ═══════════════════════════════════════════════════════════════════════ */

describe("Gated — 시각 토큰 분리 검증", () => {
  it("insufficient_sample 카드는 zinc(회색) 토큰 사용 (mint 미사용)", () => {
    const { container } = render(
      <Gated feature="analysis" reason="insufficient_sample" />,
    );
    const root = container.querySelector('[data-gated-state="insufficient_sample"]') as HTMLElement | null;
    expect(root).not.toBeNull();

    const className = root?.className ?? "";
    expect(/zinc-/.test(className)).toBe(true);
    expect(/\bmint-/.test(className)).toBe(false);
  });

  it("locked 카드는 mint 토큰 사용 (zinc 미사용)", () => {
    const { container } = render(
      <Gated feature="analysis" reason="free_plan_over_preview_quota" />,
    );
    const root = container.querySelector('[data-gated-state="locked"]') as HTMLElement | null;
    expect(root).not.toBeNull();

    const className = root?.className ?? "";
    expect(/mint-/.test(className)).toBe(true);
    // border가 zinc 가 아님 (락 카드는 mint 일관)
    expect(/border-zinc-/.test(className)).toBe(false);
  });

  it("두 카드의 data-gated-state 가 절대 동일하지 않음 (시각 충돌 차단)", () => {
    const { container: c1 } = render(
      <Gated feature="analysis" reason="insufficient_sample" />,
    );
    const { container: c2 } = render(
      <Gated feature="analysis" reason="free_plan_over_preview_quota" />,
    );

    const state1 = c1.querySelector("[data-gated-state]")?.getAttribute("data-gated-state");
    const state2 = c2.querySelector("[data-gated-state]")?.getAttribute("data-gated-state");

    expect(state1).toBe("insufficient_sample");
    expect(state2).toBe("locked");
    expect(state1).not.toBe(state2);
  });
});
