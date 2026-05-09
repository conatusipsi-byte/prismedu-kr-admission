/**
 * pdf-text — hasReadableKorean 회귀
 *
 * 외부 바이너리 호출 (pdftotext)은 단위 테스트하지 않음 — 환경 의존성.
 * pure 함수 hasReadableKorean만 검증.
 */

import { describe, it, expect } from "vitest";
import { hasReadableKorean } from "../pdf-text";

describe("hasReadableKorean — 한국어 추출 검증 게이트", () => {
  it("빈 문자열 → false", () => {
    expect(hasReadableKorean("")).toBe(false);
  });

  it("순수 영어 → false", () => {
    expect(hasReadableKorean("This is a normal English text only.")).toBe(false);
  });

  it("한국어 100자 이상 → true (절대 카운트)", () => {
    const text = "한국어 텍스트가 충분히 길게 등장하면 한국어 글자 비율과 무관하게 의미 있는 추출로 간주합니다. 모집요강 본문은 보통 수백 자에 달합니다.".repeat(2);
    expect(hasReadableKorean(text)).toBe(true);
  });

  it("한국어 비율 5%+ → true (짧은 텍스트)", () => {
    const text = "test 안녕"; // 한국어 2/9 ≈ 22%
    expect(hasReadableKorean(text)).toBe(true);
  });

  it("한국어 비율 5% 미만 → false (영어 위주)", () => {
    const text = "a".repeat(1000) + "안녕";
    expect(hasReadableKorean(text)).toBe(false);
  });

  it("cid 깨짐 (한국어 없음) → false", () => {
    const text = "................"; // pdftotext가 폰트 매핑 실패 시
    expect(hasReadableKorean(text)).toBe(false);
  });
});
