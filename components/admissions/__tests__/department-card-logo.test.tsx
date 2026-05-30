/**
 * DepartmentCard 로고 표시 — 클라이언트 요청 #1 (2026-05-30) 회귀.
 *
 * 검증:
 *   - university.logoUrl 있음 → <img> 노출 + monogram 미노출 + data-has-logo=true
 *   - university.logoUrl 없음 → monogram 노출 + <img> 미노출 + data-has-logo=false
 *   - 로고 alt 텍스트가 학교명 포함 (a11y)
 *
 * 데이터 의존:
 *   현재 logo_url DB 컬럼은 대부분 NULL — UI 만 준비. 로고 자산 수집은 별도 작업.
 *   본 테스트가 fallback 동작을 강제로 검증 → 데이터 부재 상황도 안전.
 */

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { DepartmentCard } from "../DepartmentCard";
import type { Department, University, Timestamp } from "@/types/admission";

const TS = { seconds: 0, nanoseconds: 0, toDate: () => new Date(), toMillis: () => 0 } as Timestamp;

const baseUniv: University = {
  id: "snu",
  n: "서울대학교",
  shortName: "서울대",
  category: "seoul",
  campuses: [
    { id: "main", name: "관악캠퍼스", address: "서울특별시 관악구", region: "seoul", isMain: true },
  ],
  active: true,
  updatedAt: TS,
};

const dept: Department = {
  id: "cs",
  universityId: "snu",
  campusId: "main",
  name: "컴퓨터공학부",
  unitType: "department",
  track: "engineering",
  totalQuota: 55,
  active: true,
  updatedAt: TS,
};

describe("DepartmentCard — university logo 표시 (#1)", () => {
  it("logoUrl 있음 → <img> 노출 + monogram 미노출 + data-has-logo=true", () => {
    const univ: University = {
      ...baseUniv,
      logoUrl: "https://cdn.example.com/snu-logo.png",
    };
    const { container } = render(
      <DepartmentCard
        department={dept}
        university={univ}
        sampleSufficient
        availableTracks={["jeongsi_na"]}
      />,
    );
    const brand = container.querySelector('[data-element="university-brand"]');
    expect(brand, "university-brand 노드 누락").not.toBeNull();
    expect(brand!.getAttribute("data-has-logo")).toBe("true");

    const img = brand!.querySelector("img");
    expect(img, "<img> 미렌더").not.toBeNull();
    expect(img!.getAttribute("src")).toBe("https://cdn.example.com/snu-logo.png");
    expect(img!.getAttribute("alt")).toContain("서울대");

    // monogram (한글 2자) 미노출 — 텍스트로 "서울" (monogram) 만 단독 존재하면 안 됨.
    // brand 컨테이너 내부에 span 내 "서울" 텍스트가 없어야 함.
    const monogramSpan = brand!.querySelector("span:not([data-element])");
    expect(monogramSpan?.textContent).not.toBe("서울");
  });

  it("logoUrl 없음 (undefined) → monogram 노출 + <img> 미노출 + data-has-logo=false", () => {
    // logoUrl 미지정 — 현재 DB 의 대부분 케이스
    const { container } = render(
      <DepartmentCard
        department={dept}
        university={baseUniv}
        sampleSufficient
        availableTracks={["jeongsi_na"]}
      />,
    );
    const brand = container.querySelector('[data-element="university-brand"]');
    expect(brand!.getAttribute("data-has-logo")).toBe("false");
    expect(brand!.querySelector("img")).toBeNull();
    // monogram "서울" 텍스트
    expect(brand!.textContent?.trim()).toBe("서울");
  });

  it("표본 부족 카드도 로고 분기 동일 — gray 스타일은 유지", () => {
    const univ: University = {
      ...baseUniv,
      logoUrl: "https://cdn.example.com/snu-logo.png",
    };
    const { container } = render(
      <DepartmentCard
        department={dept}
        university={univ}
        sampleSufficient={false}
      />,
    );
    const brand = container.querySelector('[data-element="university-brand"]');
    expect(brand!.getAttribute("data-has-logo")).toBe("true");
    expect(brand!.querySelector("img")).not.toBeNull();
    // 표본 부족 → ink-100 배경 클래스 적용 확인
    expect(brand!.className).toMatch(/bg-ink-100/);
  });
});
