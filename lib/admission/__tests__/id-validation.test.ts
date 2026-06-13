/**
 * isValidAdmissionId 회귀 (2026-06-13).
 *
 * 버그: ASCII-only 검증이 한글 department_id 를 막아 학과 상세가 빈 페이지(55개 학과).
 * 수정: 한글 음절(가-힣) 허용. ASCII 회귀 없음 + 필터 깨짐/injection 문자는 계속 불허.
 */

import { describe, it, expect } from "vitest";
import { isValidAdmissionId } from "../id-validation";

describe("isValidAdmissionId", () => {
  it("한글 department_id 통과 (버그 수정 핵심)", () => {
    expect(isValidAdmissionId("gap-미래토목건설공학과")).toBe(true);
    expect(isValidAdmissionId("gap-유럽어교육학부독어교육전공")).toBe(true);
    expect(isValidAdmissionId("gap-건축학부건축공학전공")).toBe(true);
  });

  it("ASCII id 회귀 없음", () => {
    expect(isValidAdmissionId("snu")).toBe(true);
    expect(isValidAdmissionId("kcue_0000003")).toBe(true);
    expect(isValidAdmissionId("u04040100012-ba-d")).toBe(true);
    expect(isValidAdmissionId("info-comp")).toBe(true);
  });

  it("PostgREST 필터/injection 위험 문자는 불허", () => {
    for (const bad of ["a.b", "a,b", "a)b", "a(b", "a'b", "a;b", "a b", "a/b", "a*b", "a=b"]) {
      expect(isValidAdmissionId(bad), bad).toBe(false);
    }
  });

  it("빈 문자열·길이 초과 불허", () => {
    expect(isValidAdmissionId("")).toBe(false);
    expect(isValidAdmissionId("a".repeat(51))).toBe(false);
    expect(isValidAdmissionId("가".repeat(51))).toBe(false);
    expect(isValidAdmissionId("가".repeat(17))).toBe(true);
  });
});
