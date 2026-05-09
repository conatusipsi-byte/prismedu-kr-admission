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
   수능최저 패턴
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * "국·수·영·탐 중 N개 합 X" 패턴.
 *
 * 변형:
 *   "국·수·영·탐 4개 영역 등급의 합이 5 이내"
 *   "국·수·영·탐(1) 중 2개 합 5"
 *   "국, 수, 영, 탐 중 3개 합 6"
 */
const CSAT_MIN_REQ_PATTERNS: RegExp[] = [
  /국\s*[·,\s]\s*수\s*[·,\s]\s*영\s*[·,\s]\s*탐(?:구)?[^합]{0,20}?(?:중\s*)?(\d+)\s*개\s*(?:영역\s*)?(?:등급의\s*)?합(?:\s*이|\s*은|\s*[은이])?\s*(\d+)\s*(?:이내|등급)?/g,
  /(?:국|수|영|탐)\s*[\d개·,등급합영역\s]*(\d+)\s*개\s*합\s*(\d+)/g,
];

/** "한국사 N등급" — 자격 기준 */
const HISTORY_GRADE_PATTERN = /한국사\s*(\d)\s*등급\s*(?:이내|이상)?/;

/** "영어 N등급" — 자격 기준 */
const ENGLISH_GRADE_PATTERN = /영어\s*(\d)\s*등급\s*(?:이내|이상)?/;

/* ═══════════════════════════════════════════════════════════════════════
   반영비율 패턴
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * "국 25 + 수 35 + 영 15 + 탐 25" 또는 "국:수:영:탐 = 25:35:15:25".
 *
 * 변형이 매우 다양 — 단순 추출 + 운영자 검수 fallback.
 */
const REFLECTION_RATIO_PATTERNS: RegExp[] = [
  /국[어]?\s*(\d{1,3})\s*[%＋+,\s]+수[학]?\s*(\d{1,3})\s*[%＋+,\s]+영[어]?\s*(\d{1,3})\s*[%＋+,\s]+탐(?:구)?\s*(\d{1,3})/g,
  /국[어:]\s*(\d{1,3})\s*[:\s]+수[학:]\s*(\d{1,3})\s*[:\s]+영[어:]\s*(\d{1,3})\s*[:\s]+탐(?:구)?[:\s]\s*(\d{1,3})/g,
];

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
  for (const pattern of CSAT_MIN_REQ_PATTERNS) {
    pattern.lastIndex = 0;
    const m = pattern.exec(text);
    if (m) {
      const requiredCount = parseInt(m[1], 10);
      const sumGradeMax = parseInt(m[2], 10);
      if (
        Number.isFinite(requiredCount) &&
        Number.isFinite(sumGradeMax) &&
        requiredCount >= 1 && requiredCount <= 5 &&
        sumGradeMax >= 1 && sumGradeMax <= 30
      ) {
        // 원문 — 매칭 위치 ± 80자
        const start = Math.max(0, m.index - 20);
        const end = Math.min(text.length, m.index + m[0].length + 60);
        const originalText = text.slice(start, end).trim();

        // 추가 자격 기준
        const historyMatch = HISTORY_GRADE_PATTERN.exec(originalText);
        const englishMatch = ENGLISH_GRADE_PATTERN.exec(originalText);

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
    }
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
  for (const pattern of REFLECTION_RATIO_PATTERNS) {
    pattern.lastIndex = 0;
    const m = pattern.exec(text);
    if (m) {
      const korean = parseInt(m[1], 10);
      const math = parseInt(m[2], 10);
      const english = parseInt(m[3], 10);
      const investigation = parseInt(m[4], 10);
      if ([korean, math, english, investigation].every((v) => Number.isFinite(v) && v >= 0 && v <= 300)) {
        const start = Math.max(0, m.index - 10);
        const end = Math.min(text.length, m.index + m[0].length + 10);
        return {
          korean,
          math,
          english,
          investigation,
          originalText: text.slice(start, end).trim(),
          trustLevel,
        };
      }
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
  DEPT_NAME_TRUST_THRESHOLD,
};
