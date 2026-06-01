/**
 * quota-scope — 정원외/그룹 단위 전형 식별 회귀 테스트 (P-005 정직성)
 *
 * 검증:
 *   1. 정원내 일반(일반·지역균형·교과·종합·논술) → department (합격률 정상)
 *   2. specialType ≠ general (농어촌·기회균형·장애·재외국민·특성화고) → group
 *   3. 전형명 키워드 (재직자 등 specialType=general) → group
 *   4. notes 의 "정원외" 문구 → group
 *   5. 명시 quotaScope 최우선
 */
import { describe, it, expect } from "vitest";
import {
  classifyQuotaScope,
  isQuotaExternal,
  buildQuotaExternalProbability,
} from "@/lib/admission/quota-scope";
import type { AdmissionTrack } from "@/types/admission";

function track(overrides: Partial<AdmissionTrack> = {}): AdmissionTrack {
  return {
    name: "일반전형",
    kind: "susi_subject",
    specialType: "general",
    quotaInitial: 30,
    stages: [{ step: 1, components: { schoolRecord: 100 } }],
    ...overrides,
  };
}

describe("classifyQuotaScope — 정원내 일반(department) 유지", () => {
  it.each([
    "일반전형",
    "지역균형전형",
    "학생부교과전형",
    "학업우수전형",
    "논술전형",
    "네오르네상스전형",
    "활동우수형",
    "잠재능력우수자서류전형",
    "지역인재 특별전형", // 지역인재는 정원내 — group 아님
  ])("'%s' → department", (name) => {
    expect(classifyQuotaScope(track({ name }))).toBe("department");
    expect(isQuotaExternal(track({ name }))).toBe(false);
  });
});

describe("classifyQuotaScope — specialType ≠ general → group", () => {
  it.each([
    ["agricultural", "농어촌학생전형"],
    ["low_income", "기회균형전형"],
    ["low_income", "장애인 등 대상자전형"],
    ["overseas", "재외국민전형"],
    ["etc", "특성화고교졸업자전형"],
  ] as const)("specialType=%s (%s) → group", (specialType, name) => {
    const t = track({ name, specialType });
    expect(classifyQuotaScope(t)).toBe("group");
    expect(isQuotaExternal(t)).toBe(true);
  });
});

describe("classifyQuotaScope — 전형명 키워드 (specialType=general 보강)", () => {
  it.each([
    "특성화고 등을 졸업한 재직자전형", // 재직자: detectSpecialType→general 이라 키워드로 잡아야 함
    "고른기회전형",
    "만학도 특별전형",
    "서해5도 학생 특별전형",
    "기초생활수급자 및 차상위계층 특별전형",
  ])("'%s' (specialType=general) → group", (name) => {
    const t = track({ name, specialType: "general" });
    expect(classifyQuotaScope(t)).toBe("group");
  });
});

describe("classifyQuotaScope — notes '정원외' + 명시 override", () => {
  it("notes 에 '정원외' 문구 → group", () => {
    const t = track({ name: "어떤전형", specialType: "general", notes: "정원외. 계열 단위 통합 선발." });
    expect(classifyQuotaScope(t)).toBe("group");
  });

  it("명시 quotaScope='university' 최우선 (specialType=general 이어도)", () => {
    const t = track({ name: "통합선발", specialType: "general", quotaScope: "university" });
    expect(classifyQuotaScope(t)).toBe("university");
    expect(isQuotaExternal(t)).toBe(true);
  });

  it("명시 quotaScope='department' 는 키워드보다 우선 (수동 교정 케이스)", () => {
    // 이름에 '재직자' 가 있어도 명시 department 면 정원내로 취급
    const t = track({ name: "재직자전형", quotaScope: "department" });
    expect(classifyQuotaScope(t)).toBe("department");
    expect(isQuotaExternal(t)).toBe(false);
  });
});

describe("buildQuotaExternalProbability", () => {
  it("category=quota_external, probability=null, sampleSufficient=false", () => {
    const p = buildQuotaExternalProbability();
    expect(p.category).toBe("quota_external");
    expect(p.probability).toBeNull();
    expect(p.low).toBeNull();
    expect(p.high).toBeNull();
    expect(p.sampleSufficient).toBe(false);
  });
});
