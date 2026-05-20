/**
 * KICE 수능 통계 CSV 파서
 *
 * 출처: 한국교육과정평가원(KICE) 공개 데이터.
 *   - 본수능·모의평가 등급구분/표준점수
 *   - 연도별 응시현황
 *
 * 실제 채택 포맷 (2026-05-20, university/TalkFile_*.csv):
 *   - 인코딩: CP949 (EUC-KR + extensions). UTF-8 변환 후 파싱.
 *   - 등급구분 CSV: `등급,과목,구분 점수,인원(명),비율(퍼센트)`
 *   - 응시현황 CSV: `학년도,시험일정,지원인원(명),응시인원(명),응시율(퍼센트)`
 *
 * 적재 대상:
 *   - csat_grade_cuts        등급구분·표준점수 (본수능/모의평가)
 *   - csat_attendance        연도별 응시현황
 */

import fs from "node:fs";
import iconv from "iconv-lite";
import Papa from "papaparse";
import { z } from "zod";

/* ═══════════════════════════════════════════════════════════════════════
   원시 CSV 행 스키마 — KICE 실 포맷
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * 등급구분/표준점수 row (본수능·모의평가 공통).
 *
 * "구분 점수" 컬럼은 두 가지 형식:
 *   - 숫자 (상대평가·절대평가 1~8등급): "133", "90", "10" 등
 *   - "X미만" (절대평가 9등급): "10미만", "20미만", "5미만" 등
 *
 * `z.string()` 로 받아서 normalizer 단계에서 cut_score(int|null) +
 * cut_score_upper_bound(int|null) 로 분기.
 */
export const CsatGradeCutRowSchema = z.object({
  등급: z.coerce.number().int().gte(1).lte(9),
  과목: z.string().min(1),
  // 빈 문자열 허용 — KICE 가 통계적 노출 보호로 일부 소수 학과 컷을 미공시 (수산·해운 등).
  "구분 점수": z.string(),
  "인원(명)": z.coerce.number().int().nonnegative().optional(),
  "비율(퍼센트)": z.coerce.number().nonnegative().optional(),
});
export type CsatGradeCutRow = z.infer<typeof CsatGradeCutRowSchema>;

/* ─── grade_type 판정 + cut_score 파싱 ──────────────────────────────── */

/**
 * 절대평가 subject 판정 — 현행 수능 제도 (2026학년도 기준):
 *   - 영어 (2018학년도부터 절대평가)
 *   - 한국사 (2017학년도부터 절대평가)
 *   - 제2외국어/한문 (2022학년도부터 절대평가):
 *     독일어/프랑스어/스페인어/중국어/일본어/러시아어/아랍어/베트남어 Ⅰ + 한문 Ⅰ
 *
 * ⚠️ 탐구 영역 (사회탐구·과학탐구·직업탐구) 은 모두 **상대평가**:
 *   물리학 Ⅰ/Ⅱ, 화학 Ⅰ/Ⅱ, 생명과학 Ⅰ/Ⅱ, 지구과학 Ⅰ/Ⅱ ← absolute 아님
 *   "Ⅰ/Ⅱ" 로 끝난다고 절대평가가 아님. 명시적 화이트리스트 사용.
 */
const ABSOLUTE_SECOND_LANGUAGE_PREFIXES = [
  "독일어", "프랑스어", "스페인어", "중국어", "일본어",
  "러시아어", "아랍어", "베트남어",
];

export function isAbsoluteGradeSubject(subject: string): boolean {
  const s = subject.trim();
  if (s === "영어" || s === "한국사") return true;
  if (s === "한문 Ⅰ" || s.startsWith("한문 ")) return true;
  for (const prefix of ABSOLUTE_SECOND_LANGUAGE_PREFIXES) {
    if (s.startsWith(prefix + " ")) return true; // "독일어 Ⅰ" 등
  }
  return false;
}

/**
 * "구분 점수" 셀 파싱 — 숫자 또는 "X미만" → { cutScore, upperBound }.
 *   "133"       → { cutScore: 133, upperBound: null }
 *   "10미만"     → { cutScore: null, upperBound: 10 }
 */
export function parseCutScoreCell(raw: string): { cutScore: number | null; upperBound: number | null } {
  const trimmed = raw.trim();
  const lessThanMatch = trimmed.match(/^(\d+)\s*미만$/);
  if (lessThanMatch) {
    return { cutScore: null, upperBound: parseInt(lessThanMatch[1], 10) };
  }
  const n = parseInt(trimmed, 10);
  if (Number.isFinite(n)) return { cutScore: n, upperBound: null };
  // 알 수 없는 형식 — 호출 측에서 검증 실패 처리
  return { cutScore: null, upperBound: null };
}

/** 연도별 응시현황 row */
export const CsatAttendanceRowSchema = z.object({
  학년도: z.coerce.number().int().gte(1990).lte(2099),
  시험일정: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  "지원인원(명)": z.coerce.number().int().nonnegative(),
  "응시인원(명)": z.coerce.number().int().nonnegative(),
  "응시율(퍼센트)": z.coerce.number().min(0).max(100),
});
export type CsatAttendanceRow = z.infer<typeof CsatAttendanceRowSchema>;

/* ═══════════════════════════════════════════════════════════════════════
   파일 → row[] (CP949 → UTF-8 + Papa Parse + Zod 검증)
   ═══════════════════════════════════════════════════════════════════════ */

export interface ParseResult<T> {
  rows: T[];
  invalidRows: Array<{ rowNumber: number; reason: string; raw: unknown }>;
  parseErrors: Papa.ParseError[];
}

function loadCp949File(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return iconv.decode(buf, "cp949");
}

/** 일반 파서 — 입력 CSV 텍스트 + Zod 스키마 */
function parseCsv<T extends z.ZodTypeAny>(
  csvText: string,
  schema: T,
): ParseResult<z.infer<T>> {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    // KICE 헤더는 trailing space 가 자주 있음 ("학년도 ", "지원인원(명) ")
    transformHeader: (h) => h.trim(),
  });

  const rows: z.infer<T>[] = [];
  const invalidRows: ParseResult<z.infer<T>>["invalidRows"] = [];
  parsed.data.forEach((rawRow, idx) => {
    const trimmed: Record<string, string> = {};
    for (const [k, v] of Object.entries(rawRow)) {
      trimmed[k.trim()] = typeof v === "string" ? v.trim() : v;
    }
    const result = schema.safeParse(trimmed);
    if (result.success) rows.push(result.data as z.infer<T>);
    else invalidRows.push({ rowNumber: idx + 2, reason: result.error.message, raw: trimmed });
  });

  return { rows, invalidRows, parseErrors: parsed.errors };
}

/** 등급구분/표준점수 CSV 파일 → row[] */
export function parseCsatGradeCutsCsvFile(filePath: string): ParseResult<CsatGradeCutRow> {
  return parseCsv(loadCp949File(filePath), CsatGradeCutRowSchema);
}

/** 응시현황 CSV 파일 → row[] */
export function parseCsatAttendanceCsvFile(filePath: string): ParseResult<CsatAttendanceRow> {
  return parseCsv(loadCp949File(filePath), CsatAttendanceRowSchema);
}

/* ═══════════════════════════════════════════════════════════════════════
   파일명 → exam metadata 유추
   ═══════════════════════════════════════════════════════════════════════ */

export interface ExamMeta {
  examKind: "main" | "mock_jun" | "mock_sep" | "mock_other";
  /** 학년도 (예: 2026 = 2025-11 실시 본수능). 시행일 연도 +1 (11월 이후) 또는 그대로. */
  examYear: number;
  /** 시행일자 yyyy-mm-dd */
  examDate: string;
}

/**
 * 파일명 → exam metadata 추출.
 *   "..._대학수학능력시험 등급구분_표준점수_20251130.csv"
 *      → main / 2026학년도 / 2025-11-30
 *   "..._대학수학능력시험 모의평가 등급구분_표준점수_20250930.csv"
 *      → mock_sep / 2026학년도 / 2025-09-30
 */
export function detectExamMetaFromFilename(filename: string): ExamMeta | undefined {
  const dateMatch = filename.match(/(\d{4})(\d{2})(\d{2})/);
  if (!dateMatch) return undefined;
  const [_, y, m, d] = dateMatch;
  const dateNum = parseInt(m + d, 10);
  const examDate = `${y}-${m}-${d}`;
  const month = parseInt(m, 10);

  let examKind: ExamMeta["examKind"];
  if (filename.includes("모의평가")) {
    if (month === 6) examKind = "mock_jun";
    else if (month === 9) examKind = "mock_sep";
    else examKind = "mock_other";
  } else {
    examKind = "main";
  }
  // 11월 이후 시행은 다음 학년도, 6/9월 모의평가는 같은 학년도 + 1
  const yearNum = parseInt(y, 10);
  const examYear = month >= 9 || (month === 11 && dateNum >= 1101) ? yearNum + 1 : yearNum + 1;

  return { examKind, examYear, examDate };
}

/* ═══════════════════════════════════════════════════════════════════════
   테스트 헬퍼
   ═══════════════════════════════════════════════════════════════════════ */

export const __test__ = {
  CsatGradeCutRowSchema,
  CsatAttendanceRowSchema,
  parseCsv,
};
