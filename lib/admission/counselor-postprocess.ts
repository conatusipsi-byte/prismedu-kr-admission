/**
 * AI 카운슬러 응답 후처리 — 정직성 가드 회귀 방어 레이어
 *
 * 결정 (operations.md §6 / §8.4):
 *   LLM이 시스템 프롬프트의 정직성 가드를 우회해 임의 수치를 응답하는 경우를
 *   문자열 레벨에서 차단한다. 응답을 받은 직후 sanitize → 메트릭 기록 → 반환.
 *
 * 본 모듈은 pure (server/client 양쪽 동작 가능). 메트릭 기록은
 * server-only 인 counselor-metric.ts 에 분리.
 *
 * 동작 원리:
 *   1. 컨텍스트의 insufficientSampleSchools 목록이 비어 있으면 sanitize 스킵
 *   2. 응답을 한국어 문장 단위로 분할
 *   3. 표본 부족 학과 이름이 등장하는 문장 또는 수치 패턴이 등장하는 모든 문장에
 *      대해 NUMERIC_PATTERNS 매칭
 *   4. 매칭된 문장은 REPLACEMENT 으로 교체, 원본 보존
 *   5. SanitizeResult 반환 (호출자가 메트릭 기록)
 *
 * 보수성: 전체 응답을 락하지 않고 문장 단위 교체. 이유 — 정형 정보(모집요강
 * 일정 등) 답변에도 수치가 정당하게 등장할 수 있어 일률 차단은 false positive.
 * 다만 표본 부족 학과 컨텍스트에서는 응답 전반의 수치를 의심해야 하므로
 * 학과명 등장과 무관하게 수치 문장 전체를 sanitize. (UX 손해보다 정직성 우선)
 */

/* ═══════════════════════════════════════════════════════════════════════
   타입
   ═══════════════════════════════════════════════════════════════════════ */

export interface SanitizeContext {
  /** 표본 부족 학과 정식명 목록 (e.g., ["연세대 컴퓨터과학과"]).
   *  비어 있으면 sanitize 스킵. */
  insufficientSampleSchools: string[];
  /** 메트릭 기록용 — uid, conversationId 등 */
  uid?: string;
  conversationId?: string;
}

export interface ReplacedSentence {
  /** 교체된 원문 */
  original: string;
  /** 매칭된 패턴 라벨 (메트릭에서 분류) */
  matchedPattern: PatternLabel;
}

export interface SanitizeResult {
  sanitized: string;
  /** sanitize가 한 번이라도 발동했는지 */
  triggered: boolean;
  replacedSentences: ReplacedSentence[];
  /** 메트릭 emit용 메타 — 호출자가 그대로 recordSanitizeMetric 에 전달 */
  metricMeta: {
    totalSentences: number;
    matchedSentences: number;
    contextSchoolCount: number;
  };
}

/** 매칭된 패턴 분류 — 발동률을 패턴별로 모니터링 */
export type PatternLabel =
  | "percent"        // "15%", "약 80 %"
  | "grade"          // "1등급", "2.5 등급"
  | "score"          // "750점", "78.5 점"
  | "percentile"     // "백분위 95"
  | "standard"       // "표준점수 130"
  | "cutoff_phrase"; // "합격선 N", "환산점수 N", "커트라인 N"

/* ═══════════════════════════════════════════════════════════════════════
   패턴
   ═══════════════════════════════════════════════════════════════════════ */

interface NumericPattern {
  label: PatternLabel;
  regex: RegExp;
}

/**
 * 수치 패턴 — 라벨별로 분리해 메트릭에서 어느 패턴이 자주 트리거되는지 추적.
 * 정규식은 의도적으로 보수적: false positive 감수하더라도 정직성 우선.
 */
const NUMERIC_PATTERNS: NumericPattern[] = [
  // 퍼센트 — "15%", "약 80 %", "15퍼센트"
  { label: "percent", regex: /\d+(\.\d+)?\s*(%|％|퍼센트)/ },
  // 등급 — "1등급", "2.5 등급", "1등급대"
  { label: "grade", regex: /\d(\.\d+)?\s*등급/ },
  // 점수 — "750점", "78.5 점" (10점 미만은 컴마 분리 위해 제외, 두 자리 이상)
  { label: "score", regex: /\d{2,4}(\.\d+)?\s*점/ },
  // 백분위 — "백분위 95"
  { label: "percentile", regex: /백분위\s*\d{1,3}/ },
  // 표준점수 — "표준점수 130"
  { label: "standard", regex: /표준점수\s*\d{2,3}/ },
  // 합격선·커트라인 + 수치
  { label: "cutoff_phrase", regex: /(합격선|환산점수|커트라인|합격컷|커트|입결)\s*[\d.]+/ },
];

const REPLACEMENT = "구체적인 수치는 데이터 부족으로 안내드릴 수 없습니다";

/* ═══════════════════════════════════════════════════════════════════════
   본 함수
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * LLM 응답 sanitize.
 *
 * @param text   LLM 원본 응답
 * @param ctx    표본 부족 학과 목록 + 메트릭 메타
 * @returns      교체본 + 트리거 여부 + 메트릭 메타
 */
export function sanitizeCounselorResponse(
  text: string,
  ctx: SanitizeContext,
): SanitizeResult {
  const empty: SanitizeResult = {
    sanitized: text,
    triggered: false,
    replacedSentences: [],
    metricMeta: {
      totalSentences: 0,
      matchedSentences: 0,
      contextSchoolCount: ctx.insufficientSampleSchools.length,
    },
  };

  // 표본 부족 학과 컨텍스트가 없으면 sanitize 스킵 — 정형 답변에 수치 정당.
  if (ctx.insufficientSampleSchools.length === 0) {
    return empty;
  }

  const sentences = splitSentences(text);
  if (sentences.length === 0) {
    return empty;
  }

  const replacedSentences: ReplacedSentence[] = [];
  const sanitizedParts: string[] = [];

  for (const sentence of sentences) {
    const match = matchNumericPattern(sentence);
    if (match) {
      replacedSentences.push({ original: sentence, matchedPattern: match.label });
      sanitizedParts.push(REPLACEMENT);
    } else {
      sanitizedParts.push(sentence);
    }
  }

  // 분리 시 사용한 구분자(공백·줄바꿈)는 단순화 — 한국어 응답에서 마침표 + 공백 한 개로 재결합
  const sanitized = joinSentences(sanitizedParts, sentences, text);

  return {
    sanitized,
    triggered: replacedSentences.length > 0,
    replacedSentences,
    metricMeta: {
      totalSentences: sentences.length,
      matchedSentences: replacedSentences.length,
      contextSchoolCount: ctx.insufficientSampleSchools.length,
    },
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   내부 헬퍼
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * 한국어 문장 분할.
 *
 * 구분 기준:
 *   - "다.", "요.", "죠.", "까?" 등 한국어 종결어미 + 마침표/물음표/느낌표
 *   - 그 외 마침표/물음표/느낌표 + 공백
 *   - 줄바꿈
 *
 * 마침표만으로 자르면 "1.0등급" 같은 소수가 끊긴다 → 직전 글자가 한글이거나
 * 공백/문장끝일 때만 자른다. lookbehind 사용.
 */
function splitSentences(text: string): string[] {
  // 1. 줄바꿈 우선 분할
  const lines = text.split(/\n+/);
  const out: string[] = [];

  for (const line of lines) {
    // 2. 종결어미 + 구두점 직후 공백 — 직전 글자가 숫자가 아닐 때만 절단
    //    (예: "1.5 점입니다.이 학과는" → 두 문장. "1.0등급" → 절단 X)
    //    lookbehind: 직전이 한글 (가-힣) + 마침표/물음표/느낌표 + 공백
    const split = line.split(/(?<=[가-힣][.!?])\s+/);
    for (const s of split) {
      const trimmed = s.trim();
      if (trimmed.length > 0) out.push(trimmed);
    }
  }

  return out;
}

/**
 * 문장 재결합 — 분할 시 공백·줄바꿈 정보 손실되므로 단순히 공백 1개로 join.
 * 입력 텍스트에 줄바꿈이 많았다면 줄바꿈 보존도 검토 가치 있으나 sanitize 응답은
 * 단일 단락으로 충분 (false positive 방지보다 정직성 우선).
 */
function joinSentences(parts: string[], _orig: string[], _full: string): string {
  return parts.join(" ");
}

/**
 * 문장 하나가 NUMERIC_PATTERNS 중 하나라도 매칭하는지 검사. 첫 매칭 라벨 반환.
 */
function matchNumericPattern(sentence: string): NumericPattern | null {
  for (const p of NUMERIC_PATTERNS) {
    if (p.regex.test(sentence)) return p;
  }
  return null;
}

/* ═══════════════════════════════════════════════════════════════════════
   디버그 헬퍼 — 회귀 테스트에서 사용
   ═══════════════════════════════════════════════════════════════════════ */

/** 테스트에서 패턴 매칭 동작을 직접 검증할 때 사용 */
export const __test__ = {
  splitSentences,
  matchNumericPattern,
  NUMERIC_PATTERNS,
  REPLACEMENT,
};
