/**
 * adiga.kr ETL 도메인 타입 (2026-05-30).
 *
 * 도큐먼트 매핑:
 *   adiga 학과 → conatus departments
 *   adiga 전형 → conatus department_admissions.tracks[trackKind][]
 *
 * 원시(raw) 데이터 → 정규화(normalized) 단계 분리:
 *   - AdigaRawTrack: HTML 에서 추출한 원본 (한국어 그대로)
 *   - 그 후 mapping.ts 가 conatus AdmissionTrack 형식으로 정규화.
 */

/** 어디가 학교 식별자 — 7자리 zero-padded 숫자 (예: "0000019" = 서울대) */
export type AdigaUnvCd = string;
/** 어디가 모집단위(학과) 식별자 — 7자리 영숫자 (예: "0253879") */
export type AdigaRuCd = string;

/** 어디가 → conatus 매핑 한 row */
export interface UniversityMapping {
  /** conatus universities.id (e.g., "snu") */
  conatusId: string;
  /** 한글 정식명 */
  conatusName: string;
  /** 어디가 unvCd */
  adigaUnvCd: AdigaUnvCd;
  /** 어디가 표기명 */
  adigaName: string;
  /** 매핑 정확도 — exact / inferred / manual */
  confidence: "exact" | "inferred" | "manual";
  /** 본교/분교 구분 (분교는 별도 unvCd) */
  campusKind?: "main" | "branch";
  /** 매핑 메모 (이름 불일치 사유 등) */
  notes?: string;
}

/** 학과(모집단위) 매핑 */
export interface DepartmentMapping {
  /** conatus universities.id */
  universityId: string;
  /** conatus departments.id */
  departmentId: string;
  /** conatus 학과명 */
  conatusName: string;
  /** 어디가 ruCd */
  adigaRuCd: AdigaRuCd;
  /** 어디가 표기 학과명 */
  adigaName: string;
  /** 매핑 정확도 */
  confidence: "exact" | "fuzzy" | "manual";
  /** 어디가에 있지만 conatus DB 에 없는 경우 — unmapped 리포트용 */
  unmapped?: boolean;
  notes?: string;
}

/**
 * 어디가에서 추출한 원본 전형 정보.
 *
 * fields 는 모집요강 표기 그대로 보존 (한국어). mapping.ts 가 정규화·번역.
 * "정보 없음" / "-" → null (P-005 정직성 — 가짜 데이터 X).
 */
export interface AdigaRawTrack {
  /** 전형 정식명 (e.g., "지역균형전형", "학업우수전형", "논술우수자전형") */
  trackName: string;
  /** 어디가 분류 — '학생부위주(교과)', '학생부위주(종합)', '논술위주', '실기/실적위주', '수능위주', '기타' */
  trackTypeRaw: string;
  /** 모집시기 — '수시', '정시(가)', '정시(나)', '정시(다)', '추가', '기타' */
  recruitmentPeriodRaw: string;
  /** 모집인원 — 없으면 null */
  quotaInitial: number | null;
  /** 지원자격 (자유 텍스트) */
  applicationQualification: string | null;
  /** 단계별 반영비율 표 — { stageName: { item: percent } } */
  reflectionStages: Array<{
    stageLabel: string; // "1단계", "2단계", "최종" 등
    multiplier: number | null; // "5배수" → 5
    components: Record<string, number>; // {"학생부": 100, "면접": 30, ...}
  }>;
  /** 수능 최저 — 원본 텍스트 그대로 (자동판정은 별도 단계) */
  csatMinimumRawText: string | null;
  /** 수능 응시영역 기준 텍스트 */
  csatRequiredAreasRawText: string | null;
  /** 전년도 입결 (백분위 / 등급 등) */
  prevYearResult: {
    cutoffPercentile?: number | null;
    cutoffGrade?: number | null;
    competitionRate?: number | null;
    rawText: string | null;
  } | null;
  /** 어디가 detail URL — 재페치용 reproducibility */
  sourceUrl: string;
}

/**
 * 학과 단위로 모은 원본.
 * source.url 은 어디가 학과상세 URL.
 */
export interface AdigaRawDepartment {
  universityId: string; // conatus universities.id
  departmentId: string; // conatus departments.id
  year: number;
  adigaUnvCd: AdigaUnvCd;
  adigaRuCd: AdigaRuCd;
  /** 어디가에 표시된 학과명 */
  adigaDepartmentName: string;
  tracks: AdigaRawTrack[];
  source: {
    classUnivDetailUrl: string;
    parsedAt: string; // ISO
    parserVersion: string;
  };
  /** 파싱 시 발생한 경고 — 신뢰도 평가용 */
  warnings: string[];
}
