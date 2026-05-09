/**
 * P-001 옵션 B + P-013 정책 — 컴포넌트 레벨 회귀 강제 검증
 *
 * 다음을 강제 보장:
 *   1. DepartmentCard 결제 키워드 0개 (P-001)
 *   2. 합격률·확률 미리보기 텍스트 0개 (P-001 — 카드에서 노출 절대 금지)
 *   3. 표본 부족 카드의 인터랙티브 요소(<a>, <button>) 0개 (대신 Link 자체는 OK — 모집요강 페이지 이동)
 *   4. 표본 충분 vs 부족 카드의 시각 토큰 분리 (data-sample-sufficient)
 *   5. AdmissionTrackBadge 의 jaeoegukmin 색상이 다른 6종과 다름 (P-013)
 *
 * 본 테스트가 깨지면 정책 위반 직결 — PR 머지 게이트.
 */

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { DepartmentCard } from "../DepartmentCard";
import { AdmissionTrackBadge } from "../AdmissionTrackBadge";
import type {
  AdmissionTrackKind,
  Department,
  University,
  Timestamp,
} from "@/types/admission";

const TS = { seconds: 0, nanoseconds: 0, toDate: () => new Date(), toMillis: () => 0 } as Timestamp;

const SNU: University = {
  id: "snu",
  n: "서울대학교",
  shortName: "서울대",
  category: "seoul_top",
  campuses: [
    { id: "main", name: "관악캠퍼스", address: "서울특별시 관악구", region: "seoul", isMain: true },
  ],
  active: true,
  updatedAt: TS,
};

const MED: Department = {
  id: "med",
  universityId: "snu",
  campusId: "main",
  name: "의예과",
  unitType: "department",
  track: "medical",
  totalQuota: 135,
  active: true,
  updatedAt: TS,
};

/** 카드의 결제·합격률 키워드 차단 강제 검증 */
const FORBIDDEN_KEYWORDS = [
  "업그레이드", "결제", "구독", "구매", "유료",
  "확률", "합격률", "예상 점수", "예상 합격",
];
const FORBIDDEN_PERCENT_PATTERN = /\d+\s*%/;

/* ═══════════════════════════════════════════════════════════════════════
   P-001 — DepartmentCard 정책
   ═══════════════════════════════════════════════════════════════════════ */

describe("DepartmentCard — P-001 옵션 B 정책", () => {
  it("표본 충족 카드: 결제 키워드 + 합격률 키워드 0개", () => {
    const { container } = render(
      <DepartmentCard
        department={MED}
        university={SNU}
        sampleSufficient={true}
        availableTracks={["jeongsi_na"]}
      />,
    );
    const text = container.textContent ?? "";

    for (const kw of FORBIDDEN_KEYWORDS) {
      expect(
        text,
        `❌ P-001 위반: 카드에 "${kw}" 키워드 등장. 카드는 정형 정보만.`,
      ).not.toContain(kw);
    }

    expect(
      FORBIDDEN_PERCENT_PATTERN.test(text),
      "❌ P-001 위반: 카드에 % 수치 등장. 합격률 미리보기 절대 금지.",
    ).toBe(false);
  });

  it("표본 부족 카드: 결제 키워드 + 합격률 키워드 0개 (락 아님 — 안내)", () => {
    const { container } = render(
      <DepartmentCard
        department={MED}
        university={SNU}
        sampleSufficient={false}
        availableTracks={["jeongsi_na"]}
      />,
    );
    const text = container.textContent ?? "";

    for (const kw of FORBIDDEN_KEYWORDS) {
      expect(text).not.toContain(kw);
    }
    expect(FORBIDDEN_PERCENT_PATTERN.test(text)).toBe(false);
  });

  it("표본 부족 카드: insufficient-notice 영역에 인터랙티브 요소 X", () => {
    const { container } = render(
      <DepartmentCard
        department={MED}
        university={SNU}
        sampleSufficient={false}
      />,
    );
    const notice = container.querySelector('[data-element="insufficient-notice"]');
    expect(notice).not.toBeNull();
    if (notice) {
      const interactive = notice.querySelectorAll("a, button");
      expect(
        interactive.length,
        "❌ P-001 위반: insufficient-notice 안에 결제 CTA 발견.",
      ).toBe(0);
    }
  });

  it("표본 충분 vs 부족 카드의 시각 토큰 분리 (data-sample-sufficient)", () => {
    const { container: sufficientC } = render(
      <DepartmentCard department={MED} university={SNU} sampleSufficient={true} />,
    );
    const { container: insufficientC } = render(
      <DepartmentCard department={MED} university={SNU} sampleSufficient={false} />,
    );

    const sufficientCard = sufficientC.querySelector('[data-component="department-card"]');
    const insufficientCard = insufficientC.querySelector('[data-component="department-card"]');

    expect(sufficientCard?.getAttribute("data-sample-sufficient")).toBe("true");
    expect(insufficientCard?.getAttribute("data-sample-sufficient")).toBe("false");

    // 표본 부족만 zinc(회색) 토큰, 충분은 mint hover 토큰
    const insufficientCardEl = insufficientC.querySelector(".border-dashed");
    expect(insufficientCardEl, "표본 부족 카드는 dashed border (시각 분리)").not.toBeNull();
    const sufficientDashed = sufficientC.querySelector(".border-dashed");
    expect(sufficientDashed, "표본 충분 카드는 dashed border 없음").toBeNull();
  });

  it("카드 자체는 학과 상세로 가는 단일 Link — 그 외 인터랙티브 요소 0개", () => {
    const { container } = render(
      <DepartmentCard department={MED} university={SNU} sampleSufficient={true} availableTracks={[]} />,
    );
    const links = container.querySelectorAll("a");
    const buttons = container.querySelectorAll("button");
    expect(links.length, "카드 = 1개 링크 (학과 상세)").toBe(1);
    expect(links[0].getAttribute("href")).toBe("/admissions/snu/med");
    expect(buttons.length, "카드에 button 0개").toBe(0);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   P-013 — AdmissionTrackBadge jaeoegukmin 시각 분리
   ═══════════════════════════════════════════════════════════════════════ */

describe("AdmissionTrackBadge — P-013 jaeoegukmin 시각 분리", () => {
  it("jaeoegukmin 색상 토큰이 다른 7종과 모두 다르다", () => {
    const otherKinds: AdmissionTrackKind[] = [
      "susi_subject", "susi_comprehensive", "susi_essay", "susi_practical",
      "jeongsi_ga", "jeongsi_na", "jeongsi_da",
    ];

    const { container: jaeContainer } = render(<AdmissionTrackBadge kind="jaeoegukmin" />);
    const jaeToken = jaeContainer
      .querySelector('[data-track-kind="jaeoegukmin"]')
      ?.getAttribute("data-color-token");
    expect(jaeToken, "jaeoegukmin 색상 토큰 정의 필수").toBeTruthy();

    for (const kind of otherKinds) {
      const { container: c, unmount } = render(<AdmissionTrackBadge kind={kind} />);
      const token = c.querySelector(`[data-track-kind="${kind}"]`)?.getAttribute("data-color-token");
      expect(
        token,
        `❌ P-013 위반: jaeoegukmin "${jaeToken}" == ${kind} "${token}" — 시각 충돌`,
      ).not.toBe(jaeToken);
      unmount();
    }
  });

  it("jaeoegukmin 라벨에 '재외국민' 또는 '외국인' 텍스트 포함", () => {
    const { container } = render(<AdmissionTrackBadge kind="jaeoegukmin" />);
    expect(container.textContent ?? "").toMatch(/재외국민|외국인/);
  });
});
