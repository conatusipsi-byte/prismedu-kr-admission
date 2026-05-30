/**
 * PDF Vision ETL 출력 타입 — 2026-05-30.
 *
 * Claude 가 PDF 모집요강 → 본 스키마 JSON 으로 추출. 추출 후 mapping/track-kind.ts 와
 * 결합해 conatus department_admissions 행으로 변환.
 *
 * 정직성 (P-005):
 *   - null 은 "PDF 에 정보 없음" 의미 (가짜 데이터 X).
 *   - warnings 에 신뢰도 낮은 추출 표시.
 */

import { z } from "zod";

/** 어디가 trackType 표기 (track-kind.ts 매핑과 일치) */
export const TrackTypeRawSchema = z.enum([
  "학생부위주(교과)",
  "학생부위주(종합)",
  "논술위주",
  "실기/실적위주",
  "수능위주",
  "기타",
]);

export const RecruitmentPeriodRawSchema = z.enum([
  "수시",
  "정시(가)",
  "정시(나)",
  "정시(다)",
  "추가",
  "기타",
]);

/**
 * 단계별 반영비율.
 *   stageLabel: "1단계" | "2단계" | "최종" 등 모집요강 표기 그대로.
 *   multiplier: "5배수" → 5. 없으면 null.
 *   components: { 학생부: 100, 면접: 30, ... } — 키는 한국어. 값은 percent (0~150).
 */
export const ReflectionStageSchema = z.object({
  stageLabel: z.string(),
  multiplier: z.number().nullable(),
  components: z.record(z.string(), z.number()),
  /**
   * 단계 만점 — PDF 표가 200 (1단계 성적 100 + 면접 100) 식 raw 점수로 표기된 경우 명시.
   *   - undefined / null: 합산이 100이라 추정 (percent 표기).
   *   - 200, 300, 1000 등: raw 점수 표기. 매칭 단계에서 정규화.
   */
  stageMaxScore: z.number().nullable().optional(),
});

/** 전년도 입결 — 모집요강 본문에 있을 때만 채움. */
export const PrevYearResultSchema = z.object({
  cutoffGrade: z.number().nullable().describe("교과·학종 등급 컷 (1~9, 낮을수록 우수)"),
  cutoffPercentile: z.number().nullable().describe("정시 환산점수·백분위 컷 (0~100)"),
  competitionRate: z.number().nullable().describe("경쟁률 (지원자 ÷ 모집인원)"),
  rawText: z.string().nullable().describe("PDF 원문 인용 (검증용)"),
}).nullable();

/** 단일 전형(track) 추출 결과 */
export const RawTrackSchema = z.object({
  trackName: z.string().describe("전형 정식명, 예: '지역균형전형'·'학업우수전형'·'논술우수자전형'"),
  trackTypeRaw: TrackTypeRawSchema,
  recruitmentPeriodRaw: RecruitmentPeriodRawSchema,
  /** 정원외 특별전형 키워드 (농어촌·기회균형·재외국민·특성화고 등) — 일반전형이면 null */
  specialTypeKeyword: z.string().nullable(),
  quotaInitial: z.number().int().nonnegative().nullable(),
  applicationQualification: z.string().nullable().describe("지원자격 자유텍스트 (요약)"),
  // reflectionStages 는 PDF 에 표가 없으면 null 도 허용 (요약 페이지 케이스).
  reflectionStages: z.array(ReflectionStageSchema).nullable(),
  csatMinimumRawText: z.string().nullable().describe("수능 최저 원본 텍스트"),
  /**
   * 수능 최저 명시적 "미적용" 여부 — 데이터 없음(null)과 미적용(true)을 구분 (P-002).
   *   - true: PDF 에 "수능최저 미적용" 또는 "수능 최저학력기준 적용하지 않음" 명시.
   *   - false: PDF 에 수능최저가 명시되어 있음 (csatMinimumRawText 채워짐).
   *   - null: 본 청크에 그 전형의 수능최저 관련 정보가 없음 (다른 페이지 가능성).
   */
  csatMinimumExempt: z.boolean().nullable().describe("PDF가 '수능최저 미적용' 으로 명시 시 true. 정보 없으면 null."),
  csatRequiredAreasRawText: z.string().nullable().describe("수능 응시영역 기준 원본"),
  prevYearResult: PrevYearResultSchema,
  /**
   * 출처 페이지 — 사용자가 PDF 열어 1:1 대조하기 위한 필수 필드 (2026-05-30 강화).
   *   - 추출 데이터가 등장한 PDF 페이지 번호 (1-indexed, 모집요강 PDF 기준).
   *   - 표 행이 여러 페이지에 걸치면 가장 핵심 데이터 페이지를 선택.
   *   - 미상이면 null (하지만 추출했다면 페이지는 항상 알 수 있어야 함).
   */
  sourcePages: z.array(z.number().int().positive()).describe("이 전형 데이터가 등장한 PDF 페이지 번호 (1-indexed)"),
});

/** 단일 학과 추출 결과 */
export const RawDepartmentSchema = z.object({
  departmentName: z.string().describe("학과 정식명, 예: '컴퓨터공학부'·'의예과'·'경영학과'"),
  campus: z.string().nullable().describe("캠퍼스명 (본교는 null)"),
  /** 어디가 분류 보조 — 인문/사회/자연/공학/의약/예체능/광역 등 */
  trackHint: z.string().nullable(),
  totalQuotaHint: z.number().int().nonnegative().nullable().describe("학과 전체 모집인원 (전형 합)"),
  tracks: z.array(RawTrackSchema),
});

/** PDF 1개 분석 결과 */
export const PdfAnalysisResultSchema = z.object({
  universityName: z.string(),
  year: z.number().int().min(2025).max(2099),
  recruitmentSeason: z.enum(["susi", "jeongsi"]),
  departments: z.array(RawDepartmentSchema),
  /** 추출 시 신뢰도 낮거나 모호한 케이스 */
  warnings: z.array(z.string()),
});

export type TrackTypeRaw = z.infer<typeof TrackTypeRawSchema>;
export type RecruitmentPeriodRaw = z.infer<typeof RecruitmentPeriodRawSchema>;
export type ReflectionStage = z.infer<typeof ReflectionStageSchema>;
export type RawTrack = z.infer<typeof RawTrackSchema>;
export type RawDepartment = z.infer<typeof RawDepartmentSchema>;
export type PdfAnalysisResult = z.infer<typeof PdfAnalysisResultSchema>;
