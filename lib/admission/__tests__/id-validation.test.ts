/**
 * isValidAdmissionId 회귀 (2026-06-13).
 *
 * 버그: ASCII-only 검증이 한글 department_id 를 막아 학과 상세가 빈 페이지(55개 학과).
 * 수정: 한글 음절(가-힣) 허용. ASCII 회귀 없음 + 필터 깨짐/injection 문자는 계속 불허.
 */

import { describe, it, expect } from "vitest";
import { isValidAdmissionId, canonicalizeAdmissionId } from "../id-validation";

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

  it("NFD(자모 분해) 한글은 거부 — 호출부가 NFC 정규화해야 통과 (버그 2차 원인)", () => {
    const nfd = "gap-미래토목건설공학과".normalize("NFD");
    expect(isValidAdmissionId(nfd)).toBe(false); // 분해형 자모는 가-힣 아님 → 거부
    expect(isValidAdmissionId(nfd.normalize("NFC"))).toBe(true); // NFC 정규화 후 통과
  });

  it("빈 문자열·길이 초과 불허", () => {
    expect(isValidAdmissionId("")).toBe(false);
    expect(isValidAdmissionId("a".repeat(51))).toBe(false);
    expect(isValidAdmissionId("가".repeat(51))).toBe(false);
    expect(isValidAdmissionId("가".repeat(17))).toBe(true);
  });
});

describe("canonicalizeAdmissionId (decode + NFC) — 빈 페이지 버그 핵심 수정", () => {
  const NFC = "gap-미래토목건설공학과";

  it("percent-encoded(NFC) → 디코드 → 검증 통과 (Server Component param 실제 케이스)", () => {
    const encoded = encodeURIComponent(NFC); // "gap-%EB%AF%B8..."
    expect(encoded).toContain("%");
    expect(canonicalizeAdmissionId(encoded)).toBe(NFC);
    expect(isValidAdmissionId(canonicalizeAdmissionId(encoded))).toBe(true);
  });

  it("percent-encoded(NFD) → 디코드+NFC → 검증 통과", () => {
    const nfdEncoded = encodeURIComponent(NFC.normalize("NFD"));
    const canon = canonicalizeAdmissionId(nfdEncoded);
    expect(canon).toBe(NFC.normalize("NFC"));
    expect(isValidAdmissionId(canon)).toBe(true);
  });

  it("이미 디코드된 한글/ASCII → 변화 없음 (Route Handler·이중디코드 안전)", () => {
    expect(canonicalizeAdmissionId(NFC)).toBe(NFC);
    expect(canonicalizeAdmissionId("u02010200014-ba-d")).toBe("u02010200014-ba-d");
  });

  it("잘못된 % 시퀀스 → 원본 유지(throw 안 함) + 검증 거부", () => {
    expect(canonicalizeAdmissionId("a%zzb")).toBe("a%zzb");
    expect(isValidAdmissionId(canonicalizeAdmissionId("a%zzb"))).toBe(false);
  });
});
