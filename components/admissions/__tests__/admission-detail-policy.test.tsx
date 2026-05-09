/**
 * 학과 상세 페이지 컴포넌트 — P-001 옵션 B 정책 회귀
 *
 * 검증:
 *   1. 모집요강·반영비율·일정 = 비로그인 노출 OK (정형 정보)
 *   2. ProbabilityTab 만 락·안내 카드로 분기
 *   3. 표본 부족 컴포넌트들 모두 결제 키워드 0개
 *   4. 시각 토큰 분리 (data-sample-sufficient / data-state)
 *
 * 본 회귀가 깨지면 P-001 정책 위반 직결 — PR 머지 게이트.
 */

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { TrackDetailCard } from "../TrackDetailCard";
import { CsatMinimumCard } from "../CsatMinimumCard";
import { ReflectionRatioChart } from "../ReflectionRatioChart";
import { PrevYearResultCard } from "../PrevYearResultCard";
import { ProbabilityTab } from "../ProbabilityTab";
import { AdmissionDetailHero } from "../AdmissionDetailHero";
import { MOCK_SNU_MEDICAL } from "@/lib/admission/mock-data";

const FORBIDDEN_PAYMENT_KEYWORDS = [
  "업그레이드",
  "결제",
  "구독",
  "구매",
  "유료",
];

const FORBIDDEN_PROBABILITY_PATTERNS: RegExp[] = [
  /\d+\s*%/, // % 수치 (정형 정보 카드에서)
];

const TRACK = MOCK_SNU_MEDICAL.admissions.tracks.jeongsi_na?.[0];
if (!TRACK) throw new Error("MOCK_SNU_MEDICAL.tracks.jeongsi_na missing");

/* ═══════════════════════════════════════════════════════════════════════
   1. 정형 정보 카드 — 비로그인 노출 OK 검증
   ═══════════════════════════════════════════════════════════════════════ */

describe("정형 정보 카드 — P-001 비로그인 노출 OK", () => {
  it("Hero 는 결제 키워드 0개", () => {
    const { container } = render(
      <AdmissionDetailHero
        university={MOCK_SNU_MEDICAL.university}
        department={MOCK_SNU_MEDICAL.department}
        availableTracks={MOCK_SNU_MEDICAL.admissions.availableTrackKinds}
        year={2027}
      />,
    );
    const text = container.textContent ?? "";
    for (const kw of FORBIDDEN_PAYMENT_KEYWORDS) {
      expect(text).not.toContain(kw);
    }
    // 학과명·대학명·모집인원은 노출
    expect(text).toContain("의예과");
    expect(text).toContain("서울대");
  });

  it("CsatMinimumCard — 자동판정 가능 케이스: 모집요강 원문 노출 + 결제 키워드 0개", () => {
    const { container } = render(<CsatMinimumCard csatMinimum={TRACK.csatMinimum!} />);
    const text = container.textContent ?? "";
    expect(text).toContain("국·수·영·탐"); // 원문 노출
    for (const kw of FORBIDDEN_PAYMENT_KEYWORDS) {
      expect(text).not.toContain(kw);
    }
  });

  it("ReflectionRatioChart — 영역별 비율 + scoreType 노출 + 결제 키워드 0개", () => {
    const { container } = render(
      <ReflectionRatioChart ratio={TRACK.reflectionRatio!} />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("국어");
    expect(text).toContain("수학");
    expect(text).toContain("탐구");
    for (const kw of FORBIDDEN_PAYMENT_KEYWORDS) {
      expect(text).not.toContain(kw);
    }
  });

  it("TrackDetailCard — 모집인원·일정 노출 + 결제 키워드 0개", () => {
    const { container } = render(<TrackDetailCard track={TRACK} />);
    const text = container.textContent ?? "";
    expect(text).toContain("일반전형");
    expect(text).toContain("105명"); // 모집인원
    for (const kw of FORBIDDEN_PAYMENT_KEYWORDS) {
      expect(text).not.toContain(kw);
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   2. ProbabilityTab — Gated 분기 검증
   ═══════════════════════════════════════════════════════════════════════ */

describe("ProbabilityTab — Gated 분기 (P-001 핵심)", () => {
  it("표본 부족 시 안내 카드 (insufficient_sample) — 결제 키워드 0개", () => {
    const { container } = render(
      <ProbabilityTab
        sampleSufficient={false}
        trackKind="jeongsi_na"
        isAuthenticated={true}
      />,
    );
    const text = container.textContent ?? "";

    // P-001 옵션 B 핵심: 결제 CTA 절대 X
    for (const kw of FORBIDDEN_PAYMENT_KEYWORDS) {
      expect(
        text,
        `❌ P-001 위반: insufficient_sample 상태에서 "${kw}" 키워드 등장`,
      ).not.toContain(kw);
    }

    // 안내 카드 식별 가능한 시각 토큰
    const root = container.querySelector('[data-state="insufficient_sample"]');
    expect(root).not.toBeNull();
  });

  it("표본 부족 시 인터랙티브 요소 0개 (CTA 자체 부재)", () => {
    const { container } = render(
      <ProbabilityTab
        sampleSufficient={false}
        trackKind="jeongsi_na"
        isAuthenticated={true}
      />,
    );
    const root = container.querySelector('[data-state="insufficient_sample"]');
    expect(root).not.toBeNull();
    // Gated.InsufficientSampleCard 가 a/button 0개 보장
    const interactive = root?.querySelectorAll("a, button");
    expect(interactive?.length).toBe(0);
  });

  it("락 상태에서는 업그레이드 CTA 노출 (표본 충족 + 무료 사용자)", () => {
    const { container } = render(
      <ProbabilityTab
        sampleSufficient={true}
        lockReason="free_plan_over_preview_quota"
        trackKind="jeongsi_na"
        isAuthenticated={true}
      />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("업그레이드");
  });

  it("미로그인 시 anonymous 상태 + 로그인 CTA", () => {
    const { container } = render(
      <ProbabilityTab
        sampleSufficient={true}
        trackKind="jeongsi_na"
        isAuthenticated={false}
      />,
    );
    const root = container.querySelector('[data-state="anonymous"]');
    expect(root).not.toBeNull();
    expect(container.textContent).toContain("로그인");
    // 결제 키워드는 없어야 함 (로그인 CTA 만)
    expect(container.textContent).not.toContain("업그레이드");
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   3. PrevYearResultCard — 표본 부족 시 컷 비공개
   ═══════════════════════════════════════════════════════════════════════ */

describe("PrevYearResultCard — 표본 부족 시 컷 비공개", () => {
  const PREV = MOCK_SNU_MEDICAL.prevYearResult!;

  it("표본 충족 시 — 컷 노출", () => {
    const { container } = render(
      <PrevYearResultCard
        prevYearResult={PREV}
        trackKind="jeongsi_na"
        sampleSufficient={true}
      />,
    );
    expect(container.textContent).toContain("728"); // cutoff70
    const root = container.querySelector('[data-state="ok"]');
    expect(root).not.toBeNull();
  });

  it("표본 부족 시 — 컷 비공개 + 결제 키워드 0개", () => {
    const { container } = render(
      <PrevYearResultCard
        prevYearResult={PREV}
        trackKind="jeongsi_na"
        sampleSufficient={false}
      />,
    );
    const text = container.textContent ?? "";
    // 컷 수치 자체가 노출되지 않음
    expect(text).not.toContain("728");
    // 경쟁률은 일반 지표라 노출 OK
    expect(text).toMatch(/경쟁률|5\.4/);
    // 결제 CTA 절대 X
    for (const kw of FORBIDDEN_PAYMENT_KEYWORDS) {
      expect(text).not.toContain(kw);
    }
    const root = container.querySelector('[data-state="insufficient-sample"]');
    expect(root).not.toBeNull();
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   4. 시각 토큰 분리 — 표본 충족 vs 부족
   ═══════════════════════════════════════════════════════════════════════ */

describe("시각 토큰 분리", () => {
  it("PrevYearResultCard 의 data-state 가 sampleSufficient 와 정합", () => {
    const PREV = MOCK_SNU_MEDICAL.prevYearResult!;

    const { container: ok } = render(
      <PrevYearResultCard prevYearResult={PREV} trackKind="jeongsi_na" sampleSufficient={true} />,
    );
    const { container: ins } = render(
      <PrevYearResultCard prevYearResult={PREV} trackKind="jeongsi_na" sampleSufficient={false} />,
    );

    expect(
      ok.querySelector('[data-component="prev-year-result-card"]')?.getAttribute("data-state"),
    ).toBe("ok");
    expect(
      ins.querySelector('[data-component="prev-year-result-card"]')?.getAttribute("data-state"),
    ).toBe("insufficient-sample");
  });

  it("ProbabilityTab — 4가지 상태별 data-state 명확 분기", () => {
    const cases = [
      { sampleSufficient: false, lockReason: undefined as undefined, isAuthenticated: true, expected: "insufficient_sample" },
      { sampleSufficient: true, lockReason: undefined, isAuthenticated: false, expected: "anonymous" },
      { sampleSufficient: true, lockReason: "free_plan_over_preview_quota" as const, isAuthenticated: true, expected: "free_plan_over_preview_quota" },
      { sampleSufficient: true, lockReason: undefined, isAuthenticated: true, expected: "open" },
    ];

    for (const c of cases) {
      const { container, unmount } = render(
        <ProbabilityTab
          sampleSufficient={c.sampleSufficient}
          lockReason={c.lockReason}
          isAuthenticated={c.isAuthenticated}
          trackKind="jeongsi_na"
        />,
      );
      const root = container.querySelector('[data-component="probability-tab"]');
      expect(root?.getAttribute("data-state")).toBe(c.expected);
      unmount();
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   5. 학종 분해 (P-006) — HakjongProbability 표시
   ═══════════════════════════════════════════════════════════════════════ */

describe("학종 분해 표시 (P-006)", () => {
  it("학종 트랙 + sampleSufficient 일 때 1단계/2단계 분해 노출", () => {
    const { container } = render(
      <ProbabilityTab
        sampleSufficient={true}
        lockReason={undefined}
        trackKind="susi_comprehensive"
        isAuthenticated={true}
        probability={{
          category: "target",
          probability: 45,
          low: 35,
          high: 55,
          sampleSufficient: true,
          sampleN: 12,
          weightedSampleN: 11,
        }}
        hakjong={{
          stage1Pass: 0.7,
          stage2Pass: 0.65,
          combined: 0.45,
          combinedLow: 0.35,
          combinedHigh: 0.55,
          stage1SampleN: 14,
          finalSampleN: 8,
          sampleSufficient: true,
        }}
      />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("1단계 통과");
    expect(text).toContain("최종 합격");
    // hakjong 분해 마커
    expect(container.querySelector('[data-element="hakjong-breakdown"]')).not.toBeNull();
  });
});
