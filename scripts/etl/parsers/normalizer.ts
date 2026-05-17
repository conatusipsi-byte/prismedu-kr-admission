/**
 * 추출 텍스트 → 부분 구조 JSON 정규화
 *
 * 입력: pdf-text.ts 또는 ocr-fallback.ts가 반환한 raw 텍스트 + trustLevel
 * 출력: ParsedAdmissionPartial — 학과명·트랙·수능최저·반영비율 후보
 *
 * 추출 못한 영역은 raw 텍스트 그대로 unparsedSections에 보존 → 운영자 검수.
 *
 * 정직성 (P-002):
 *   - 자동판정 불가 케이스(with_required·conditional·custom)는 finalizeMinReq가
 *     autoEvaluable=false로 마킹 → 매칭 알고리즘이 "수동 확인 필요" 표시
 *   - 노이즈 필터 — 같은 학과명 rawCount ≥ 3 → trusted, 1~2 → suspicious
 *   - OCR 결과 (입력 trustLevel="suspicious")는 모든 추출 결과를 suspicious로 격상
 *
 * 본 모듈은 pure — 외부 의존성 없음 (test 가능).
 */

import type {
  CsatMinimumPartial,
  ParsedAdmissionPartial,
  ParserTrustLevel,
  ReflectionRatioPartial,
  TrackKindCandidate,
} from "./types";

/* ═══════════════════════════════════════════════════════════════════════
   학과명 추출
   ═══════════════════════════════════════════════════════════════════════ */

/** "○○학과", "○○학부", "○○과", "○○부" — 한글 2~10자 */
const DEPARTMENT_PATTERNS = [
  /([가-힣]{2,15})학과/g,
  /([가-힣]{2,15})학부/g,
  /([가-힣]{2,10})학[부과]\([^)]+\)/g, // "공학부(전기전자공학과)" 같은 합성
] as const;

/** "○○과" 단독은 false positive 많음 (수업과·추가합격 등) — 별도 처리 */
const DEPARTMENT_NAME_NOISE_TERMS = new Set([
  "추가합격",
  "수시합격",
  "정시합격",
  "수능시험",
  "한국사",
  "탐구과",
  "필수과",
  "선택과",
  "총괄과",
  "관리과",
]);

/**
 * 노이즈 필터 — 같은 학과명이 raw N번 등장하면 신뢰도 격상.
 *
 * update-track-vocab-fixtures.ts와 동일한 임계 (rawCount ≥ 3 → trusted).
 * 한 PDF 안에서 학과명은 보통 표지·목차·본문에 반복 등장 → 3회 미만이면 OCR 노이즈 의심.
 */
const DEPT_NAME_TRUST_THRESHOLD = 3;

/* ═══════════════════════════════════════════════════════════════════════
   트랙 종류 키워드
   ═══════════════════════════════════════════════════════════════════════ */

const TRACK_KIND_KEYWORDS: Array<{
  kind: TrackKindCandidate["kind"];
  keywords: string[];
}> = [
  { kind: "susi_subject", keywords: ["학생부교과", "교과전형", "교과 전형"] },
  { kind: "susi_comprehensive", keywords: ["학생부종합", "학종", "종합전형"] },
  { kind: "susi_essay", keywords: ["논술전형", "논술 전형", "논술우수자"] },
  { kind: "susi_practical", keywords: ["실기전형", "실기 전형", "실기/실적", "실기우수자"] },
  { kind: "jeongsi_ga", keywords: ["정시 가군", "정시(가)", "가군 모집"] },
  { kind: "jeongsi_na", keywords: ["정시 나군", "정시(나)", "나군 모집"] },
  { kind: "jeongsi_da", keywords: ["정시 다군", "정시(다)", "다군 모집"] },
  { kind: "additional", keywords: ["추가모집"] },
  { kind: "jaeoegukmin", keywords: ["재외국민", "외국인 전형", "12년 외국 교육과정"] },
];

/* ═══════════════════════════════════════════════════════════════════════
   수능최저 패턴 — 실제 2026 모집요강 PDF 6종에서 채굴한 변형
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * 한국 모집요강의 수능최저학력기준 표현 패턴 — 정규식 + 그룹 인덱스 매퍼.
 *
 * 채굴 출처: university/*.pdf (고대 수시·정시, 한외대 수시, 대교협 통합 안내)
 *
 * 변형 4가지:
 *   A. 풀네임 메인형
 *      "국어, 수학, 영어, 탐구 4개 영역 [중 N개 영역] 등급(의) 합(이) X 이내"
 *      탐구 한정자 괄호 허용: "탐구(1과목)", "탐구(상위 1과목)", "탐구(사회 혹은 과학탐구 1과목)"
 *   B. 괄호 앞 위치형
 *      "N개 영역(국어, 수학, 영어, 탐구) 중 M개 영역 등급 합이 X 등급 이내"
 *   C. 단일 영역형 (글로벌·일부 학과)
 *      "국어, 수학, 영어, 탐구(...) 중 1개 영역 등급이 X 이내"
 *   D. 단축형 (구식 모집요강·축약 표기)
 *      "국·수·영·탐 N개 영역 등급의 합 X"
 */
interface CsatPatternSpec {
  regex: RegExp;
  /**
   * regex 매치 → {requiredCount, sumGradeMax}.
   * requiredCount 미지정 매치(M이 없는 메인형)는 4(전체 영역) 기본값.
   * null 반환 시 본 매치는 폐기 — 다음 패턴 시도.
   */
  extract: (m: RegExpExecArray) => { requiredCount: number; sumGradeMax: number } | null;
}

const CSAT_MIN_REQ_PATTERNS: CsatPatternSpec[] = [
  // B. 괄호 앞 위치 — N개 영역(과목들) 중 M개 영역 등급 합 X 등급 이내
  //    먼저 시도(가장 구체적). 매치 시 N(전체)·M(요구개수)·X(합).
  {
    regex: /(\d+)\s*개\s*영역\s*\(\s*국어\s*,\s*수학\s*,\s*영어\s*,\s*탐구\s*\)\s*중\s*(\d+)\s*개\s*영역\s*등급의?\s*합(?:이|은)?\s*(\d+)\s*등?급?\s*이내/g,
    extract: (m) => {
      const requiredCount = parseInt(m[2], 10);
      const sumGradeMax = parseInt(m[3], 10);
      return Number.isFinite(requiredCount) && Number.isFinite(sumGradeMax)
        ? { requiredCount, sumGradeMax }
        : null;
    },
  },
  // C. 단일 영역 — "중 1개 영역 등급이 X 이내" (합 아님 / 단일 영역 등급)
  {
    regex: /국어\s*,?\s*수학\s*,?\s*영어\s*,?\s*탐구(?:\s*\([^)]{0,40}\))?\s*중\s*(1)\s*개\s*영역\s*등급이\s*(\d+)\s*이내/g,
    extract: (m) => {
      const requiredCount = parseInt(m[1], 10);
      const sumGradeMax = parseInt(m[2], 10);
      return Number.isFinite(requiredCount) && Number.isFinite(sumGradeMax)
        ? { requiredCount, sumGradeMax }
        : null;
    },
  },
  // A. 풀네임 메인형 — "국어, 수학, 영어, 탐구[(...)] [N개 영역] [중 M개 영역] 등급(의) 합(이) X 이내"
  //    M이 명시되면 M, 아니면 4(전체).
  {
    regex: /국어\s*,?\s*수학\s*,?\s*영어\s*,?\s*탐구(?:\s*\([^)]{0,40}\))?\s*(?:\d+\s*개?\s*영역\s*)?(?:중\s*(\d+)\s*개\s*영역\s*)?등급의?\s*합(?:이|은)?\s*(\d+)\s*등?급?\s*이내/g,
    extract: (m) => {
      const requiredCount = m[1] ? parseInt(m[1], 10) : 4;
      const sumGradeMax = parseInt(m[2], 10);
      return Number.isFinite(requiredCount) && Number.isFinite(sumGradeMax)
        ? { requiredCount, sumGradeMax }
        : null;
    },
  },
  // D. 단축형 — `국·수·영·탐` (구식 표기 호환)
  {
    regex: /국\s*[·,\s]\s*수\s*[·,\s]\s*영\s*[·,\s]\s*탐(?:구)?[^합]{0,20}?(?:중\s*)?(\d+)\s*개\s*(?:영역\s*)?(?:등급의\s*)?합(?:\s*이|\s*은|\s*[은이])?\s*(\d+)\s*(?:이내|등급)?/g,
    extract: (m) => {
      const requiredCount = parseInt(m[1], 10);
      const sumGradeMax = parseInt(m[2], 10);
      return Number.isFinite(requiredCount) && Number.isFinite(sumGradeMax)
        ? { requiredCount, sumGradeMax }
        : null;
    },
  },
];

/** "한국사 N등급" / "한국사 영역 N등급" — 자격 기준 (영역 단어 옵션) */
const HISTORY_GRADE_PATTERN = /한국사(?:\s*영역)?\s*(\d)\s*등급\s*(?:이내|이상)?/;

/** "영어 N등급" / "영어 영역 N등급" — 자격 기준 */
const ENGLISH_GRADE_PATTERN = /영어(?:\s*영역)?\s*(\d)\s*등급\s*(?:이내|이상)?/;

/* ═══════════════════════════════════════════════════════════════════════
   반영비율 패턴
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * 영역별 반영비율 — 한국 모집요강은 표 형식이 압도적. 텍스트 추출 시 라벨과 숫자가
 * 분리되는 경우가 많아, 라벨 인근 + 표 행 패턴 두 갈래로 추출 시도.
 *
 * 채굴: 한외대 정시 표 (예: `30%     30%           20%      20%         100%`)
 *
 * False-positive 보호:
 *   - 합이 100 ± 5 인 경우만 채택 (가산점 케이스 포함 +200 등은 별도 처리)
 *   - 4개 값이 모두 5 ≤ v ≤ 60 (일반적 영역 반영비 범위)
 */
interface RatioPatternSpec {
  regex: RegExp;
  extract: (m: RegExpExecArray) => {
    korean: number; math: number; english: number; investigation: number;
  } | null;
}

const REFLECTION_RATIO_PATTERNS: RatioPatternSpec[] = [
  // A. 표 행 형식 — "30%   30%   20%   20%   100%" (한외대 정시·대다수 정시 모집요강)
  //    숫자 4개 연속 + 100% 총계로 false-positive 최소화.
  {
    regex: /(\d{1,2})\s*%\s+(\d{1,2})\s*%\s+(\d{1,2})\s*%\s+(\d{1,2})\s*%\s+100\s*%/g,
    extract: (m) => ({
      korean: parseInt(m[1], 10),
      math: parseInt(m[2], 10),
      english: parseInt(m[3], 10),
      investigation: parseInt(m[4], 10),
    }),
  },
  // B. 인라인 — "국어 X%, 수학 Y%, 영어 Z%, 탐구 W%"
  {
    regex: /국[어]?\s*(\d{1,3})\s*%\s*[,＋+\s]+수[학]?\s*(\d{1,3})\s*%\s*[,＋+\s]+영[어]?\s*(\d{1,3})\s*%\s*[,＋+\s]+탐(?:구)?\s*[^가-힣\d%]{0,5}(\d{1,3})\s*%/g,
    extract: (m) => ({
      korean: parseInt(m[1], 10),
      math: parseInt(m[2], 10),
      english: parseInt(m[3], 10),
      investigation: parseInt(m[4], 10),
    }),
  },
  // C. 콜론·점 분리 — "국 25 : 수 35 : 영 15 : 탐 25"
  {
    regex: /국[어:]\s*(\d{1,3})\s*[:\s]+수[학:]\s*(\d{1,3})\s*[:\s]+영[어:]\s*(\d{1,3})\s*[:\s]+탐(?:구)?[:\s]\s*(\d{1,3})/g,
    extract: (m) => ({
      korean: parseInt(m[1], 10),
      math: parseInt(m[2], 10),
      english: parseInt(m[3], 10),
      investigation: parseInt(m[4], 10),
    }),
  },
];

/** 반영비율 유효성 — 합이 100±5, 각 값 5~60 사이. False-positive 차단. */
function isValidReflectionRatio(r: { korean: number; math: number; english: number; investigation: number }): boolean {
  const values = [r.korean, r.math, r.english, r.investigation];
  if (!values.every((v) => Number.isFinite(v) && v >= 5 && v <= 60)) return false;
  const sum = values.reduce((a, b) => a + b, 0);
  return sum >= 95 && sum <= 105;
}

/* ═══════════════════════════════════════════════════════════════════════
   메인 — normalizeAdmissionText
   ═══════════════════════════════════════════════════════════════════════ */

export interface NormalizeOptions {
  /** 입력 trustLevel — pdf-text/ocr-fallback에서 받은 값. suspicious면 모든 출력 격상. */
  inputTrustLevel: ParserTrustLevel;
  /** 디버그 — 노이즈 필터 임계치 override (기본 3) */
  deptNameTrustThreshold?: number;
}

/**
 * 추출 텍스트 → 부분 구조 JSON.
 *
 * 추출 못한 영역은 unparsedSections에 raw 텍스트 보존 — 운영자 검수에 전달.
 */
export function normalizeAdmissionText(
  text: string,
  opts: NormalizeOptions,
): ParsedAdmissionPartial {
  const trustThreshold = opts.deptNameTrustThreshold ?? DEPT_NAME_TRUST_THRESHOLD;

  // 1. 학과명 후보 + 노이즈 필터
  const { departmentNames, rawCounts } = extractDepartmentNames(text, trustThreshold);

  // 2. 트랙 종류 후보
  const trackKindCandidates = extractTrackKinds(text);

  // 3. 수능최저 추출
  const csatMinimumPartial = extractCsatMinimum(text, opts.inputTrustLevel);

  // 4. 반영비율 추출
  const reflectionRatioPartial = extractReflectionRatio(text, opts.inputTrustLevel);

  // 5. 추출 못한 영역 — 가장 큰 단락(>200자) 단위로 보존
  const unparsedSections = extractUnparsedSections(text);

  return {
    departmentNameCandidates: departmentNames,
    trackKindCandidates,
    csatMinimumPartial,
    reflectionRatioPartial,
    trustLevel: opts.inputTrustLevel, // OCR 입력은 자동으로 suspicious 전파
    unparsedSections,
    rawCounts,
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   학과명 추출
   ═══════════════════════════════════════════════════════════════════════ */

function extractDepartmentNames(
  text: string,
  trustThreshold: number,
): { departmentNames: string[]; rawCounts: Record<string, number> } {
  const counts: Record<string, number> = {};
  for (const pattern of DEPARTMENT_PATTERNS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      const fullName = m[0]; // "컴퓨터공학과" 전체
      const stem = m[1]; // "컴퓨터공학" 줄기
      // 노이즈 필터링
      if (DEPARTMENT_NAME_NOISE_TERMS.has(stem)) continue;
      if (stem.length < 2) continue;
      counts[fullName] = (counts[fullName] ?? 0) + 1;
    }
  }
  // rawCount ≥ threshold만 남김 + 등장 빈도 desc 정렬
  const departmentNames = Object.entries(counts)
    .filter(([, n]) => n >= trustThreshold)
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);

  return { departmentNames, rawCounts: counts };
}

/* ═══════════════════════════════════════════════════════════════════════
   트랙 종류 추출
   ═══════════════════════════════════════════════════════════════════════ */

function extractTrackKinds(text: string): TrackKindCandidate[] {
  const out: TrackKindCandidate[] = [];
  const seen = new Set<string>();

  for (const { kind, keywords } of TRACK_KIND_KEYWORDS) {
    for (const kw of keywords) {
      const idx = text.indexOf(kw);
      if (idx < 0) continue;
      const dedupKey = `${kind}/${kw}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);
      out.push({ kind, matchedKeyword: kw, matchedAtOffset: idx });
    }
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════════════════
   수능최저 추출
   ═══════════════════════════════════════════════════════════════════════ */

function extractCsatMinimum(
  text: string,
  trustLevel: ParserTrustLevel,
): CsatMinimumPartial | undefined {
  for (const spec of CSAT_MIN_REQ_PATTERNS) {
    spec.regex.lastIndex = 0;
    const m = spec.regex.exec(text);
    if (!m) continue;
    const extracted = spec.extract(m);
    if (!extracted) continue;
    const { requiredCount, sumGradeMax } = extracted;
    if (requiredCount < 1 || requiredCount > 5) continue;
    if (sumGradeMax < 1 || sumGradeMax > 30) continue;

    // 원문 — 매칭 위치 -20 ~ +120 자 (한국사·영어 자격 기준 함께 포함되도록 확장)
    const start = Math.max(0, m.index - 20);
    const end = Math.min(text.length, m.index + m[0].length + 120);
    const originalText = text.slice(start, end).trim();

    // 추가 자격 기준 — 원문 컨텍스트 + 전체 텍스트 일부 함께 확인
    // (한국사·영어 기준이 합 패턴 뒤에 별도 문장으로 등장하는 경우 대응)
    const extendedContext = text.slice(start, Math.min(text.length, end + 200));
    const historyMatch = HISTORY_GRADE_PATTERN.exec(extendedContext);
    const englishMatch = ENGLISH_GRADE_PATTERN.exec(extendedContext);

    return {
      candidateAreas: ["korean", "math", "english", "investigation"],
      requiredCount,
      sumGradeMax,
      historyGradeMax: historyMatch ? parseInt(historyMatch[1], 10) : undefined,
      englishGradeMax: englishMatch ? parseInt(englishMatch[1], 10) : undefined,
      investigationRule: detectInvestigationRule(originalText),
      originalText,
      trustLevel,
    };
  }
  return undefined;
}

function detectInvestigationRule(text: string): "one" | "two_avg" | "two_each" | undefined {
  if (/탐구\s*\(?\s*1\s*\)?|한\s*과목/.test(text)) return "one";
  if (/탐구\s*\(?\s*2\s*평균\s*\)?|두\s*과목\s*평균|2과목\s*평균/.test(text)) return "two_avg";
  if (/두\s*과목\s*모두|각\s*과목|2과목\s*각/.test(text)) return "two_each";
  return undefined;
}

/* ═══════════════════════════════════════════════════════════════════════
   반영비율 추출
   ═══════════════════════════════════════════════════════════════════════ */

function extractReflectionRatio(
  text: string,
  trustLevel: ParserTrustLevel,
): ReflectionRatioPartial | undefined {
  for (const spec of REFLECTION_RATIO_PATTERNS) {
    spec.regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    // 한 패턴에서 여러 매치가 나올 수 있음 (표 행 다수) — 유효성 검사 통과한 첫 매치 사용.
    // 표 패턴(A)은 학년별 반영비·다른 표 등 false-positive 가능 → 유효성 필터 필수.
    while ((m = spec.regex.exec(text)) !== null) {
      const extracted = spec.extract(m);
      if (!extracted || !isValidReflectionRatio(extracted)) continue;

      const start = Math.max(0, m.index - 30);
      const end = Math.min(text.length, m.index + m[0].length + 30);
      return {
        ...extracted,
        originalText: text.slice(start, end).trim(),
        trustLevel,
      };
    }
  }
  return undefined;
}

/* ═══════════════════════════════════════════════════════════════════════
   미파싱 영역 보존 — 운영자 검수
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * 텍스트를 단락(연속 줄바꿈 기준) 단위로 분리 + 200자 이상 단락만 보존.
 * 운영자가 admin 검수 시 자동 추출 못 한 본문을 직접 확인 가능.
 */
function extractUnparsedSections(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 200)
    .slice(0, 20); // 최대 20개 단락 — 도큐먼트 사이즈 보호
}

/* ═══════════════════════════════════════════════════════════════════════
   디버그 헬퍼 — 회귀 테스트용 export
   ═══════════════════════════════════════════════════════════════════════ */

export const __test__ = {
  extractDepartmentNames,
  extractTrackKinds,
  extractCsatMinimum,
  extractReflectionRatio,
  detectInvestigationRule,
  isValidReflectionRatio,
  DEPT_NAME_TRUST_THRESHOLD,
};
