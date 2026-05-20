/**
 * KCUE / 대학알리미 (academyinfo.go.kr) OpenAPI 클라이언트
 *
 * 5종 service 엔드포인트 호출 + 페이지네이션 + 재시도 + 일일 호출량 제한.
 *
 * 채택 결정 (2026-05-20 probe 결과):
 *   - HTTPS 가 SNI 단계에서 서비스키를 거부 → **HTTP 전용**. cleartext 이지만
 *     서비스키는 read-only 공시 데이터 접근용이고 URL 에 노출되는 형태가 표준.
 *   - 응답 envelope 은 `<response><header>{resultCode,resultMsg}</header>
 *     <body>{items,numOfRows,pageNo,totalCount}</body></response>`.
 *   - 일부 op 는 `SERVICE ACCESS DENIED ERROR` 반환 — 사용자 키가 dataset 단위
 *     로 권한 분리되어 있어, 호출 가능 op 를 호출자가 명시.
 *
 * 비용 / 한도:
 *   - data.go.kr 운영 키 기본 한도: **10,000 호출/일** (개발 1,000/일).
 *   - 본 모듈은 메모리 카운터로 호출 누계를 추적하고 임계 초과 시 throw.
 *     daemon/스케줄러로 일자별 리셋이 필요한 경우 호출 측에서 newClient() 재생성.
 *
 * 재시도 정책:
 *   - 5xx HTTP → exponential backoff 3 회 (250·750·2250ms).
 *   - 응답 resultCode `04`(HTTP_ERROR), `05`(SERVICE_TIMEOUT) → 재시도.
 *   - 그 외 에러 코드 (20·22·30·31 등 정책성) → 즉시 throw.
 *
 * 정직성 (P-002):
 *   - envelope 검증 실패한 응답은 staging 적재 금지 신호로 throw.
 *   - 호출자가 결과를 `trustLevel: 'trusted'` 로 그대로 사용 가능.
 */

import {
  KcueServiceError,
  parseIndicator,
  parsePubYear,
  parseRegionCode,
  parseSchoolMajor,
  type KcueIndicatorRaw,
  type KcueParsedResponse,
  type KcuePubYear,
  type KcueRegionCode,
  type KcueSchoolMajor,
} from "../../scripts/etl/parsers/kcue-xml";

/* ═══════════════════════════════════════════════════════════════════════
   설정
   ═══════════════════════════════════════════════════════════════════════ */

const BASE_URL = "http://openapi.academyinfo.go.kr/openapi/service/rest";

/** data.go.kr 기본 일일 한도 (운영 키). 개발 키는 1,000. */
const DEFAULT_DAILY_LIMIT = 10_000;

const DEFAULT_TIMEOUT_MS = 15_000;

const RETRY_DELAYS_MS = [250, 750, 2250] as const;

/** retry 대상 resultCode (envelope 안 정책성) */
const RETRYABLE_RESULT_CODES = new Set(["04", "05"]);

/* ═══════════════════════════════════════════════════════════════════════
   환경변수 로딩 — 서비스별 키 + 통합 키 둘 다 지원
   ═══════════════════════════════════════════════════════════════════════ */

type KcueServiceName =
  | "BasicInformationService"
  | "SchoolMajorInfoService"
  | "StudentService"
  | "FinancesService"
  | "EducationResearchService";

const SERVICE_KEY_ENV: Record<KcueServiceName, string> = {
  BasicInformationService: "KCUE_API_KEY_BASIC_INFO",
  SchoolMajorInfoService: "KCUE_API_KEY_DEPARTMENTS",
  StudentService: "KCUE_API_KEY_STUDENT_STATUS",
  FinancesService: "KCUE_API_KEY_FINANCE",
  EducationResearchService: "KCUE_API_KEY_FACULTY",
};

/**
 * 키 우선순위: 서비스별 env → 공통 KCUE_API_KEY → throw.
 * 5종 모두 같은 키를 발급받는 경우 (대부분의 운영 시나리오) KCUE_API_KEY 하나만 두면 된다.
 */
function resolveKey(service: KcueServiceName): string {
  const specific = process.env[SERVICE_KEY_ENV[service]];
  const fallback = process.env.KCUE_API_KEY;
  const key = specific ?? fallback;
  if (!key) {
    throw new Error(
      `KCUE_API_KEY (또는 ${SERVICE_KEY_ENV[service]}) 미설정 — .env.local 확인`,
    );
  }
  return key;
}

/* ═══════════════════════════════════════════════════════════════════════
   호출량 카운터 — daily limit gate
   ═══════════════════════════════════════════════════════════════════════ */

export interface KcueRateLimitState {
  dailyLimit: number;
  callsToday: number;
  /** 이 client 인스턴스가 카운팅 시작한 시각 */
  startedAt: Date;
}

export class KcueRateLimitExceededError extends Error {
  constructor(public readonly state: KcueRateLimitState) {
    super(
      `KCUE daily limit ${state.dailyLimit} 초과 (현재 ${state.callsToday} 호출, ` +
        `시작 ${state.startedAt.toISOString()})`,
    );
    this.name = "KcueRateLimitExceededError";
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   Client
   ═══════════════════════════════════════════════════════════════════════ */

export interface KcueClientOptions {
  /** override daily limit — 개발 키는 1000, 운영 키는 10000 */
  dailyLimit?: number;
  /** override timeout */
  timeoutMs?: number;
  /** debug 콜백 (호출 로그 hook) */
  onCall?: (info: { url: string; status: number; elapsedMs: number }) => void;
}

export class KcueClient {
  private callsToday = 0;
  private readonly startedAt = new Date();
  private readonly dailyLimit: number;
  private readonly timeoutMs: number;
  private readonly onCall?: KcueClientOptions["onCall"];

  constructor(opts: KcueClientOptions = {}) {
    this.dailyLimit = opts.dailyLimit ?? DEFAULT_DAILY_LIMIT;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.onCall = opts.onCall;
  }

  getRateLimitState(): KcueRateLimitState {
    return {
      dailyLimit: this.dailyLimit,
      callsToday: this.callsToday,
      startedAt: this.startedAt,
    };
  }

  /* ─── 1. BasicInformationService ─────────────────────────────────── */

  async fetchPubYears(): Promise<KcueParsedResponse<KcuePubYear>> {
    const xml = await this.callRaw("BasicInformationService", "getComparisonPubYear", {});
    return parsePubYear(xml);
  }

  async fetchRegionCodes(): Promise<KcueParsedResponse<KcueRegionCode>> {
    const xml = await this.callRaw("BasicInformationService", "getCodeByRegion", {
      numOfRows: "20",
    });
    return parseRegionCode(xml);
  }

  /* ─── 2. SchoolMajorInfoService — 학과 정보 ───────────────────────── */

  /**
   * 단일 학교명·연도로 학과 리스트 조회. 총 학과 수가 numOfRows 보다 크면
   * pageNo 증가시켜 자동 재호출 (fetchAllPages=true).
   */
  async fetchSchoolMajors(args: {
    schoolKoreanName: string;
    surveyYear: number;
    numOfRows?: number;
    pageNo?: number;
    fetchAllPages?: boolean;
  }): Promise<KcueParsedResponse<KcueSchoolMajor>> {
    const numOfRows = args.numOfRows ?? 200;
    let pageNo = args.pageNo ?? 1;
    const aggregated: KcueSchoolMajor[] = [];
    let totalCount = 0;
    let invalidCount = 0;
    let trustLevel: KcueParsedResponse<KcueSchoolMajor>["trustLevel"] = "trusted";
    while (true) {
      const xml = await this.callRaw("SchoolMajorInfoService", "getSchoolMajorInfo", {
        svyYr: String(args.surveyYear),
        schlKrnNm: args.schoolKoreanName,
        numOfRows: String(numOfRows),
        pageNo: String(pageNo),
      });
      const page = parseSchoolMajor(xml);
      aggregated.push(...page.items);
      totalCount = page.totalCount;
      invalidCount += page.invalidCount;
      trustLevel = page.trustLevel;
      if (!args.fetchAllPages) break;
      if (aggregated.length >= page.totalCount) break;
      if (page.items.length === 0) break; // 방어 — 무한루프 차단
      pageNo += 1;
    }
    return {
      resultCode: "00",
      items: aggregated,
      numOfRows: aggregated.length,
      pageNo,
      totalCount,
      trustLevel,
      invalidCount,
    };
  }

  /* ─── 3·4·5. Indicator services (학생/재정/교원) ─────────────────── */

  /**
   * 학생/재정/교원 서비스 — 단일 op 단일 학교·연도 호출. indicator 값 1개 반환.
   *
   * @param service     'StudentService' | 'FinancesService' | 'EducationResearchService'
   * @param operation   각 service 에서 호출 가능한 op 이름
   *                    (예: getComparisonFreshmanChanceBalanceSelectionRatio)
   */
  async fetchIndicator(args: {
    service: "StudentService" | "FinancesService" | "EducationResearchService";
    operation: string;
    schlId: string;
    surveyYear: number;
  }): Promise<KcueParsedResponse<KcueIndicatorRaw>> {
    const xml = await this.callRaw(args.service, args.operation, {
      schlId: args.schlId,
      svyYr: String(args.surveyYear),
      numOfRows: "1",
    });
    return parseIndicator(xml, `${args.service}/${args.operation}`);
  }

  /* ─── 핵심 HTTP 호출 — 재시도 / 카운터 ─────────────────────────── */

  private async callRaw(
    service: KcueServiceName,
    operation: string,
    extraParams: Record<string, string>,
  ): Promise<string> {
    if (this.callsToday >= this.dailyLimit) {
      throw new KcueRateLimitExceededError(this.getRateLimitState());
    }

    const url = this.buildUrl(service, operation, extraParams);
    let lastErr: unknown;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
      const start = Date.now();
      try {
        this.callsToday += 1;
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
        const res = await fetch(url, { signal: ctrl.signal });
        clearTimeout(timer);
        const elapsed = Date.now() - start;
        this.onCall?.({ url, status: res.status, elapsedMs: elapsed });

        if (res.status >= 500 && res.status < 600) {
          lastErr = new Error(`HTTP ${res.status} (attempt ${attempt + 1})`);
          if (attempt < RETRY_DELAYS_MS.length) {
            await sleep(RETRY_DELAYS_MS[attempt]);
            continue;
          }
          throw lastErr;
        }
        if (!res.ok) {
          throw new Error(`HTTP ${res.status} ${res.statusText} — ${url}`);
        }

        const body = await res.text();
        // resultCode 만 빠르게 살펴 retry 대상이면 backoff
        const codeMatch = body.match(/<resultCode>(\w+)<\/resultCode>/);
        const code = codeMatch?.[1];
        if (code && RETRYABLE_RESULT_CODES.has(code)) {
          lastErr = new KcueServiceError(code, "Retryable service error", `${service}/${operation}`);
          if (attempt < RETRY_DELAYS_MS.length) {
            await sleep(RETRY_DELAYS_MS[attempt]);
            continue;
          }
          throw lastErr;
        }
        return body;
      } catch (e) {
        lastErr = e;
        if (
          attempt >= RETRY_DELAYS_MS.length ||
          (e instanceof KcueServiceError && !RETRYABLE_RESULT_CODES.has(e.resultCode))
        ) {
          throw e;
        }
        await sleep(RETRY_DELAYS_MS[attempt]);
      }
    }
    throw (lastErr as Error) ?? new Error("unreachable");
  }

  private buildUrl(
    service: KcueServiceName,
    operation: string,
    extraParams: Record<string, string>,
  ): string {
    const key = resolveKey(service);
    const params = new URLSearchParams({
      serviceKey: key,
      ...extraParams,
    });
    return `${BASE_URL}/${service}/${operation}?${params.toString()}`;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 단일 instance 가 필요한 경우의 헬퍼. 매번 호출 시 매번 새로 만들면 카운터가 리셋된다. */
let _defaultClient: KcueClient | null = null;
export function getDefaultKcueClient(opts?: KcueClientOptions): KcueClient {
  if (!_defaultClient) _defaultClient = new KcueClient(opts);
  return _defaultClient;
}
