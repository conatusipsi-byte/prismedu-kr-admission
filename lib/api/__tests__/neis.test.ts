/**
 * NEIS 클라이언트 회귀 테스트.
 *
 * 검증 대상:
 *   - 정상 응답 파싱 → NeisHighSchool[] 정규화
 *   - INFO-200 (데이터 없음) → 빈 배열
 *   - 스키마 불일치 → 빈 배열 + warn
 *   - HTTP 에러 → 빈 배열
 *   - 짧은 query (1자) → 즉시 빈 배열 (fetch 호출 X)
 *   - API key 미설정 → 빈 배열
 *   - 캐시 — 동일 query 재호출 시 fetch 0회
 *   - 비-고등학교 필터링
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchHighSchools, __clearNeisCache } from "../neis";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const successPayload = (rows: Array<Record<string, string>>) => ({
  schoolInfo: [
    { head: [{ list_total_count: rows.length }] },
    { row: rows },
  ],
});

beforeEach(() => {
  __clearNeisCache();
});

describe("searchHighSchools — NEIS API 클라이언트", () => {
  it("정상 응답을 NeisHighSchool 로 정규화", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        successPayload([
          {
            ATPT_OFCDC_SC_NM: "서울특별시교육청",
            SD_SCHUL_CODE: "B100000001",
            SCHUL_NM: "서울고등학교",
            SCHUL_KND_SC_NM: "고등학교",
            LCTN_SC_NM: "서울특별시",
            ORG_RDNMA: "서울특별시 서초구 효령로 76",
            ENG_SCHUL_NM: "Seoul High School",
          },
        ]),
      ),
    );

    const result = await searchHighSchools("서울고", {
      fetchImpl: fetchMock as unknown as typeof fetch,
      apiKey: "TESTKEY",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      {
        code: "B100000001",
        name: "서울고등학교",
        region: "서울특별시",
        office: "서울특별시교육청",
        kind: "고등학교",
        address: "서울특별시 서초구 효령로 76",
        nameEn: "Seoul High School",
      },
    ]);
  });

  it("URL 에 KEY/Type/SCHUL_KND_SC_NM=고등학교 파라미터 포함", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(successPayload([])));
    await searchHighSchools("서울", {
      fetchImpl: fetchMock as unknown as typeof fetch,
      apiKey: "MY_KEY",
    });
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("KEY=MY_KEY");
    expect(calledUrl).toContain("Type=json");
    expect(calledUrl).toContain("SCHUL_KND_SC_NM=%EA%B3%A0%EB%93%B1%ED%95%99%EA%B5%90"); // "고등학교"
  });

  it("INFO-200 (데이터 없음) → 빈 배열", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        RESULT: { CODE: "INFO-200", MESSAGE: "해당하는 데이터가 없습니다." },
      }),
    );
    const result = await searchHighSchools("없는학교명", {
      fetchImpl: fetchMock as unknown as typeof fetch,
      apiKey: "TESTKEY",
    });
    expect(result).toEqual([]);
  });

  it("HTTP 에러 → 빈 배열", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 500));
    const result = await searchHighSchools("어떤학교", {
      fetchImpl: fetchMock as unknown as typeof fetch,
      apiKey: "TESTKEY",
    });
    expect(result).toEqual([]);
  });

  it("스키마 불일치 → 빈 배열", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ unexpected: "shape" }));
    const result = await searchHighSchools("학교", {
      fetchImpl: fetchMock as unknown as typeof fetch,
      apiKey: "TESTKEY",
    });
    expect(result).toEqual([]);
  });

  it("query 가 2자 미만이면 fetch 호출 X, 빈 배열", async () => {
    const fetchMock = vi.fn();
    const result = await searchHighSchools("서", {
      fetchImpl: fetchMock as unknown as typeof fetch,
      apiKey: "TESTKEY",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it("API key 미설정 → 빈 배열, fetch 호출 X", async () => {
    const fetchMock = vi.fn();
    const result = await searchHighSchools("서울고", {
      fetchImpl: fetchMock as unknown as typeof fetch,
      apiKey: "",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it("캐시 — 동일 query 재호출 시 fetch 0회 (1회 호출 후 캐시 hit)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        successPayload([
          {
            ATPT_OFCDC_SC_NM: "경기도교육청",
            SD_SCHUL_CODE: "J100000099",
            SCHUL_NM: "분당고등학교",
            SCHUL_KND_SC_NM: "고등학교",
            LCTN_SC_NM: "경기도",
          },
        ]),
      ),
    );
    const a = await searchHighSchools("분당고", {
      fetchImpl: fetchMock as unknown as typeof fetch,
      apiKey: "K",
    });
    const b = await searchHighSchools("분당고", {
      fetchImpl: fetchMock as unknown as typeof fetch,
      apiKey: "K",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    expect(a[0]?.code).toBe("J100000099");
  });

  it("bypassCache=true → 캐시 무시하고 재호출", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(successPayload([])));
    await searchHighSchools("학교", {
      fetchImpl: fetchMock as unknown as typeof fetch,
      apiKey: "K",
    });
    await searchHighSchools("학교", {
      fetchImpl: fetchMock as unknown as typeof fetch,
      apiKey: "K",
      bypassCache: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("응답에 비-고등학교 row 가 섞이면 필터링", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        successPayload([
          {
            ATPT_OFCDC_SC_NM: "X",
            SD_SCHUL_CODE: "A1",
            SCHUL_NM: "서울중학교",
            SCHUL_KND_SC_NM: "중학교",
            LCTN_SC_NM: "서울특별시",
          },
          {
            ATPT_OFCDC_SC_NM: "X",
            SD_SCHUL_CODE: "A2",
            SCHUL_NM: "서울고등학교",
            SCHUL_KND_SC_NM: "고등학교",
            LCTN_SC_NM: "서울특별시",
          },
        ]),
      ),
    );
    const result = await searchHighSchools("서울", {
      fetchImpl: fetchMock as unknown as typeof fetch,
      apiKey: "K",
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.code).toBe("A2");
  });
});
