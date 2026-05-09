/**
 * normalizer — 한국 모집요강 텍스트 → 부분 구조 JSON 회귀
 *
 * 검증:
 *   1. 학과명 추출 + 노이즈 필터 (rawCount ≥ 3 → 포함, 1~2 → 제외)
 *   2. 트랙 종류 키워드 매핑 (학생부교과·종합·정시 가/나/다 등)
 *   3. 수능최저 패턴 ("국·수·영·탐 N개 합 X")
 *   4. 반영비율 패턴
 *   5. trustLevel 전파 (suspicious 입력 → suspicious 출력)
 *   6. unparsedSections 보존 (운영자 검수)
 */

import { describe, it, expect } from "vitest";
import { normalizeAdmissionText, __test__ } from "../normalizer";
import { combineTrustLevel } from "../types";

const { extractDepartmentNames, extractTrackKinds, extractCsatMinimum, detectInvestigationRule } = __test__;

/* ═══════════════════════════════════════════════════════════════════════
   학과명 추출 + 노이즈 필터
   ═══════════════════════════════════════════════════════════════════════ */

describe("학과명 추출 — 노이즈 필터 (rawCount ≥ 3)", () => {
  it("rawCount 3+ 학과만 포함", () => {
    // 단순 "○○과"는 false positive 회피로 패턴에서 제외 — "○○학과"·"○○학부"만 추출.
    const text = `
      컴퓨터공학과 모집요강
      컴퓨터공학과 정시 일반전형
      컴퓨터공학과 학생부종합
      기계공학과 일반전형
    `;
    const { departmentNames, rawCounts } = extractDepartmentNames(text, 3);
    expect(departmentNames).toContain("컴퓨터공학과");
    expect(departmentNames).not.toContain("기계공학과"); // rawCount 1
    expect(rawCounts["컴퓨터공학과"]).toBe(3);
    expect(rawCounts["기계공학과"]).toBe(1);
  });

  it("학부 / 학과 양쪽 패턴 모두 추출", () => {
    const text = `
      자유전공학부 안내
      자유전공학부 모집인원
      자유전공학부 입학 자격
    `;
    const { departmentNames } = extractDepartmentNames(text, 3);
    expect(departmentNames).toContain("자유전공학부");
  });

  it("DEPARTMENT_NAME_NOISE_TERMS 차단 (예: '추가합격')", () => {
    const text = `
      추가합격과 정시 추가합격과 수시 추가합격과
    `;
    const { departmentNames } = extractDepartmentNames(text, 3);
    expect(departmentNames).not.toContain("추가합격과");
  });

  it("rawCount desc 정렬", () => {
    const text = `
      경영학과 1
      경영학과 2
      경영학과 3
      경영학과 4
      컴퓨터공학과 1
      컴퓨터공학과 2
      컴퓨터공학과 3
    `;
    const { departmentNames } = extractDepartmentNames(text, 3);
    expect(departmentNames[0]).toBe("경영학과");
    expect(departmentNames[1]).toBe("컴퓨터공학과");
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   트랙 종류 추출
   ═══════════════════════════════════════════════════════════════════════ */

describe("트랙 종류 추출", () => {
  it("학생부교과 키워드 → susi_subject", () => {
    const result = extractTrackKinds("학생부교과 전형 모집요강");
    expect(result.find((c) => c.kind === "susi_subject")).toBeDefined();
  });

  it("학생부종합 / 학종 둘 다 → susi_comprehensive", () => {
    const r1 = extractTrackKinds("학생부종합전형");
    const r2 = extractTrackKinds("학종 일반전형");
    expect(r1.find((c) => c.kind === "susi_comprehensive")).toBeDefined();
    expect(r2.find((c) => c.kind === "susi_comprehensive")).toBeDefined();
  });

  it("정시 가/나/다군 분리", () => {
    const r1 = extractTrackKinds("정시 가군 모집");
    const r2 = extractTrackKinds("정시 나군 모집");
    const r3 = extractTrackKinds("정시 다군 모집");
    expect(r1[0]?.kind).toBe("jeongsi_ga");
    expect(r2[0]?.kind).toBe("jeongsi_na");
    expect(r3[0]?.kind).toBe("jeongsi_da");
  });

  it("재외국민·외국인 → jaeoegukmin (P-013)", () => {
    const result = extractTrackKinds("재외국민 특별전형");
    expect(result.find((c) => c.kind === "jaeoegukmin")).toBeDefined();
  });

  it("같은 kind 다중 키워드 — dedup (kind+keyword 단위)", () => {
    const result = extractTrackKinds("학생부종합 학종");
    // "학생부종합" + "학종" 둘 다 포함 → 2건 (kind 같지만 keyword 다름)
    const susiComp = result.filter((c) => c.kind === "susi_comprehensive");
    expect(susiComp.length).toBe(2);
  });

  it("keyword matchedAtOffset 정확", () => {
    const text = "abc 학생부교과 def";
    const result = extractTrackKinds(text);
    const c = result.find((r) => r.kind === "susi_subject");
    expect(c?.matchedAtOffset).toBe(text.indexOf("학생부교과"));
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   수능최저 패턴
   ═══════════════════════════════════════════════════════════════════════ */

describe("수능최저 추출", () => {
  it("'국·수·영·탐 4개 영역 등급의 합이 5 이내' 추출", () => {
    const text = "국·수·영·탐 4개 영역 등급의 합이 5 이내, 한국사 4등급 이내";
    const result = extractCsatMinimum(text, "trusted");
    expect(result).toBeDefined();
    expect(result!.requiredCount).toBe(4);
    expect(result!.sumGradeMax).toBe(5);
    expect(result!.historyGradeMax).toBe(4);
    expect(result!.candidateAreas).toEqual(["korean", "math", "english", "investigation"]);
  });

  it("'국·수·영·탐 중 2개 합 5' 추출", () => {
    const text = "국·수·영·탐 중 2개 합 5";
    const result = extractCsatMinimum(text, "trusted");
    expect(result).toBeDefined();
    expect(result!.requiredCount).toBe(2);
    expect(result!.sumGradeMax).toBe(5);
  });

  it("탐구 rule 감지 — '탐구(1)' → one", () => {
    expect(detectInvestigationRule("탐구(1) 한 과목")).toBe("one");
    expect(detectInvestigationRule("탐구(2평균)")).toBe("two_avg");
    expect(detectInvestigationRule("두 과목 모두 충족")).toBe("two_each");
    expect(detectInvestigationRule("일반 텍스트")).toBeUndefined();
  });

  it("trustLevel 입력 그대로 출력 (suspicious 격상 보장)", () => {
    const text = "국·수·영·탐 4개 영역 등급의 합이 5 이내";
    const result = extractCsatMinimum(text, "suspicious");
    expect(result?.trustLevel).toBe("suspicious");
  });

  it("패턴 미일치 → undefined (운영자 검수에 raw 텍스트 위임)", () => {
    const result = extractCsatMinimum("일반 텍스트", "trusted");
    expect(result).toBeUndefined();
  });

  it("requiredCount 범위 검증 — 0 또는 6+ 거부", () => {
    // "국·수·영·탐 중 0개 합 5" 같은 비현실 값
    const result = extractCsatMinimum("국·수·영·탐 중 0개 합 5", "trusted");
    expect(result).toBeUndefined();
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   normalizeAdmissionText — 통합
   ═══════════════════════════════════════════════════════════════════════ */

describe("normalizeAdmissionText — 통합", () => {
  it("trustLevel='trusted' 입력 → 출력 동일", () => {
    const result = normalizeAdmissionText("컴퓨터공학과", { inputTrustLevel: "trusted" });
    expect(result.trustLevel).toBe("trusted");
  });

  it("trustLevel='suspicious' 입력 → 모든 출력 suspicious 격상", () => {
    const text = "컴퓨터공학과 학생부종합 국·수·영·탐 4개 영역 등급의 합이 5 이내";
    const result = normalizeAdmissionText(text, { inputTrustLevel: "suspicious" });
    expect(result.trustLevel).toBe("suspicious");
    if (result.csatMinimumPartial) {
      expect(result.csatMinimumPartial.trustLevel).toBe("suspicious");
    }
  });

  it("unparsedSections — 200자 이상 단락만 보존", () => {
    const longParagraph = "가".repeat(250);
    const shortParagraph = "짧은 단락";
    const text = `${longParagraph}\n\n${shortParagraph}`;
    const result = normalizeAdmissionText(text, { inputTrustLevel: "trusted" });
    expect(result.unparsedSections).toContain(longParagraph);
    expect(result.unparsedSections.some((s) => s.includes(shortParagraph))).toBe(false);
  });

  it("rawCounts에 학과명 등장 횟수 누적", () => {
    const text = `
      경영학과 1
      경영학과 2
      경영학과 3
    `;
    const result = normalizeAdmissionText(text, { inputTrustLevel: "trusted" });
    expect(result.rawCounts["경영학과"]).toBeGreaterThanOrEqual(3);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   combineTrustLevel — 약한 고리 우선
   ═══════════════════════════════════════════════════════════════════════ */

describe("combineTrustLevel — 약한 고리 우선", () => {
  it("trusted + trusted → trusted", () => {
    expect(combineTrustLevel("trusted", "trusted")).toBe("trusted");
  });
  it("trusted + trusted-fallback → trusted-fallback", () => {
    expect(combineTrustLevel("trusted", "trusted-fallback")).toBe("trusted-fallback");
  });
  it("trusted + suspicious → suspicious", () => {
    expect(combineTrustLevel("trusted", "suspicious")).toBe("suspicious");
  });
  it("trusted-fallback + suspicious → suspicious", () => {
    expect(combineTrustLevel("trusted-fallback", "suspicious")).toBe("suspicious");
  });
  it("3개 인자 — 가장 약한 것", () => {
    expect(combineTrustLevel("trusted", "trusted-fallback", "suspicious")).toBe("suspicious");
  });
});
