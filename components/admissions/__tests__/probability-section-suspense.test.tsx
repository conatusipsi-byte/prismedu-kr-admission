/**
 * ProbabilitySection — Suspense fallback 회귀 (BUG-002).
 *
 * 결함:
 *   "use client" wrapper 가 sync 한 ProbabilityTab 을 굳이 <React.Suspense fallback={<Card h-32/>}>
 *   로 감싸고 있었음. throw promise 하는 코드가 전혀 없는데도 React 18 streaming SSR 이 일부
 *   페이지에서 클라이언트 컴포넌트를 deferred chunk 로 분리 — 128px 짜리 빈 fallback 카드가
 *   잠깐 또는 영구히 노출됨. QA 1차에서 pusan/info-comp 로 신고됨.
 *
 * 본 테스트가 강제:
 *   1. ProbabilitySection 렌더 결과에 `data-state="..."` (실제 ProbabilityTab 분기 결과) 가 즉시 보임.
 *   2. 빈 h-32 fallback (= `class*="h-32"` 인 EMPTY 카드) 가 DOM 에 존재하지 않음.
 *   3. sampleSufficient=false (표본 부족) — InsufficientSampleCard 즉시 노출.
 *   4. sampleSufficient=true + 미인증 — anonymous CTA 즉시 노출.
 *
 * 따라서 미래에 누가 다시 <Suspense fallback={h-32}> 를 도입하면 (1)·(2)·(3)·(4) 가 실패한다.
 */

import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { ProbabilitySection } from "../ProbabilitySection";

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: null, loading: false }),
}));

function findEmptyH32(container: HTMLElement): HTMLElement | null {
  // h-32 class 가 붙은 element 중 자식이 없는(또는 텍스트가 없는) 것을 찾음.
  const nodes = container.querySelectorAll<HTMLElement>('[class*="h-32"]');
  for (const n of nodes) {
    if (n.children.length === 0 && (n.textContent ?? "").trim() === "") {
      return n;
    }
  }
  return null;
}

describe("ProbabilitySection (BUG-002 회귀)", () => {
  it("표본 부족 — InsufficientSampleCard 가 SSR 결과에 즉시 포함 (Suspense fallback 미경유)", () => {
    const { container } = render(
      <ProbabilitySection trackKind="jeongsi_ga" sampleSufficient={false} />,
    );
    const insufficient = container.querySelector('[data-gated-state="insufficient_sample"]');
    expect(insufficient, "표본 부족 카드가 즉시 렌더되어야 함").not.toBeNull();
  });

  it("표본 충족 + 미인증 — anonymous CTA 가 SSR 결과에 즉시 포함", () => {
    const { container } = render(
      <ProbabilitySection trackKind="jeongsi_ga" sampleSufficient={true} />,
    );
    const anon = container.querySelector('[data-state="anonymous"]');
    expect(anon, "미인증 anonymous CTA 가 즉시 렌더되어야 함").not.toBeNull();
  });

  it("어떤 분기에서도 빈 h-32 fallback 카드가 DOM 에 남지 않는다 (BUG-002 핵심)", () => {
    for (const sampleSufficient of [true, false]) {
      const { container, unmount } = render(
        <ProbabilitySection trackKind="jeongsi_ga" sampleSufficient={sampleSufficient} />,
      );
      const empty = findEmptyH32(container);
      expect(
        empty,
        `sampleSufficient=${sampleSufficient} 에서 빈 h-32 카드 발견 — Suspense fallback 회귀 의심`,
      ).toBeNull();
      unmount();
    }
  });

  it("section wrapper + header (Lock 아이콘 + '합격률 분석' + '로그인 필요' 배지) 항상 노출", () => {
    const { container, getByText } = render(
      <ProbabilitySection trackKind="susi_comprehensive" sampleSufficient={false} />,
    );
    expect(container.querySelector('section[id="probability"]')).not.toBeNull();
    expect(getByText("합격률 분석")).toBeInTheDocument();
    // 미인증이므로 "로그인 필요" 배지가 보임
    expect(getByText("로그인 필요")).toBeInTheDocument();
  });
});
