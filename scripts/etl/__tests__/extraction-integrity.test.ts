/**
 * 회귀 가드 (진단 P1-3): ETL 추출물 무결성 게이트.
 * - 체크섬/학년도 실패분은 적재 거부.
 * - 충남대 2026 케이스(sourceDocYear≠기대) 자동 차단.
 * - 고려대 재직자 ◉ 같은 "의도된 colTotal 불일치"는 차단하지 않고 경고만(오탐 방지).
 */
import { describe, it, expect } from "vitest";
import { checkExtractionIntegrity } from "../extraction-integrity";

const YEAR = 2027;

describe("checkExtractionIntegrity (P1-3 게이트)", () => {
  it("정상 추출 → ok (year 일치, 실패 없음)", () => {
    const r = checkExtractionIntegrity(
      { rowSumValidation: { failed: 0 }, colTotalValidation: [{ track: "a", match: true }] },
      { year: 2027 },
      YEAR,
    );
    expect(r.ok).toBe(true);
    expect(r.reasons).toHaveLength(0);
  });

  it("충남대 케이스: sourceDocYear=2026 → 거부 (자동 차단)", () => {
    const r = checkExtractionIntegrity(
      { sourceDocYear: 2026, rowSumValidation: { failed: 0 }, colTotalValidation: [{ track: "x", match: false }] },
      { year: 2027 },
      YEAR,
    );
    expect(r.ok).toBe(false);
    expect(r.reasons.some((x) => x.includes("sourceDocYear"))).toBe(true);
  });

  it("result.year 불일치 → 거부", () => {
    const r = checkExtractionIntegrity({}, { year: 2026 }, YEAR);
    expect(r.ok).toBe(false);
    expect(r.reasons.some((x) => x.includes("result.year"))).toBe(true);
  });

  it("checksumPassed=false → 거부", () => {
    const r = checkExtractionIntegrity({ checksumPassed: false }, { year: 2027 }, YEAR);
    expect(r.ok).toBe(false);
  });

  it("rowSum 실패 → 거부", () => {
    const r = checkExtractionIntegrity({ rowSumValidation: { failed: 3 } }, { year: 2027 }, YEAR);
    expect(r.ok).toBe(false);
    expect(r.reasons.some((x) => x.includes("rowSum"))).toBe(true);
  });

  it("고려대 재직자 케이스: colTotal match=false 만 → ok + 경고 (오탐 방지)", () => {
    const r = checkExtractionIntegrity(
      {
        rowSumValidation: { failed: 0 },
        colTotalValidation: [
          { track: "학교추천전형", match: true },
          { track: "재직자전형", match: false }, // ◉ 고정정원 아님 — 의도된 불일치
        ],
      },
      { year: 2027 },
      YEAR,
    );
    expect(r.ok).toBe(true);
    expect(r.warnings.length).toBeGreaterThanOrEqual(1);
    expect(r.warnings[0]).toContain("재직자전형");
  });

  it("checksumPassed=true → ok", () => {
    const r = checkExtractionIntegrity({ checksumPassed: true }, { year: 2027 }, YEAR);
    expect(r.ok).toBe(true);
  });

  it("meta/result 누락도 안전 (방어적)", () => {
    expect(checkExtractionIntegrity(undefined, undefined, YEAR).ok).toBe(true);
    expect(checkExtractionIntegrity(null, { year: 2027 }, YEAR).ok).toBe(true);
  });
});
