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

const {
  extractDepartmentNames,
  extractTrackKinds,
  extractCsatMinimum,
  extractReflectionRatio,
  detectInvestigationRule,
  isValidReflectionRatio,
} = __test__;

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
   수능최저 — 실제 2026 모집요강 PDF 채굴 변형 (Pattern A/B/C 회귀 가드)
   ═══════════════════════════════════════════════════════════════════════ */

describe("수능최저 — 풀네임 변형 (Pattern A·B·C)", () => {
  it("Pattern A 메인형: '국어, 수학, 영어, 탐구 4개 영역 중 3개 영역 등급의 합이 7 이내' (고대 수시)", () => {
    const text = "국어, 수학, 영어, 탐구 4개 영역 중 3개 영역 등급의 합이 7 이내";
    const r = extractCsatMinimum(text, "trusted");
    expect(r).toBeDefined();
    expect(r!.requiredCount).toBe(3);
    expect(r!.sumGradeMax).toBe(7);
  });

  it("Pattern A 전체영역(M 미명시): '국어, 수학, 영어, 탐구 4개 영역 등급의 합이 5 이내' → requiredCount=4 기본", () => {
    const text = "국어, 수학, 영어, 탐구 4개 영역 등급의 합이 5 이내";
    const r = extractCsatMinimum(text, "trusted");
    expect(r).toBeDefined();
    expect(r!.requiredCount).toBe(4);
    expect(r!.sumGradeMax).toBe(5);
  });

  it("Pattern A 탐구 한정자: '탐구(상위 1과목) 4개 영역 등급의 합이 8 이내' (고대 정시)", () => {
    const text = "국어, 수학, 영어, 탐구(상위 1과목) 4개 영역 등급의 합이 8 이내";
    const r = extractCsatMinimum(text, "trusted");
    expect(r).toBeDefined();
    expect(r!.requiredCount).toBe(4);
    expect(r!.sumGradeMax).toBe(8);
  });

  it("Pattern B 괄호 앞: '4개 영역(국어, 수학, 영어, 탐구) 중 3개 영역 등급 합이 7등급 이내' (대교협 통합)", () => {
    const text = "전 모집단위 4개 영역(국어, 수학, 영어, 탐구) 중 3개 영역 등급 합이 7등급 이내";
    const r = extractCsatMinimum(text, "trusted");
    expect(r).toBeDefined();
    expect(r!.requiredCount).toBe(3);
    expect(r!.sumGradeMax).toBe(7);
  });

  it("Pattern C 단일 영역: '중 1개 영역 등급이 3 이내' + 한국사 (한외대 글로벌)", () => {
    const text = "국어, 수학, 영어, 탐구(사회 혹은 과학탐구 1과목) 중 1개 영역 등급이 3 이내이고, 한국사 영역 4등급 이내";
    const r = extractCsatMinimum(text, "trusted");
    expect(r).toBeDefined();
    expect(r!.requiredCount).toBe(1);
    expect(r!.sumGradeMax).toBe(3);
    expect(r!.historyGradeMax).toBe(4);
  });

  it("한국사 자격 — 본 패턴 뒤 별도 문장으로 등장해도 인근 ±200자 컨텍스트로 인식", () => {
    const text = "국어, 수학, 영어, 탐구 4개 영역 중 3개 영역 등급의 합이 7 이내 (의과대학 제외) 및 한국사 4등급 이내";
    const r = extractCsatMinimum(text, "trusted");
    expect(r?.historyGradeMax).toBe(4);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   반영비율 — 표 행 패턴 + 합 100 ± 5 검증
   ═══════════════════════════════════════════════════════════════════════ */

describe("반영비율 추출", () => {
  it("표 행 형식: '30%  30%  20%  20%  100%' 추출 (정시 모집요강)", () => {
    const text = "30%     30%           20%      20%         100%";
    const r = extractReflectionRatio(text, "trusted");
    expect(r).toBeDefined();
    expect(r!.korean).toBe(30);
    expect(r!.math).toBe(30);
    expect(r!.english).toBe(20);
    expect(r!.investigation).toBe(20);
  });

  it("인라인: '국어 30%, 수학 35%, 영어 15%, 탐구 20%'", () => {
    const text = "국어 30%, 수학 35%, 영어 15%, 탐구 20%";
    const r = extractReflectionRatio(text, "trusted");
    expect(r).toBeDefined();
    expect(r!.korean).toBe(30);
    expect(r!.math).toBe(35);
    expect(r!.english).toBe(15);
    expect(r!.investigation).toBe(20);
  });

  it("합이 100 ± 5 벗어남 → 거부 (false positive 차단)", () => {
    // 50+50+50+50=200, 잘못 잡힐 위험 있는 표 행
    const text = "50%     50%           50%      50%         100%";
    const r = extractReflectionRatio(text, "trusted");
    expect(r).toBeUndefined();
  });

  it("각 값이 5~60 범위 벗어남 → 거부", () => {
    // 가산점 표 등에서 등장 가능한 비정상 값
    const text = "5%     5%           5%      85%         100%";
    expect(isValidReflectionRatio({ korean: 5, math: 5, english: 5, investigation: 85 })).toBe(false);
    const r = extractReflectionRatio(text, "trusted");
    expect(r).toBeUndefined();
  });

  it("isValidReflectionRatio — 정상 케이스 (합 100, 각 값 20~40)", () => {
    expect(isValidReflectionRatio({ korean: 30, math: 30, english: 20, investigation: 20 })).toBe(true);
  });

  it("isValidReflectionRatio — 한 값이 0% 거부 (영역별 반영비는 0 안 됨)", () => {
    expect(isValidReflectionRatio({ korean: 50, math: 50, english: 0, investigation: 0 })).toBe(false);
  });

  it("trustLevel='suspicious' 입력 → 그대로 전파", () => {
    const text = "30%     30%           20%      20%         100%";
    const r = extractReflectionRatio(text, "suspicious");
    expect(r?.trustLevel).toBe("suspicious");
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
