/**
 * NEIS (교육행정정보시스템) 학교기본정보 API 클라이언트.
 *
 * 엔드포인트: https://open.neis.go.kr/hub/schoolInfo
 * 인증: 환경변수 NEIS_API_KEY (서버 전용 — 클라이언트 노출 X).
 *
 * 사용처: 가입 폼·분석 폼의 고등학교 자동완성.
 *
 * 정직성 (P-002):
 *   - 자동완성 결과는 NEIS 공공데이터임을 UI 에서 명시.
 *   - 응답 RESULT.CODE === "INFO-200" (데이터 없음) → 빈 배열 반환.
 *   - 네트워크/스키마 오류 → 빈 배열 + 콘솔 경고 (사용자에게 가짜 결과 X).
 *
 * 비용·한도:
 *   - NEIS 일일 호출 한도 (대략 5,000~10,000회 / 키 발급 정책 기준).
 *   - 메모리 캐시(TTL 30분) 로 동일 query 재호출 차단. 서버 인스턴스 단위.
 *   - 추후 트래픽 증가 시 Redis/Upstash 또는 Supabase ai_cache 로 이관.
 */

import { z } from "zod";

const NEIS_ENDPOINT = "https://open.neis.go.kr/hub/schoolInfo";

/** 페이지당 행 수. NEIS 최대 1,000 까지 — 자동완성엔 100 으로 충분. */
const PAGE_SIZE = 100;

/** 캐시 TTL — 30 분. NEIS 학교 마스터는 변동 거의 없음. */
const CACHE_TTL_MS = 30 * 60 * 1000;

/* ═══════════════════════════════════════════════════════════════════════
   응답 타입
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * 자동완성 UI 가 사용하는 정규화된 학교 정보.
 *
 * 한국 고등학교 모집 단위 — 도 단위 (LCTN_SC_NM) + 학교명이 사용자 식별 충분.
 */
export interface NeisHighSchool {
  /** NEIS 학교코드 (SD_SCHUL_CODE) — 7자리 영숫자. unique key. */
  code: string;
  /** 학교명 (SCHUL_NM) */
  name: string;
  /** 시·도 (LCTN_SC_NM, 예: "서울특별시", "경기도") */
  region: string;
  /** 시·도교육청 (ATPT_OFCDC_SC_NM, 예: "서울특별시교육청") */
  office: string;
  /** 학교 종류 (SCHUL_KND_SC_NM) — 본 함수는 항상 "고등학교" 만 반환 */
  kind: string;
  /** 도로명 주소 (ORG_RDNMA) — UI 에서 보조 정보로 노출 */
  address?: string;
  /** 영문 학교명 (ENG_SCHUL_NM) — 검색 보조 */
  nameEn?: string;
}

/* ═══════════════════════════════════════════════════════════════════════
   NEIS 응답 스키마 (zod)
   ═══════════════════════════════════════════════════════════════════════ */

const neisRowSchema = z.object({
  ATPT_OFCDC_SC_NM: z.string().optional().default(""),
  SD_SCHUL_CODE: z.string(),
  SCHUL_NM: z.string(),
  SCHUL_KND_SC_NM: z.string().optional().default(""),
  LCTN_SC_NM: z.string().optional().default(""),
  ORG_RDNMA: z.string().optional().default(""),
  ENG_SCHUL_NM: z.string().optional().default(""),
});

/** NEIS 의 RESULT 응답 (데이터 없음 / 에러 케이스) */
const neisResultEnvelope = z.object({
  RESULT: z.object({
    CODE: z.string(),
    MESSAGE: z.string().optional(),
  }),
});

/**
 * 정상 응답 envelope.
 *
 * NEIS 는 결과를 `schoolInfo: [{ head: [...] }, { row: [...] }]` 의 두-element
 * 배열로 돌려준다. 첫 항목은 메타, 두 번째 항목에 row 배열.
 */
const neisSuccessEnvelope = z.object({
  schoolInfo: z.array(z.unknown()).min(1),
});

/* ═══════════════════════════════════════════════════════════════════════
   캐시 (in-memory, per server instance)
   ═══════════════════════════════════════════════════════════════════════ */

interface CacheEntry {
  expiresAt: number;
  data: NeisHighSchool[];
}
const cache = new Map<string, CacheEntry>();

function cacheKey(query: string): string {
  return query.trim().toLowerCase().normalize("NFC");
}

function getCached(query: string): NeisHighSchool[] | undefined {
  const k = cacheKey(query);
  const e = cache.get(k);
  if (!e) return undefined;
  if (e.expiresAt < Date.now()) {
    cache.delete(k);
    return undefined;
  }
  return e.data;
}

function setCached(query: string, data: NeisHighSchool[]): void {
  cache.set(cacheKey(query), { expiresAt: Date.now() + CACHE_TTL_MS, data });
}

/** 테스트용 — 캐시 강제 비우기. */
export function __clearNeisCache(): void {
  cache.clear();
}

/* ═══════════════════════════════════════════════════════════════════════
   메인 — 검색 함수
   ═══════════════════════════════════════════════════════════════════════ */

export interface SearchHighSchoolsOptions {
  /** fetch 주입 (테스트용). 기본 globalThis.fetch. */
  fetchImpl?: typeof fetch;
  /** API key 주입 (테스트용). 기본 process.env.NEIS_API_KEY. */
  apiKey?: string;
  /** 캐시 우회 (강제 재조회) */
  bypassCache?: boolean;
}

/**
 * 학교명 부분일치 검색. 고등학교만 반환.
 *
 * @param query 검색어 (최소 2자, 빈/짧은 query 는 즉시 빈 배열)
 * @returns 학교 목록 (최대 100건)
 */
export async function searchHighSchools(
  query: string,
  opts: SearchHighSchoolsOptions = {},
): Promise<NeisHighSchool[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  if (!opts.bypassCache) {
    const cached = getCached(trimmed);
    if (cached) return cached;
  }

  const apiKey = opts.apiKey ?? process.env.NEIS_API_KEY;
  if (!apiKey) {
    console.warn("[neis] NEIS_API_KEY 미설정 — 빈 결과 반환");
    return [];
  }

  const fetchImpl = opts.fetchImpl ?? fetch;
  const url = buildSearchUrl(apiKey, trimmed);

  let raw: unknown;
  try {
    const res = await fetchImpl(url, {
      method: "GET",
      headers: {
        // NEIS 는 ETag 없음. Node 의 cache 옵션은 무의미하지만 명시.
        Accept: "application/json",
        // Vercel edge runtime의 기본 UA 가 일부 정부 API 에서 차단·500 응답 유발.
        // 일반 브라우저-like UA 로 명시.
        "User-Agent":
          "Mozilla/5.0 (compatible; Conatus/1.0; +https://conatusipsi.com)",
      },
    });
    if (!res.ok) {
      // 디버깅 — 500 응답 시 body 일부 노출 (Vercel logs 에서 확인)
      let bodySnippet = "";
      try {
        bodySnippet = (await res.text()).slice(0, 200);
      } catch {
        /* ignore */
      }
      console.warn(`[neis] HTTP ${res.status} (${bodySnippet}) — 빈 결과 반환`);
      return [];
    }
    raw = await res.json();
  } catch (e) {
    console.warn("[neis] fetch 실패:", e instanceof Error ? e.message : e);
    return [];
  }

  // INFO-200 = 데이터 없음. 다른 RESULT.CODE 는 에러.
  const errEnv = neisResultEnvelope.safeParse(raw);
  if (errEnv.success) {
    if (errEnv.data.RESULT.CODE !== "INFO-200") {
      console.warn(
        `[neis] API 에러 ${errEnv.data.RESULT.CODE}: ${errEnv.data.RESULT.MESSAGE ?? "(no message)"}`,
      );
    }
    // INFO-200 도 빈 배열로 처리
    const empty: NeisHighSchool[] = [];
    setCached(trimmed, empty);
    return empty;
  }

  const ok = neisSuccessEnvelope.safeParse(raw);
  if (!ok.success) {
    console.warn("[neis] 응답 스키마 불일치 — 빈 결과 반환");
    return [];
  }

  const rows = extractRows(ok.data.schoolInfo);
  const schools: NeisHighSchool[] = [];
  for (const r of rows) {
    const parsed = neisRowSchema.safeParse(r);
    if (!parsed.success) continue;
    const d = parsed.data;
    // SCHUL_KND_SC_NM 가 "고등학교" 가 아니면 제외 (방어적 — 요청 파라미터에 이미 필터링)
    if (d.SCHUL_KND_SC_NM && d.SCHUL_KND_SC_NM !== "고등학교") continue;
    schools.push({
      code: d.SD_SCHUL_CODE,
      name: d.SCHUL_NM,
      region: d.LCTN_SC_NM,
      office: d.ATPT_OFCDC_SC_NM,
      kind: d.SCHUL_KND_SC_NM || "고등학교",
      address: d.ORG_RDNMA || undefined,
      nameEn: d.ENG_SCHUL_NM || undefined,
    });
  }

  setCached(trimmed, schools);
  return schools;
}

/* ═══════════════════════════════════════════════════════════════════════
   내부 헬퍼
   ═══════════════════════════════════════════════════════════════════════ */

function buildSearchUrl(apiKey: string, query: string): string {
  const params = new URLSearchParams({
    KEY: apiKey,
    Type: "json",
    pIndex: "1",
    pSize: String(PAGE_SIZE),
    SCHUL_KND_SC_NM: "고등학교",
    SCHUL_NM: query,
  });
  return `${NEIS_ENDPOINT}?${params.toString()}`;
}

/**
 * NEIS 응답의 `schoolInfo` 배열 중 `row` 항목을 평탄화.
 * 응답 모양: `[{ head: [...] }, { row: [...rows] }]`.
 */
function extractRows(schoolInfo: unknown[]): unknown[] {
  const out: unknown[] = [];
  for (const block of schoolInfo) {
    if (block && typeof block === "object" && "row" in block) {
      const row = (block as { row: unknown }).row;
      if (Array.isArray(row)) out.push(...row);
      else if (row) out.push(row);
    }
  }
  return out;
}
