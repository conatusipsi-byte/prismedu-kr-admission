/**
 * KCUE / 대학알리미 (academyinfo.go.kr) OpenAPI XML 파서
 *
 * data.go.kr 5종 데이터셋의 응답 XML 을 envelope 검증 + service별 Zod 스키마로
 * 파싱해 도메인 객체로 정규화한다.
 *
 *   1. BasicInformationService     — 공시년도·지역코드 등 메타
 *   2. SchoolMajorInfoService      — 대학별 학과 정보 (학과 마스터)
 *   3. StudentService              — 학생 현황 (지표값)
 *   4. FinancesService             — 재정 현황 (등록금 등 지표값)
 *   5. EducationResearchService    — 교원·연구 현황 (전임교원 비율 등 지표값)
 *
 * Envelope 공통 형식 (probed 2026-05-20):
 *   <response>
 *     <header>
 *       <resultCode>00</resultCode>            ← 00=성공, 그 외 에러
 *       <resultMsg>NORMAL SERVICE.</resultMsg>
 *     </header>
 *     <body>                                   ← 에러 시에는 없음
 *       <items><item>...</item></items>        ← 데이터 없으면 <items/>
 *       <numOfRows>10</numOfRows>
 *       <pageNo>1</pageNo>
 *       <totalCount>...</totalCount>
 *     </body>
 *   </response>
 *
 * 정직성 (P-002):
 *   - 응답 envelope 스키마 검증 실패 시 staging 적재 X → suspicious 격상.
 *   - 학생/재정/교원 응답은 단일 indicator 값을 반환 — 어떤 indctId 인지
 *     호출 측에서 명시해야 의미가 생긴다 (indctMeta 필드로 강제).
 *   - schoolMajor 의 schlMjrStatNm = "폐과" 인 항목은 active=false 마킹.
 */

import { XMLParser } from "fast-xml-parser";
import { z } from "zod";

import type { ParserTrustLevel } from "./types";

/* ═══════════════════════════════════════════════════════════════════════
   에러 / 결과 타입
   ═══════════════════════════════════════════════════════════════════════ */

export class KcueServiceError extends Error {
  constructor(
    public readonly resultCode: string,
    public readonly resultMsg: string,
    public readonly endpoint: string,
  ) {
    super(`[KCUE ${endpoint}] ${resultCode} ${resultMsg}`);
    this.name = "KcueServiceError";
  }
}

export class KcueEnvelopeError extends Error {
  constructor(message: string, public readonly endpoint: string) {
    super(`[KCUE ${endpoint}] envelope invalid: ${message}`);
    this.name = "KcueEnvelopeError";
  }
}

export interface KcueParsedResponse<T> {
  resultCode: "00";
  items: T[];
  numOfRows: number;
  pageNo: number;
  totalCount: number;
  /** 데이터 출처 신뢰도 — KCUE 직 API 는 항상 `trusted`. */
  trustLevel: ParserTrustLevel;
  /** 스키마 검증 실패한 item 개수 — 호출 측 staging 결정에 사용 */
  invalidCount: number;
}

/* ═══════════════════════════════════════════════════════════════════════
   Envelope 스키마 (성공)
   ═══════════════════════════════════════════════════════════════════════ */

const envelopeHeaderSchema = z.object({
  resultCode: z.union([z.string(), z.number()]).transform(String),
  resultMsg: z.string().optional().default(""),
});

/**
 * fast-xml-parser 는 `<items/>` 를 `{ items: "" }` 로, 단일 item 을 객체로,
 * 복수 item 을 배열로 — 일관성 없는 모양을 반환한다. coerce 단계에서 평탄화.
 */
const envelopeBodySchema = z
  .object({
    items: z.union([z.string(), z.object({}).passthrough(), z.array(z.any())]).optional(),
    numOfRows: z.coerce.number().int().nonnegative().optional().default(0),
    pageNo: z.coerce.number().int().positive().optional().default(1),
    totalCount: z.coerce.number().int().nonnegative().optional().default(0),
  })
  .transform((body) => {
    const raw = body.items;
    let items: unknown[] = [];
    if (raw && typeof raw === "object") {
      const item = (raw as { item?: unknown }).item;
      if (Array.isArray(item)) items = item;
      else if (item !== undefined && item !== null) items = [item];
    }
    return {
      items,
      numOfRows: body.numOfRows,
      pageNo: body.pageNo,
      totalCount: body.totalCount,
    };
  });

const envelopeSchema = z.object({
  response: z.object({
    header: envelopeHeaderSchema,
    body: envelopeBodySchema.optional(),
  }),
});

/* ═══════════════════════════════════════════════════════════════════════
   Service 1 — BasicInformationService
   ═══════════════════════════════════════════════════════════════════════ */

/** getComparisonPubYear — 공시년도 리스트 */
export const KcuePubYearSchema = z.object({
  yearVal: z.coerce.number().int(),
});
export type KcuePubYear = z.infer<typeof KcuePubYearSchema>;

/** getCodeByRegion — 지역코드 리스트 (17 개) */
export const KcueRegionCodeSchema = z.object({
  cdid: z.coerce.string(),
  cdnm: z.string(),
});
export type KcueRegionCode = z.infer<typeof KcueRegionCodeSchema>;

/* ═══════════════════════════════════════════════════════════════════════
   Service 2 — SchoolMajorInfoService.getSchoolMajorInfo
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * 학과(전공) 마스터. KEDI 전공 ID (`kediMjrId`) 와 표준분류 ID (`stdClftMjrId`)
 * 두 가지 식별자를 함께 보존 — 우리 DB 의 외부코드 컬럼으로 사용.
 *
 * schlMjrStatNm 가 "폐과" 인 학과는 active=false 매핑.
 */
export const KcueSchoolMajorSchema = z.object({
  schlNm: z.string(),
  clgNm: z.string().optional().default(""),
  korMjrNm: z.string(),
  /** KEDI 전공 ID — 학과 unique key (예: U04080100427) */
  kediMjrId: z.string(),
  /** 표준분류 전공 ID (예: D15090) */
  stdClftMjrId: z.string().optional().default(""),
  /** 학위과정: 학사·석사·박사·전문학사 */
  pbnfDgriCrseDivNm: z.string().optional().default(""),
  /** 수업연한 (4년 / 2년 등) */
  lsnTrmNm: z.string().optional().default(""),
  /** 주간 / 야간 */
  dghtDivNm: z.string().optional().default(""),
  /** 학과상태: 운영 / 폐과 */
  schlMjrStatNm: z.string().optional().default(""),
  /** 학문계열: 공학계열 / 인문사회계열 등 */
  onsfSrsClftNm: z.string().optional().default(""),
  /** 학과특성: 일반과정 / 특성화 등 */
  schlMjrCharNm: z.string().optional().default(""),
  /** 학교종류: 대학교 / 전문대학 */
  schlKndNm: z.string().optional().default(""),
  mjrAreaCd: z.coerce.string().optional().default(""),
  mjrAreaNm: z.string().optional().default(""),
  mjrAreaSignguCd: z.coerce.string().optional().default(""),
  mjrAreaSignguNm: z.string().optional().default(""),
  /** 입학자수 */
  eschlPscpNum: z.coerce.number().int().nonnegative().optional().default(0),
  /** 졸업자수 */
  grdtNum: z.coerce.number().int().nonnegative().optional().default(0),
  /** 교과과정 텍스트 (`|` 구분) */
  edcCrseLtrCtnt: z.string().optional().default(""),
  /** 진로/직업 텍스트 (`|` 구분) */
  pwayEmplLtrCtnt: z.string().optional().default(""),
  /** 마지막 갱신 일자 (학과 단위) */
  mjrUpdtDtm: z.string().optional().default(""),
  /** 마지막 갱신 일자 (응답 시점) */
  lstUpdtDtm: z.string().optional().default(""),
  svyYr: z.coerce.number().int(),
});
export type KcueSchoolMajor = z.infer<typeof KcueSchoolMajorSchema>;

/* ═══════════════════════════════════════════════════════════════════════
   Service 3·4·5 — 지표(indicator) 공통 스키마
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * 학생/재정/교원 service 는 모두 동일한 envelope item 구조.
 * indctId/indctYr 는 호출한 operation 자체가 지표를 정의하므로 단일 값.
 *
 * Sync 시 어떤 op 가 어떤 의미인지는 호출 측에서 indctMeta 로 라벨링 (KcueIndicatorWithMeta).
 */
export const KcueIndicatorRawSchema = z.object({
  schlId: z.coerce.string(),
  schlKrnNm: z.string(),
  schlDivNm: z.string().optional().default(""),
  schlEstbNm: z.string().optional().default(""),
  indctId: z.coerce.string(),
  /** 지표 값 (퍼센트·금액·인원 — operation 마다 단위 다름) */
  indctVal1: z.coerce.number().optional(),
  indctYr: z.coerce.string().optional(),
  svyYr: z.coerce.number().int(),
});
export type KcueIndicatorRaw = z.infer<typeof KcueIndicatorRawSchema>;

/** indicator 의미를 라벨링한 상위 타입 — 호출 측에서 부여. */
export interface KcueIndicatorWithMeta extends KcueIndicatorRaw {
  /** 호출한 op 가 의미하는 지표 — 예: "freshman_chance_balance_ratio" */
  metricKind: string;
  /** 단위 — `percent` / `won` / `count` 등 */
  metricUnit: "percent" | "won" | "count" | "ratio" | "unknown";
}

/* ═══════════════════════════════════════════════════════════════════════
   파서 — XML → envelope unwrap → Zod 검증
   ═══════════════════════════════════════════════════════════════════════ */

const xmlParser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false, // 숫자/날짜는 Zod 의 z.coerce 가 직접 처리 — 자동 변환 끔
  trimValues: true,
});

/**
 * 응답 XML 을 파싱해 envelope 검증 후 item 배열을 service-specific Zod schema 로 검증.
 *
 * 에러 정책:
 *   - resultCode !== "00" → KcueServiceError (호출자가 retry/abort 판단)
 *   - envelope 자체가 부서져 있으면 → KcueEnvelopeError (suspicious 마킹용)
 *   - item 1개가 schema 검증 실패해도 다른 item 은 살림 — 단 invalid item 카운트 보존.
 */
export function parseKcueResponse<T extends z.ZodTypeAny>(
  xml: string,
  itemSchema: T,
  endpoint: string,
): KcueParsedResponse<z.infer<T>> {
  let parsed: unknown;
  try {
    parsed = xmlParser.parse(xml);
  } catch (e) {
    throw new KcueEnvelopeError(
      `XML parse failed: ${e instanceof Error ? e.message : String(e)}`,
      endpoint,
    );
  }

  const envelope = envelopeSchema.safeParse(parsed);
  if (!envelope.success) {
    throw new KcueEnvelopeError(envelope.error.message, endpoint);
  }

  const { header, body } = envelope.data.response;
  if (header.resultCode !== "00") {
    throw new KcueServiceError(header.resultCode, header.resultMsg, endpoint);
  }

  const rawItems = body?.items ?? [];
  const validItems: z.infer<T>[] = [];
  let invalidCount = 0;
  for (const raw of rawItems) {
    const result = itemSchema.safeParse(raw);
    if (result.success) validItems.push(result.data as z.infer<T>);
    else invalidCount += 1;
  }

  return {
    resultCode: "00",
    items: validItems,
    numOfRows: body?.numOfRows ?? validItems.length,
    pageNo: body?.pageNo ?? 1,
    totalCount: body?.totalCount ?? validItems.length,
    trustLevel: "trusted",
    invalidCount,
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   서비스별 편의 함수 — 호출 코드의 가독성용
   ═══════════════════════════════════════════════════════════════════════ */

export function parsePubYear(xml: string) {
  return parseKcueResponse(xml, KcuePubYearSchema, "BasicInformationService/getComparisonPubYear");
}

export function parseRegionCode(xml: string) {
  return parseKcueResponse(xml, KcueRegionCodeSchema, "BasicInformationService/getCodeByRegion");
}

export function parseSchoolMajor(xml: string) {
  return parseKcueResponse(xml, KcueSchoolMajorSchema, "SchoolMajorInfoService/getSchoolMajorInfo");
}

/**
 * 학생/재정/교원 service 응답 — endpoint 는 호출자가 명시 (op 이름 기록용).
 */
export function parseIndicator(xml: string, endpoint: string) {
  return parseKcueResponse(xml, KcueIndicatorRawSchema, endpoint);
}

/* ═══════════════════════════════════════════════════════════════════════
   Normalizer — KCUE raw → 도메인 객체
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * 지표 응답 item 들에서 university 마스터 추출 (schlId + schlKrnNm 만).
 * StudentService 등 호출 결과로부터 universities 테이블 시드.
 */
export interface NormalizedKcueUniversity {
  /** KCUE 학교 ID (7자리, 예: "0000100") */
  kcueCode: string;
  /** 학교명 (한글) */
  name: string;
  /** 대학 / 전문대학 / 대학원 */
  schoolKind: string;
  /** 국립 / 사립 / 공립 */
  establishment: string;
  /** 시드된 출처 op — 디버깅용 */
  sourceEndpoint: string;
}

export function normalizeUniversityFromIndicators(
  items: KcueIndicatorRaw[],
  sourceEndpoint: string,
): Map<string, NormalizedKcueUniversity> {
  const out = new Map<string, NormalizedKcueUniversity>();
  for (const it of items) {
    if (!it.schlId || !it.schlKrnNm) continue;
    if (out.has(it.schlId)) continue;
    out.set(it.schlId, {
      kcueCode: it.schlId,
      name: it.schlKrnNm,
      schoolKind: it.schlDivNm,
      establishment: it.schlEstbNm,
      sourceEndpoint,
    });
  }
  return out;
}

/**
 * SchoolMajor item → department 도메인 객체.
 *
 * - schlMjrStatNm === "폐과" → active=false
 * - edcCrseLtrCtnt / pwayEmplLtrCtnt 는 `|` 구분 → 배열 split
 */
export interface NormalizedKcueDepartment {
  /** KEDI 전공 ID — 학과 unique key */
  kediMjrId: string;
  /** 표준분류 전공 ID — 학문 분류용 */
  stdClftMjrId: string;
  /** 학교명 (한글) — 학교 매핑용 키 */
  universityName: string;
  /** 학과명 */
  name: string;
  /** 단과대학 / 학부 (College) */
  college: string;
  /** 학위과정: 학사·석사·박사·전문학사 */
  degreeCourse: string;
  /** 수업연한 텍스트 (예: "4년") */
  durationLabel: string;
  /** 주간 / 야간 */
  daytime: string;
  /** 학과상태 */
  status: string;
  /** 학문계열 (공학·인문사회·자연·예체능·의약·교육) */
  fieldCategory: string;
  /** 폐과 여부 */
  active: boolean;
  /** 입학자수 (해당 연도) */
  freshmanCount: number;
  /** 졸업자수 (해당 연도) */
  graduateCount: number;
  /** 교과과정 (강의명 배열) — `|` split */
  curriculum: string[];
  /** 진로/직업 (배열) — `|` split */
  careerPaths: string[];
  /** 마지막 갱신 일자 */
  lastUpdated: string;
  /** 공시연도 */
  surveyYear: number;
}

export function normalizeDepartmentFromMajor(item: KcueSchoolMajor): NormalizedKcueDepartment {
  const active = item.schlMjrStatNm !== "폐과";
  const splitPipe = (s: string): string[] =>
    s
      .split("|")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
  return {
    kediMjrId: item.kediMjrId,
    stdClftMjrId: item.stdClftMjrId,
    universityName: item.schlNm,
    name: item.korMjrNm,
    college: item.clgNm,
    degreeCourse: item.pbnfDgriCrseDivNm,
    durationLabel: item.lsnTrmNm,
    daytime: item.dghtDivNm,
    status: item.schlMjrStatNm,
    fieldCategory: item.onsfSrsClftNm,
    active,
    freshmanCount: item.eschlPscpNum,
    graduateCount: item.grdtNum,
    curriculum: splitPipe(item.edcCrseLtrCtnt),
    careerPaths: splitPipe(item.pwayEmplLtrCtnt),
    lastUpdated: item.mjrUpdtDtm || item.lstUpdtDtm,
    surveyYear: item.svyYr,
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   디버그/테스트 헬퍼
   ═══════════════════════════════════════════════════════════════════════ */

export const __test__ = {
  envelopeSchema,
  xmlParser,
};
