/**
 * KCUE / 대학알리미 XML 파서 회귀 — 5종 응답 + 에러 envelope.
 *
 * Fixtures (`__fixtures__/`) 는 2026-05-20 academyinfo.go.kr 실측 응답:
 *   fixture-01    BasicInformationService/getComparisonPubYear      (공시년도)
 *   fixture-01b   BasicInformationService/getCodeByRegion            (지역코드 17)
 *   fixture-02    SchoolMajorInfoService/getSchoolMajorInfo          (동국대 2025)
 *   fixture-03    StudentService/getComparisonFreshmanChance...      (지표값)
 *   fixture-04    FinancesService/getComparisonTuitionCrntSt          (지표값)
 *   fixture-05    EducationResearchService/getComparisonGypsy...     (지표값)
 *   fixture-90    SchoolInfoService — SERVICE ACCESS DENIED          (에러)
 */

import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

import {
  KcueEnvelopeError,
  KcueServiceError,
  normalizeDepartmentFromMajor,
  normalizeUniversityFromIndicators,
  parseIndicator,
  parsePubYear,
  parseRegionCode,
  parseSchoolMajor,
} from "../kcue-xml";

const FIXTURES = path.join(__dirname, "__fixtures__");
const load = (f: string): string => fs.readFileSync(path.join(FIXTURES, f), "utf8");

/* ═══════════════════════════════════════════════════════════════════════
   1. BasicInformationService
   ═══════════════════════════════════════════════════════════════════════ */

describe("BasicInformationService — envelope + items", () => {
  it("getComparisonPubYear → yearVal 리스트", () => {
    const res = parsePubYear(load("fixture-01-basicinfo-pubyear.xml"));
    expect(res.resultCode).toBe("00");
    expect(res.items.length).toBeGreaterThanOrEqual(1);
    expect(res.items.every((y) => Number.isInteger(y.yearVal))).toBe(true);
    expect(res.items.some((y) => y.yearVal === 2025)).toBe(true);
    expect(res.invalidCount).toBe(0);
    expect(res.trustLevel).toBe("trusted");
  });

  it("getCodeByRegion → 17개 지역코드 (cdid + cdnm)", () => {
    const res = parseRegionCode(load("fixture-01b-basicinfo-region.xml"));
    expect(res.resultCode).toBe("00");
    expect(res.items.length).toBeGreaterThanOrEqual(3);
    const seoul = res.items.find((r) => r.cdnm === "세종");
    expect(seoul).toBeDefined();
    expect(typeof seoul!.cdid).toBe("string");
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   2. SchoolMajorInfoService
   ═══════════════════════════════════════════════════════════════════════ */

describe("SchoolMajorInfoService — 학과 정보 + normalizer", () => {
  it("getSchoolMajorInfo → 필수 필드 파싱 (kediMjrId / korMjrNm / svyYr)", () => {
    const res = parseSchoolMajor(load("fixture-02-major.xml"));
    expect(res.resultCode).toBe("00");
    expect(res.items.length).toBeGreaterThanOrEqual(1);
    const first = res.items[0];
    expect(first.kediMjrId).toMatch(/^[A-Z0-9]+$/);
    expect(first.korMjrNm).toBeTruthy();
    expect(first.svyYr).toBe(2025);
    expect(first.schlNm).toBe("동국대학교");
  });

  it("normalizeDepartmentFromMajor — 폐과 → active=false, edcCrseLtrCtnt | split", () => {
    const res = parseSchoolMajor(load("fixture-02-major.xml"));
    const normalized = normalizeDepartmentFromMajor(res.items[0]);
    expect(normalized.kediMjrId).toBe(res.items[0].kediMjrId);
    expect(normalized.universityName).toBe("동국대학교");
    // fixture 첫 item 은 폐과 학과
    expect(normalized.active).toBe(false);
    expect(normalized.curriculum.length).toBeGreaterThan(5); // | split 결과
    expect(normalized.curriculum[0]).not.toContain("|");
    expect(normalized.careerPaths.length).toBeGreaterThan(0);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   3·4·5. Indicator services
   ═══════════════════════════════════════════════════════════════════════ */

describe("Indicator services — Student / Finances / EducationResearch", () => {
  it("Student/Freshman... → schlId + schlKrnNm + indctVal1", () => {
    const res = parseIndicator(
      load("fixture-03-student.xml"),
      "StudentService/getComparisonFreshmanChanceBalanceSelectionRatio",
    );
    expect(res.resultCode).toBe("00");
    expect(res.items[0].schlId).toBe("0000100");
    expect(res.items[0].schlKrnNm).toBe("동국대학교");
    expect(typeof res.items[0].indctVal1).toBe("number");
  });

  it("Finances/getComparisonTuitionCrntSt — 등록금 (won)", () => {
    const res = parseIndicator(load("fixture-04-finances.xml"), "FinancesService/getComparisonTuitionCrntSt");
    expect(res.items[0].indctVal1).toBeGreaterThan(1_000_000); // 등록금은 백만 단위
  });

  it("EducationResearch/Gypsy... — 비율 (percent)", () => {
    const res = parseIndicator(load("fixture-05-edures.xml"), "EducationResearchService/getComparisonGypsy");
    const v = res.items[0].indctVal1!;
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(100);
  });

  it("normalizeUniversityFromIndicators — schlId 기준 dedup map", () => {
    const res = parseIndicator(load("fixture-03-student.xml"), "test");
    const map = normalizeUniversityFromIndicators(res.items, "test");
    expect(map.size).toBe(1);
    expect(map.get("0000100")?.name).toBe("동국대학교");
    expect(map.get("0000100")?.kcueCode).toBe("0000100");
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   에러 envelope — SERVICE ACCESS DENIED
   ═══════════════════════════════════════════════════════════════════════ */

describe("에러 envelope — resultCode != 00 → KcueServiceError", () => {
  it("SERVICE ACCESS DENIED → KcueServiceError throw", () => {
    expect(() => parsePubYear(load("fixture-90-err-denied.xml"))).toThrow(KcueServiceError);
    try {
      parsePubYear(load("fixture-90-err-denied.xml"));
    } catch (e) {
      expect(e).toBeInstanceOf(KcueServiceError);
      if (e instanceof KcueServiceError) {
        expect(e.resultCode).toBe("99");
        expect(e.resultMsg).toContain("ACCESS DENIED");
      }
    }
  });

  it("부서진 XML → KcueEnvelopeError", () => {
    const broken = "<response><not-valid-here>";
    expect(() => parsePubYear(broken)).toThrow(KcueEnvelopeError);
  });

  it("envelope 만 있고 items 없으면 빈 배열 + invalidCount 0", () => {
    const empty = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><response><header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header><body><items/><numOfRows>0</numOfRows><pageNo>1</pageNo><totalCount>0</totalCount></body></response>`;
    const res = parsePubYear(empty);
    expect(res.items).toEqual([]);
    expect(res.invalidCount).toBe(0);
    expect(res.totalCount).toBe(0);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   멱등성 — 같은 fixture 두 번 파싱해도 동일 결과
   ═══════════════════════════════════════════════════════════════════════ */

describe("멱등성 — 동일 입력 → 동일 출력 (구조 비교)", () => {
  it("parseSchoolMajor 두 번 호출 → JSON 같음", () => {
    const xml = load("fixture-02-major.xml");
    const a = parseSchoolMajor(xml);
    const b = parseSchoolMajor(xml);
    expect(JSON.stringify(a.items)).toBe(JSON.stringify(b.items));
    expect(a.totalCount).toBe(b.totalCount);
  });
});
