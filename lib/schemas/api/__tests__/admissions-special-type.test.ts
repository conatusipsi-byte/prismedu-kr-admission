/**
 * AdmissionsSearchQuerySchema.specialType 파싱 회귀 (2026-06-13).
 *
 * - 유효 specialType(agricultural/low_income/etc)만 통과, 그 외(general/overseas/오타) 필터아웃.
 * - 전부 무효 또는 미입력 → undefined (필터 미적용 = 기존 동작).
 */

import { describe, it, expect } from "vitest";
import { AdmissionsSearchQuerySchema } from "../admissions";

function parse(specialType?: string) {
  const r = AdmissionsSearchQuerySchema.safeParse(specialType === undefined ? {} : { specialType });
  if (!r.success) throw new Error("parse failed");
  return r.data.specialType;
}

describe("AdmissionsSearchQuerySchema.specialType", () => {
  it("유효 값 다중 → 배열", () => {
    expect(parse("agricultural,etc")).toEqual(["agricultural", "etc"]);
    expect(parse("low_income")).toEqual(["low_income"]);
  });

  it("무효 값(general/overseas/오타)은 필터아웃", () => {
    expect(parse("agricultural,general,overseas,foobar")).toEqual(["agricultural"]);
  });

  it("전부 무효 → undefined", () => {
    expect(parse("general,overseas")).toBeUndefined();
    expect(parse("")).toBeUndefined();
  });

  it("미입력 → undefined (필터 미적용)", () => {
    expect(parse(undefined)).toBeUndefined();
  });
});
