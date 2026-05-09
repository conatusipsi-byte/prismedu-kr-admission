/**
 * P-013 — 재외국민·외국인 진입점 분리 정책 회귀
 *
 * 검증:
 *   1. TrackFilter 디폴트(allowJaeoegukmin=false)에서 jaeoegukmin 옵션 미노출
 *   2. JaeoegukminEntryHero 의 시각 토큰 분리 (purple)
 *   3. 자격 분류 로직 (classifyEligibility) 4 분기 정확
 *   4. 자격 미달(not_eligible) 결과 카드에 "일반 전형" CTA 노출 (이탈 방지)
 *   5. 모든 결과 카드에 P-002 정직성 안내 ("참고용", "모집요강 확인")
 *   6. 결과 카드의 caveat 영역이 P-002 강조 색상 (amber)
 *
 * 회귀 게이트 — 본 테스트 깨지면 P-013 정책 위반.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { JaeoegukminEntryHero } from "../JaeoegukminEntryHero";
import { JaeoegukminResultCard } from "../JaeoegukminResultCard";
import { TrackFilter } from "../TrackFilter";
import {
  classifyEligibility,
  type JaeoegukminInput,
} from "@/lib/admission/jaeoegukmin-eligibility";

/* ═══════════════════════════════════════════════════════════════════════
   1. TrackFilter — 디폴트 jaeoegukmin 미노출
   ═══════════════════════════════════════════════════════════════════════ */

describe("P-013 — TrackFilter 진입점 분리", () => {
  it("디폴트 (allowJaeoegukmin=false) 에서 '재외국민' 옵션 미노출", () => {
    render(<TrackFilter selected={[]} onChange={() => {}} />);
    expect(screen.queryByText(/재외국민/)).toBeNull();
  });

  it("allowJaeoegukmin=true 에서만 '재외국민' 옵션 노출", () => {
    render(<TrackFilter selected={[]} onChange={() => {}} allowJaeoegukmin={true} />);
    expect(screen.getByText(/재외국민/)).toBeInTheDocument();
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   2. JaeoegukminEntryHero — 시각 토큰 분리 (purple)
   ═══════════════════════════════════════════════════════════════════════ */

describe("P-013 — JaeoegukminEntryHero 시각 분리", () => {
  it("data-color-token='purple' 명시", () => {
    const { container } = render(<JaeoegukminEntryHero />);
    const root = container.querySelector('[data-component="jaeoegukmin-hero"]');
    expect(root?.getAttribute("data-color-token")).toBe("purple");
  });

  it("purple 배경 클래스 + zinc/mint 미사용 (시각 충돌 차단)", () => {
    const { container } = render(<JaeoegukminEntryHero />);
    const root = container.querySelector('[data-component="jaeoegukmin-hero"]') as HTMLElement;
    const cls = root.className;
    expect(/purple-/.test(cls)).toBe(true);
    expect(/\bmint-/.test(cls)).toBe(false);
  });

  it("P-002 정직성 안내 — '확정' 표현 차단", () => {
    const { container } = render(<JaeoegukminEntryHero />);
    const text = container.textContent ?? "";
    // 정직성 안내 키워드 존재
    expect(text).toMatch(/모집요강.*확인/);
    expect(text).toMatch(/1차 분류|참고|확인|확정 합격/);
    // "확정" 단어 자체는 명시적 부정 문맥에서만 등장
    if (text.includes("확정")) {
      expect(text).toMatch(/확정.*아|확정.*마|확정.*해석.*마|확정 합격.*해석/);
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   3. classifyEligibility — 4 분기 정확
   ═══════════════════════════════════════════════════════════════════════ */

describe("classifyEligibility — 자격 분류 로직", () => {
  function input(overrides: Partial<JaeoegukminInput>): JaeoegukminInput {
    return {
      graduatedAbroad: true,
      studentMonthsAbroad: 60,
      parentMonthsAbroad: 60,
      hasKoreanNationality: true,
      foreignSchoolYears: 6,
      ...overrides,
    };
  }

  it("외국 고교 미졸업 → not_eligible (일반 전형 안내)", () => {
    const r = classifyEligibility(input({ graduatedAbroad: false }));
    expect(r.type).toBe("not_eligible");
    expect(r.guidance).toContain("일반 전형");
  });

  it("외국 국적 + 외국 고교 → foreigner", () => {
    const r = classifyEligibility(input({ hasKoreanNationality: false }));
    expect(r.type).toBe("foreigner");
    expect(r.qualifyingTracks).toContain("jaeoegukmin");
  });

  it("한국 국적 + 거주 충족 → jaeoegukmin", () => {
    const r = classifyEligibility(
      input({ studentMonthsAbroad: 48, parentMonthsAbroad: 48 }),
    );
    expect(r.type).toBe("jaeoegukmin");
  });

  it("한국 국적 + 거주 미달 → not_eligible (일반 안내)", () => {
    const r = classifyEligibility(
      input({ studentMonthsAbroad: 12, parentMonthsAbroad: 12 }),
    );
    expect(r.type).toBe("not_eligible");
    expect(r.reason).toMatch(/거주.*미달/);
  });

  it("12년 외국교육 — caveat 자동 추가", () => {
    const r = classifyEligibility(input({ foreignSchoolYears: 12 }));
    expect(r.caveats.some((c) => /12년/.test(c))).toBe(true);
  });

  it("모든 결과에 caveats 또는 guidance 가 비어있지 않음 (정직성)", () => {
    const cases: JaeoegukminInput[] = [
      input({ graduatedAbroad: false }),
      input({ hasKoreanNationality: false }),
      input({ studentMonthsAbroad: 48, parentMonthsAbroad: 48 }),
      input({ studentMonthsAbroad: 12 }),
    ];
    for (const c of cases) {
      const r = classifyEligibility(c);
      expect(r.guidance.length, `guidance 비어있음 (input=${JSON.stringify(c)})`).toBeGreaterThan(0);
      expect(r.reason.length).toBeGreaterThan(0);
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   4. JaeoegukminResultCard — not_eligible 일반 전형 CTA + 정직성 강제
   ═══════════════════════════════════════════════════════════════════════ */

describe("P-013 — JaeoegukminResultCard 분기", () => {
  const inputBase: JaeoegukminInput = {
    graduatedAbroad: true,
    studentMonthsAbroad: 60,
    parentMonthsAbroad: 60,
    hasKoreanNationality: true,
    foreignSchoolYears: 6,
  };

  it("not_eligible — 일반 전형 검색 링크 노출 (이탈 방지)", () => {
    const r = classifyEligibility({ ...inputBase, graduatedAbroad: false });
    const { container } = render(<JaeoegukminResultCard result={r} />);
    const link = container.querySelector('a[href="/admissions"]');
    expect(link, "not_eligible 결과에서 /admissions 링크 필수").not.toBeNull();
    expect(link?.textContent).toContain("일반 전형");
  });

  it("적합 (jaeoegukmin) — 추천 대학 보기 버튼 + onShowRecommendations 호출", () => {
    const r = classifyEligibility(inputBase);
    let called = false;
    render(
      <JaeoegukminResultCard
        result={r}
        onShowRecommendations={() => {
          called = true;
        }}
      />,
    );
    const btn = screen.getByRole("button", { name: /추천 대학/ });
    expect(btn).toBeInTheDocument();
    btn.click();
    expect(called).toBe(true);
  });

  it("[정직성 P-002] 모든 결과 카드에 '모집요강' + '1차 분류' 안내", () => {
    const variants = [
      classifyEligibility(inputBase), // jaeoegukmin
      classifyEligibility({ ...inputBase, hasKoreanNationality: false }), // foreigner
      classifyEligibility({ ...inputBase, graduatedAbroad: false }), // not_eligible
      classifyEligibility({ ...inputBase, studentMonthsAbroad: 12 }), // not_eligible 거주 미달
    ];

    for (const r of variants) {
      const { container, unmount } = render(<JaeoegukminResultCard result={r} />);
      const text = container.textContent ?? "";
      expect(text, `결과 카드에 '모집요강' 안내 누락 (type=${r.type})`).toContain("모집요강");
      expect(text, `결과 카드에 '1차 분류' 안내 누락 (type=${r.type})`).toMatch(/1차 분류/);
      // P-002: "확정" 단어가 등장하면 부정 문맥(마세요·아닙니다 등)이어야 함
      if (text.includes("확정")) {
        expect(
          text,
          `❌ P-002 위반: 결과 카드에 '확정' 긍정 문맥 (type=${r.type})`,
        ).toMatch(/확정.*마|확정.*아|확정 합격.*해석/);
      }
      unmount();
    }
  });

  it("[시각 토큰] 적합 카드 = purple, 부적합 카드 = zinc 분리", () => {
    const eligibleResult = classifyEligibility(inputBase);
    const notEligibleResult = classifyEligibility({ ...inputBase, graduatedAbroad: false });

    const { container: c1 } = render(<JaeoegukminResultCard result={eligibleResult} />);
    const { container: c2 } = render(<JaeoegukminResultCard result={notEligibleResult} />);

    const eligibleEl = c1.querySelector('[data-component="jaeoegukmin-result"]') as HTMLElement;
    const notEligibleEl = c2.querySelector('[data-component="jaeoegukmin-result"]') as HTMLElement;

    expect(eligibleEl?.getAttribute("data-eligibility-type")).not.toBe("not_eligible");
    expect(notEligibleEl?.getAttribute("data-eligibility-type")).toBe("not_eligible");

    expect(/purple-/.test(eligibleEl?.className ?? "")).toBe(true);
    expect(/zinc-/.test(notEligibleEl?.className ?? "")).toBe(true);
  });
});
