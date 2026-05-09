/**
 * ETL parsers 공통 타입
 *
 * 외부 바이너리(pdftotext, tesseract)를 호출하는 파서들의 trustLevel·결과 형식
 * 통일. update-track-vocab-fixtures.ts의 TrustLevel과 명명 일관:
 *   trusted          — UTF-8 pdftotext 성공
 *   trusted-fallback — Adobe-Korea1 pdftotext (한국어 폰트 매핑)
 *   suspicious       — Tesseract OCR (시각 인식, 운영자 검수 필요)
 */

export type ParserTrustLevel = "trusted" | "trusted-fallback" | "suspicious";

export interface PdfExtractionResult {
  /** 추출된 텍스트 (UTF-8 정규화) */
  text: string;
  /** 어떤 단계에서 성공했는지 */
  trustLevel: ParserTrustLevel;
  /** 사용한 도구 식별자 (`pdftotext-utf8` 등) */
  tool: string;
  /** 성공한 단계 — 실패 fallback chain 추적용 */
  attempts: ExtractionAttempt[];
}

export interface ExtractionAttempt {
  tool: string;
  success: boolean;
  errorMessage?: string;
  /** 추출 텍스트 길이 (성공 시) */
  textLength?: number;
}

/**
 * normalizer 출력 — 부분 구조. 추출 못한 영역은 raw 텍스트 그대로 보존.
 * 운영자 admin 검수 후 admissionsStaging → admissions 승격.
 */
export interface ParsedAdmissionPartial {
  /** 학과명 후보 — 규칙으로 추출. 자동 매칭 실패 시 빈 배열. */
  departmentNameCandidates: string[];
  /** 트랙 종류 후보 (multiple — 한 PDF에 수시·정시 함께 있는 경우 다수) */
  trackKindCandidates: TrackKindCandidate[];
  /** 수능최저 추출 — finalizeMinReq에 그대로 전달 가능한 partial */
  csatMinimumPartial?: CsatMinimumPartial;
  /** 영역별 반영비율 추출 후보 */
  reflectionRatioPartial?: ReflectionRatioPartial;
  /** 추출 trustLevel (가장 약한 단계 우선 — fallback chain 마지막) */
  trustLevel: ParserTrustLevel;
  /** 자동판정 불가 영역의 원문 — 운영자 검수에 전달 */
  unparsedSections: string[];
  /** 노이즈 필터 — 학과명 등 같은 텍스트가 N번 등장 시 신뢰도 격상 */
  rawCounts: Record<string, number>;
}

export interface TrackKindCandidate {
  kind:
    | "susi_subject"
    | "susi_comprehensive"
    | "susi_essay"
    | "susi_practical"
    | "jeongsi_ga"
    | "jeongsi_na"
    | "jeongsi_da"
    | "additional"
    | "jaeoegukmin";
  /** 추출 근거 — PR 본문/admin 검수 시 컨텍스트 */
  matchedKeyword: string;
  /** 일치한 텍스트 위치 (원문 offset) — 디버그용 */
  matchedAtOffset: number;
}

export interface CsatMinimumPartial {
  /** 후보 영역 — "국·수·영·탐" 같은 표기 → enum 매핑 */
  candidateAreas: Array<"korean" | "math" | "english" | "investigation">;
  requiredCount: number;
  sumGradeMax: number;
  englishGradeMax?: number;
  historyGradeMax?: number;
  investigationRule?: "one" | "two_avg" | "two_each";
  /** 모집요강 원문 — finalizeMinReq의 originalText로 전달 */
  originalText: string;
  /** 추출 trustLevel */
  trustLevel: ParserTrustLevel;
}

export interface ReflectionRatioPartial {
  /** 영역별 % — 합 != 100일 수 있음 (e.g., 서울대는 100+120+80=300) */
  korean?: number;
  math?: number;
  english?: number;
  investigation?: number;
  /** 추출 텍스트 원문 */
  originalText: string;
  trustLevel: ParserTrustLevel;
}

/** 가장 약한 trustLevel을 결정 (chain 결과의 약한 고리). */
export function combineTrustLevel(...levels: ParserTrustLevel[]): ParserTrustLevel {
  if (levels.includes("suspicious")) return "suspicious";
  if (levels.includes("trusted-fallback")) return "trusted-fallback";
  return "trusted";
}
