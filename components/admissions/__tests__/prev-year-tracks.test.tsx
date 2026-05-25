/**
 * PrevYearResultCard — 전형 라벨링 회귀 (QA round 2 ②, 2026-05-25).
 *
 * 클라이언트 신고: 어떤 전형의 입결인지 구분 X → 사용자 해석 불가.
 *
 * 본 회귀:
 *   1. 트랙 배지가 표본 충족·부족·데이터 부재 3 상태 모두에서 노출.
 *   2. 정시 트랙 → "환산점수" 라벨, 학종·교과 트랙 → "내신 등급" 라벨.
 *   3. 다중-트랙 학과에선 multi-track-notice disclaimer 노출.
 *   4. 메트릭-트랙 부정합 (정시 + gradeCutoff 만) → metric-mismatch 안내.
 *   5. P-001 결제 키워드 0개 유지.
 *   6. data-track-kind attribute 가 trackKind 반영.
 */

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { PrevYearResultCard } from "../PrevYearResultCard";
import type { PrevYearResult } from "@/types/admission";

const PREV_JEONGSI: PrevYearResult = {
  competitionRate: 5.4,
  cutoff70: 728.5,
  cutoff50: 731.2,
  cutoffAvg: 729.8,
};

const PREV_HAKJONG: PrevYearResult = {
  competitionRate: 12.3,
  gradeCutoff70: 1.85,
  gradeCutoffAvg: 1.62,
  stage1Cutoff: 720.0,
  stage1GradeCutoff: 2.05,
  stage2PassRate: 0.4,
};

const PREV_MIXED_MISMATCH: PrevYearResult = {
  // 정시 트랙인데 gradeCutoff 만 있음 — 데이터 검수 필요 케이스
  competitionRate: 8.1,
  gradeCutoff70: 2.0,
};

const FORBIDDEN_PAYMENT_KEYWORDS = ["업그레이드", "결제", "구독", "구매", "유료"];

describe("PrevYearResultCard — 전형 라벨 (QA round 2 ②)", () => {
  it("트랙 배지가 정상 상태에서 노출 — 정시", () => {
    const { container } = render(
      <PrevYearResultCard
        prevYearResult={PREV_JEONGSI}
        trackKind="jeongsi_na"
        sampleSufficient={true}
      />,
    );
    const badge = container.querySelector('[data-track-kind="jeongsi_na"]');
    expect(badge, "트랙 배지 미노출").not.toBeNull();
    // 배지 라벨 — "정시 나군"
    expect(container.textContent).toContain("정시 나군");
  });

  it("정시 트랙 — '환산점수' 라벨 (등급컷 라벨 X)", () => {
    const { container } = render(
      <PrevYearResultCard
        prevYearResult={PREV_JEONGSI}
        trackKind="jeongsi_na"
        sampleSufficient={true}
      />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("환산점수");
    expect(text).toContain("728"); // cutoff70 값 유지
    expect(text).not.toContain("내신 평균 등급");
    expect(text).not.toContain("내신 70%컷 등급");
  });

  it("학종 트랙 — '내신 등급' 라벨 (환산점수 라벨 X)", () => {
    const { container } = render(
      <PrevYearResultCard
        prevYearResult={PREV_HAKJONG}
        trackKind="susi_comprehensive"
        sampleSufficient={true}
      />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("내신 평균 등급");
    expect(text).toContain("1.62"); // gradeCutoffAvg
    expect(text).not.toContain("환산점수");
  });

  it("학종 — 1단계/2단계 분해 (P-006)", () => {
    const { container } = render(
      <PrevYearResultCard
        prevYearResult={PREV_HAKJONG}
        trackKind="susi_comprehensive"
        sampleSufficient={true}
      />,
    );
    const hak = container.querySelector('[data-element="hakjong-breakdown"]');
    expect(hak).not.toBeNull();
    const text = container.textContent ?? "";
    expect(text).toContain("1단계 통과");
    expect(text).toContain("2단계 통과율");
  });

  it("다중 트랙 — multi-track-notice disclaimer 노출", () => {
    const { container } = render(
      <PrevYearResultCard
        prevYearResult={PREV_JEONGSI}
        trackKind="jeongsi_na"
        availableTrackKinds={["jeongsi_na", "susi_comprehensive", "susi_subject"]}
        sampleSufficient={true}
      />,
    );
    const notice = container.querySelector('[data-element="multi-track-notice"]');
    expect(notice, "다중 트랙 disclaimer 미노출").not.toBeNull();
    expect(notice?.textContent).toContain("다른 전형");
  });

  it("단일 트랙 — disclaimer 미노출", () => {
    const { container } = render(
      <PrevYearResultCard
        prevYearResult={PREV_JEONGSI}
        trackKind="jeongsi_na"
        availableTrackKinds={["jeongsi_na"]}
        sampleSufficient={true}
      />,
    );
    const notice = container.querySelector('[data-element="multi-track-notice"]');
    expect(notice).toBeNull();
  });

  it("availableTrackKinds 미전달 — disclaimer 미노출 (기본 안전)", () => {
    const { container } = render(
      <PrevYearResultCard
        prevYearResult={PREV_JEONGSI}
        trackKind="jeongsi_na"
        sampleSufficient={true}
      />,
    );
    expect(container.querySelector('[data-element="multi-track-notice"]')).toBeNull();
  });

  it("메트릭-트랙 부정합 — 정시 트랙 + gradeCutoff 만 → metric-mismatch 안내", () => {
    const { container } = render(
      <PrevYearResultCard
        prevYearResult={PREV_MIXED_MISMATCH}
        trackKind="jeongsi_na"
        sampleSufficient={true}
      />,
    );
    const mismatch = container.querySelector('[data-element="metric-mismatch"]');
    expect(mismatch, "데이터 부정합 신호 미노출").not.toBeNull();
    expect(mismatch?.textContent).toContain("데이터 검수");
  });

  it("데이터 없음 — 배지 노출 + 결제 키워드 0개", () => {
    const { container } = render(
      <PrevYearResultCard
        trackKind="susi_subject"
        sampleSufficient={true}
      />,
    );
    expect(container.querySelector('[data-state="no-data"]')).not.toBeNull();
    expect(container.querySelector('[data-track-kind="susi_subject"]')).not.toBeNull();
    expect(container.textContent).toContain("학생부교과");
    const text = container.textContent ?? "";
    for (const kw of FORBIDDEN_PAYMENT_KEYWORDS) {
      expect(text).not.toContain(kw);
    }
  });

  it("표본 부족 — 배지 노출 + 컷 비공개 + 다중-트랙 disclaimer 노출 가능", () => {
    const { container } = render(
      <PrevYearResultCard
        prevYearResult={PREV_JEONGSI}
        trackKind="jeongsi_na"
        availableTrackKinds={["jeongsi_na", "susi_comprehensive"]}
        sampleSufficient={false}
      />,
    );
    expect(container.querySelector('[data-state="insufficient-sample"]')).not.toBeNull();
    expect(container.querySelector('[data-track-kind="jeongsi_na"]')).not.toBeNull();
    expect(container.querySelector('[data-element="multi-track-notice"]')).not.toBeNull();
    // 컷 자체는 비공개
    const text = container.textContent ?? "";
    expect(text).not.toContain("728");
    expect(text).toContain("정시 나군");
  });

  it("data-track-kind attribute 가 모든 상태에서 trackKind 반영", () => {
    const states = [
      { props: { trackKind: "susi_essay" as const, sampleSufficient: true }, label: "no-data" },
      {
        props: {
          prevYearResult: PREV_JEONGSI,
          trackKind: "jeongsi_da" as const,
          sampleSufficient: false,
        },
        label: "insufficient",
      },
      {
        props: {
          prevYearResult: PREV_HAKJONG,
          trackKind: "susi_comprehensive" as const,
          sampleSufficient: true,
        },
        label: "ok",
      },
    ];
    for (const c of states) {
      const { container } = render(<PrevYearResultCard {...c.props} />);
      const root = container.querySelector('[data-component="prev-year-result-card"]');
      expect(root?.getAttribute("data-track-kind"), `${c.label} 상태 data-track-kind 누락`).toBe(
        c.props.trackKind,
      );
    }
  });
});
