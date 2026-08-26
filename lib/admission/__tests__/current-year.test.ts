/**
 * 학년도 시한폭탄 회귀 (2026-08 이관 점검).
 *
 * 기존 `new Date().getFullYear() + 1` 은 **1월 1일에 롤오버** → 2027-01-01 부터
 * DB 에 없는 2028학년도를 조회 → 검색·추천·비교·플래너 전면 빈 결과.
 * 프로덕션 코드와 테스트가 같은 식을 공유해 자동 검출이 불가능했던 버그라,
 * 여기서는 **식을 미러링하지 않고 기대 학년도를 하드코딩**해 검증한다.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  getCurrentAdmissionYear,
  admissionSeasonYear,
  LATEST_LOADED_ADMISSION_YEAR,
} from "../current-year";

/** KST 기준 시각을 UTC Date 로. (서버는 UTC 라 경계 판정에 KST 환산이 필요) */
function kst(iso: string): Date {
  return new Date(`${iso}+09:00`);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("admissionSeasonYear — 3월 시즌 롤오버", () => {
  it("2026-08 (현재) → 2027학년도 — 기존 동작과 동일, 회귀 없음", () => {
    expect(admissionSeasonYear(kst("2026-08-26T12:00:00"))).toBe(2027);
  });

  it("★ 2027-01-15 → 2027학년도 (기존 식이면 2028 → 빈 결과)", () => {
    expect(admissionSeasonYear(kst("2027-01-15T00:00:00"))).toBe(2027);
  });

  it("★ 2027-01-01 00:00 KST (폭탄 시점) → 2027학년도", () => {
    expect(admissionSeasonYear(kst("2027-01-01T00:00:00"))).toBe(2027);
  });

  it("2027-02-28 → 아직 2027학년도 (정시 마무리 기간)", () => {
    expect(admissionSeasonYear(kst("2027-02-28T23:59:59"))).toBe(2027);
  });

  it("2027-03-01 → 2028학년도로 롤오버 (새 전형계획 시즌 시작)", () => {
    expect(admissionSeasonYear(kst("2027-03-01T00:00:00"))).toBe(2028);
  });

  it("UTC 서버에서도 KST 월 경계로 판정 — 2027-02-28 23:00 KST(=UTC 14:00) 는 2027", () => {
    // UTC 로 읽으면 2월 28일이라 결과는 같지만, 3월 1일 00:30 KST(=2/28 15:30 UTC)는 다르다.
    expect(admissionSeasonYear(kst("2027-02-28T23:00:00"))).toBe(2027);
    expect(admissionSeasonYear(kst("2027-03-01T00:30:00"))).toBe(2028);
  });
});

describe("getCurrentAdmissionYear — env 우선 + 적재 상한 클램프", () => {
  it("현재(2026-08) → 2027 — 프로덕션 무회귀", () => {
    expect(getCurrentAdmissionYear(kst("2026-08-26T12:00:00"))).toBe(2027);
  });

  it("★ 2027-01-15 시뮬레이션 → 2027 (빈 결과 폭탄 해소)", () => {
    expect(getCurrentAdmissionYear(kst("2027-01-15T09:00:00"))).toBe(2027);
  });

  it("★ 인자 없는 기본 경로도 2027-01-15 에 2027 반환 (fake timer)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(kst("2027-01-15T09:00:00"));
    expect(getCurrentAdmissionYear()).toBe(2027);
  });

  it("데이터 미적재 미래 학년도는 상한 클램프 — 2028-06 이어도 적재분까지만 조회", () => {
    // 빈 사이트(원인 불명)보다 직전 학년도 노출이 안전하다는 정책.
    expect(admissionSeasonYear(kst("2028-06-01T00:00:00"))).toBe(2029);
    expect(getCurrentAdmissionYear(kst("2028-06-01T00:00:00"))).toBe(
      LATEST_LOADED_ADMISSION_YEAR,
    );
  });

  it("NEXT_PUBLIC_ADMISSION_YEAR 가 시즌 계산·클램프보다 우선", () => {
    vi.stubEnv("NEXT_PUBLIC_ADMISSION_YEAR", "2028");
    expect(getCurrentAdmissionYear(kst("2026-08-26T12:00:00"))).toBe(2028);
    expect(getCurrentAdmissionYear(kst("2027-01-15T00:00:00"))).toBe(2028);
  });

  it("잘못된 env 값(빈값·비숫자·범위 밖)은 무시하고 폴백 — 오타로 사이트가 죽지 않는다", () => {
    for (const bad of ["", "   ", "abc", "0", "1999", "2101", "20x7"]) {
      vi.stubEnv("NEXT_PUBLIC_ADMISSION_YEAR", bad);
      expect(getCurrentAdmissionYear(kst("2027-01-15T00:00:00"))).toBe(2027);
    }
  });
});
