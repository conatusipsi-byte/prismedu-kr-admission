/**
 * 회귀 가드 (P2 3-1): 학과명 정규화·매칭 엔진 + 별칭. load-admissions 의 DB 무변경
 * 부착 정합성을 좌우하는 핵심 로직이나 테스트 부재였음.
 */
import { describe, it, expect } from "vitest";
import { norm, buildMatcher, NAME_ALIAS, resolveDeptName, type DeptRow } from "../dept-matcher";

const D = (id: string, name: string, active = true): DeptRow => ({ id, name, active });

describe("norm (정규화)", () => {
  it("공백·장식기호·괄호 제거 + 소문자 + 로마자 통일", () => {
    expect(norm("국어 국문학과")).toBe("국어국문학과");
    expect(norm("의예과(자연계열)")).toBe("의예과자연계열");
    expect(norm("★컴퓨터·공학")).toBe("컴퓨터공학");
    expect(norm("물리학Ⅱ")).toBe("물리학ii");
  });
});

describe("buildMatcher", () => {
  const deps = [
    D("d-geo", "지리학과"),
    D("d-med", "의예과(자연계열)"),
    D("d-chem", "화학과"),
    D("d-theatre", "연극영화학과"),
  ];

  it("정확 일치 (정규화 후)", () => {
    const m = buildMatcher(deps)("지리학과");
    expect(m.id).toBe("d-geo");
    expect(m.how).toBe("exact");
  });

  it("접두 일치: 추출명이 DB명보다 김 (지리학과(인문) ⊃ 지리학과)", () => {
    const m = buildMatcher(deps)("지리학과(인문)");
    expect(m.id).toBe("d-geo");
    expect(m.how).toBe("contain");
  });

  it("접두 일치: 추출명이 DB명보다 짧음 (의예과 ⊂ 의예과(자연계열))", () => {
    const m = buildMatcher(deps)("의예과");
    expect(m.id).toBe("d-med");
    expect(m.how).toBe("contain");
  });

  it("중간 부분문자열은 매칭 안 함 (화학과 ⊄ 연극영화학과)", () => {
    // '화학과' 는 '연극영화학과' 의 접두가 아니므로 d-chem(정확)만 매칭, d-theatre 오탐 없음
    const m = buildMatcher([D("d-theatre", "연극영화학과")])("화학과");
    expect(m.id).toBeNull();
  });

  it("미존재 → null", () => {
    expect(buildMatcher(deps)("존재하지않는학과").id).toBeNull();
  });

  it("동일 정규화명 충돌 시 active 우선", () => {
    const dup = [D("old", "심리학과", false), D("new", "심리학과", true)];
    expect(buildMatcher(dup)("심리학과").id).toBe("new");
  });

  it("접두 후보 다수 → active 우선, 그다음 길이차 작은 순", () => {
    const cands = [
      D("inactive-long", "컴퓨터공학부(심화)", false),
      D("active-near", "컴퓨터공학부", true),
    ];
    expect(buildMatcher(cands)("컴퓨터공학부(첨단AI)").id).toBe("active-near");
  });
});

describe("NAME_ALIAS / resolveDeptName", () => {
  it("별칭 적용 — 추출명 → 기존 DB 정규명", () => {
    expect(resolveDeptName("snu", "건설환경도시공학부")).toBe("건설환경공학부");
    expect(resolveDeptName("pusan", "컴퓨터공학전공")).toBe("정보컴퓨터공학부 컴퓨터공학전공");
  });

  it("별칭 없는 학과/대학은 원본 그대로", () => {
    expect(resolveDeptName("snu", "국어국문학과")).toBe("국어국문학과");
    expect(resolveDeptName("unknown_univ", "아무학과")).toBe("아무학과");
  });

  it("NAME_ALIAS 는 well-formed (값 비어있지 않고, 자기참조 아님)", () => {
    for (const [, map] of Object.entries(NAME_ALIAS)) {
      for (const [from, to] of Object.entries(map)) {
        expect(to.trim().length).toBeGreaterThan(0);
        expect(from).not.toBe(to); // 의미 없는 자기참조 금지
      }
    }
  });

  it("통합: 별칭 적용 후 buildMatcher 가 기존 active 학과에 부착", () => {
    const deps = [D("u04020100023-ba-d", "건설환경공학부", true)];
    const match = buildMatcher(deps);
    const resolved = resolveDeptName("snu", "건설환경도시공학부");
    expect(match(resolved).id).toBe("u04020100023-ba-d");
  });
});
