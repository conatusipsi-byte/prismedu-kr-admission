/**
 * 한국 대학 입시 도메인 — Firestore 스키마 타입 정의
 *
 * 컬렉션 구조 (자세한 설명은 docs/schema.md):
 *   universities/{uid}
 *     departments/{did}
 *       admissions/{year}
 *   users/{uid}
 *     specs/{specId}
 *     entitlements/{eid}
 *   admissionResults/{rid}      (root)
 *   orders/{orderId}            (root)
 *
 * 자소서 영역(essays)은 처음부터 제외 — 한국 입시는 24학번부터 자소서 폐지.
 *
 * prismedu.kr(US 입시)의 lib/matching.ts와 호환:
 *   - School/Specs를 직접 재사용하지 않고, 어댑터(toLegacyShape)로 매핑한다.
 *   - 매칭 알고리즘 시그니처(matchSchools)는 그대로 두되, 한국 입시 등급 체계에 맞게
 *     계수만 재보정한다 (docs/migration.md 참조).
 */

/**
 * Firestore Timestamp 구조형 타입 — firebase/firestore (client) 와
 * firebase-admin/firestore (server) 양쪽 모두 호환되는 최소 인터페이스.
 *
 * 양쪽 SDK 의 Timestamp 클래스 인스턴스가 본 인터페이스에 구조적으로 부합하므로,
 * types/admission.ts 가 SDK 의존성 없이 순수 타입만 노출.
 *
 * 다른 메서드(toJSON·valueOf·isEqual)가 필요하면 SDK 별 캐스팅 후 사용.
 */
export interface Timestamp {
  readonly seconds: number;
  readonly nanoseconds: number;
  toDate(): Date;
  toMillis(): number;
}

/* ═══════════════════════════════════════════════════════════════════════
   공용 타입
   ═══════════════════════════════════════════════════════════════════════ */

/** 학년도 — 한국 입시는 입학연도 기준 (2027학년도 = 2026.11 수능 → 2027.3 입학) */
export type AdmissionYear = number;

/** 한국 시·도 (소재지) */
export type KoreanRegion =
  | "seoul" | "busan" | "daegu" | "incheon" | "gwangju" | "daejeon" | "ulsan" | "sejong"
  | "gyeonggi" | "gangwon" | "chungbuk" | "chungnam" | "jeonbuk" | "jeonnam"
  | "gyeongbuk" | "gyeongnam" | "jeju";

/** 석차등급 1~9 (낮을수록 우수) — 한국 내신·수능 등급 공통 */
export type Grade = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type SchoolYear = 1 | 2 | 3;
export type Semester = 1 | 2;

/* ═══════════════════════════════════════════════════════════════════════
   1. universities — 대학 마스터
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * 대학 분류 — UI 필터·매칭 가중치 기준
 *
 * - seoul_top: SKY·서성한·중경외시·건동홍 등 인서울 상위권
 * - seoul: 그 외 서울권 4년제
 * - national_flag: 거점국립대 (부산·경북·전남·충남·충북·전북·강원·제주, 서울대 별도)
 * - national_local: 그 외 지방국립
 * - private_local: 지방사립
 * - special: KAIST/POSTECH/GIST/UNIST/DGIST·사관학교 등 특수목적
 */
export type UniversityCategory =
  | "seoul_top" | "seoul" | "national_flag" | "national_local" | "private_local" | "special";

export interface Campus {
  /** 캠퍼스 슬러그 (e.g., "main", "sejong") */
  id: string;
  /** 캠퍼스명 (e.g., "신촌캠퍼스") */
  name: string;
  address: string;
  region: KoreanRegion;
  /** 본교 여부 — 분교/제2캠퍼스는 false */
  isMain: boolean;
}

export interface University {
  /** 도큐먼트 ID = 영문 슬러그 (e.g., "snu", "yonsei", "korea") */
  id: string;

  /** 한글 정식명 (e.g., "서울대학교") — prismedu.kr `School.n` 슬롯 호환 */
  n: string;
  nameEn?: string;
  /** 약칭 (e.g., "서울대") — 검색·UI용 */
  shortName?: string;
  /** 도메인 (e.g., "snu.ac.kr") — prismedu.kr `School.d` 호환 */
  d?: string;

  category: UniversityCategory;
  campuses: Campus[];

  /** 검색 결과 정렬용 우선순위 (작을수록 우선). 실제 "랭킹"이 아니라 큐레이션 값.
   *  prismedu.kr `School.rk` 슬롯 호환 — 매칭 알고리즘이 rank로 정렬할 때 사용. */
  rankOrder?: number;

  admissionGuideUrl?: string;
  admissionOfficeContact?: { phone?: string; email?: string };

  logoUrl?: string;
  websiteUrl?: string;

  /** 폐교/타교 통합 시 false. 데이터는 보존하되 검색·매칭에서 제외. */
  active: boolean;
  mergedInto?: string;
  closedNote?: string;

  updatedAt: Timestamp;
}

/* ═══════════════════════════════════════════════════════════════════════
   2. departments — 학과 (모집단위)
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * 계열 — 수능 탐구 영역 매핑·반영비율 결정에 사용
 *
 * - humanities: 인문 (국문·영문·사학 등)
 * - social: 사회 (경영·경제·심리·미디어 등)
 * - natural: 자연 (수학·물리·화학·생물 등)
 * - engineering: 공학 (전자·기계·컴퓨터·화공 등)
 * - medical: 의약 (의예·치의예·한의예·약학·수의예)
 * - arts: 예체능 (실기 위주)
 * - interdisciplinary: 자유전공/광역모집/계열모집
 */
export type Track =
  | "humanities" | "social" | "natural" | "engineering"
  | "medical" | "arts" | "interdisciplinary";

/**
 * 모집단위 종류
 * - department: 학과 단위 (e.g., 컴퓨터공학과)
 * - division: 학부 단위 (e.g., 전기전자공학부) — 1년 후 세부 학과 결정
 * - broadcast: 광역모집/계열모집 (e.g., 자연과학계열) — 입학 후 학과 선택
 */
export type AdmissionUnitType = "department" | "division" | "broadcast";

export interface Department {
  /** 슬러그 (e.g., "computer-science"). 부모 universityId 하위에서 unique */
  id: string;
  /** 부모 reference — collectionGroup 쿼리에서 필터링용 (denormalize) */
  universityId: string;
  /** 어느 캠퍼스 소속 — 같은 학과명도 캠퍼스별로 입결 다름 */
  campusId: string;

  /** 학과명 (e.g., "컴퓨터공학과") */
  name: string;
  nameEn?: string;

  unitType: AdmissionUnitType;
  track: Track;

  /** 연간 총 모집인원 (모든 전형 합) — 정확한 전형별 인원은 admissions/{year} 참조 */
  totalQuota: number;

  /** 광역모집의 경우 포함 학과 슬러그 목록 (1년 후 선택 트랙) */
  subDepartments?: string[];

  /** 의약/사범/약학 등 — 합격 추정 모델을 일반학과와 분리해야 함 */
  isProfessional?: boolean;
  professionalType?: "medical" | "dental" | "korean_medicine" | "pharmacy" | "veterinary" | "education" | "law";

  active: boolean;
  updatedAt: Timestamp;
}

/* ═══════════════════════════════════════════════════════════════════════
   3. admissions/{year} — 연도별 모집요강
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * 전형 종류
 *
 * 수시 (Susi) — 9~12월:
 *   - susi_subject:       학생부교과 (내신 위주)
 *   - susi_comprehensive: 학생부종합 (내신 + 비교과 + 면접)
 *   - susi_essay:         논술
 *   - susi_practical:     실기/실적 (예체능)
 *
 * 정시 (Jeongsi) — 12월~1월:
 *   - jeongsi_ga / jeongsi_na / jeongsi_da: 가/나/다군. 같은 군 내 두 대학 동시 지원 불가.
 *
 * 추가모집 — 2월:
 *   - additional: 미충원 대학 추가
 *
 * 재외국민·외국인 (P-013):
 *   - jaeoegukmin: 일반 한국 입시와 자격·평가 기준이 분리됨. 별도 라우트 처리.
 *     수시·정시 어느 군에도 묶이지 않으며 모집 시점도 다름.
 */
export type AdmissionTrackKind =
  | "susi_subject" | "susi_comprehensive" | "susi_essay" | "susi_practical"
  | "jeongsi_ga" | "jeongsi_na" | "jeongsi_da"
  | "additional"
  | "jaeoegukmin";

/**
 * 특별전형 구분 — 정원외 모집 식별용
 * - general: 일반전형 (정원내)
 * - agricultural: 농어촌
 * - low_income: 기회균형 (저소득·국가보훈)
 * - overseas: 재외국민
 * - etc: 그 외 특별전형 (e.g., 특성화고 출신)
 */
export type SpecialAdmissionType = "general" | "agricultural" | "low_income" | "overseas" | "etc";

/** 수능 영역 */
export type CsatArea = "korean" | "math" | "english" | "investigation" | "history" | "second_lang";

/** 점수 종류 — 같은 학과여도 영역별로 다를 수 있음 (e.g., 국어=표준, 탐구=백분위) */
export type ScoreType = "standard" | "percentile" | "converted_standard";

/**
 * 단계별 전형 구성
 *
 * 예시:
 *   학종 1단계 (서류 100%, 3배수 통과)
 *   학종 2단계 (1단계 70% + 면접 30%)
 *
 * 평가 요소 합 = 100 (검증은 서버 ETL에서)
 */
export interface AdmissionStage {
  step: 1 | 2 | 3;
  /** 통과 배수 — 1단계 3배수면 quotaInitial × 3명이 2단계 진출 */
  multiplier?: number;
  /** 평가 요소 비중 (%) — 합 = 100 */
  components: {
    /** 학생부 (교과 등급) */
    schoolRecord?: number;
    /** 학생부 (비교과) */
    schoolActivity?: number;
    /** 서류 종합 (학종에서 schoolRecord+schoolActivity 합산 표기) */
    document?: number;
    interview?: number;
    csat?: number;
    practical?: number;
    essay?: number;
  };
}

/**
 * 수능최저 자동판정 복잡도
 *
 * 결정 (2026-05): 단순 케이스(합·평균)만 자동 판정, 복잡 조건은 텍스트 표시.
 *
 * - simple_sum:    "후보 영역 중 N개 합 X 이내" — 자동 판정 ✅
 * - simple_avg:    "특정 영역 평균 X 이내" — 자동 판정 ✅
 * - with_required: "수학·탐구 포함" 등 특정 영역 강제 포함 — 자동 판정 ❌
 * - conditional:   계열별·전공별로 다른 기준 적용 — 자동 판정 ❌
 * - custom:        그 외 — 자동 판정 ❌
 *
 * 자동 판정 불가 케이스는 UI에서 originalText 를 그대로 노출 + "수동 확인" 배지.
 */
export type CsatMinimumComplexity =
  | "simple_sum" | "simple_avg" | "with_required" | "conditional" | "custom";

/**
 * 수능최저학력기준
 *
 * 예 1 (simple_sum): "국·수·영·탐(1) 중 2개 합 5등급 이내, 한국사 4등급 이내"
 *   → candidateAreas=["korean","math","english","investigation"], requiredCount=2,
 *     sumGradeMax=5, historyGradeMax=4, investigationRule="one",
 *     complexity="simple_sum", autoEvaluable=true
 *
 * 예 2 (with_required): "국·수·영·탐(2평균) 중 3개 합 6, 수학 또는 탐구 포함"
 *   → complexity="with_required", autoEvaluable=false,
 *     originalText 그대로 UI 노출.
 *
 * 정시는 csatMinimum 없음 — 수능 점수 자체로 합격 산정.
 */
export interface CsatMinimum {
  /** 합산할 영역 후보 */
  candidateAreas: CsatArea[];
  /** 이 중 N개 영역의 등급을 합산 */
  requiredCount: number;
  /** 합산 등급 상한 (이하여야 충족) */
  sumGradeMax: number;
  /** 영어 절대평가 별도 기준 */
  englishGradeMax?: number;
  /** 한국사 별도 기준 (대부분 자격 — 인문 4 / 자연 5 등) */
  historyGradeMax?: number;
  /** 탐구 처리 — 한 과목만 / 두 과목 평균 / 두 과목 모두 충족 */
  investigationRule?: "one" | "two_avg" | "two_each";

  /** ETL이 분류한 자동판정 복잡도 */
  complexity: CsatMinimumComplexity;
  /** complexity가 simple_sum/simple_avg일 때만 true. evaluator는 false면 즉시 unknown 반환. */
  autoEvaluable: boolean;
  /** 모집요강 원문 (자동판정 불가 케이스에서 UI 노출용). 항상 보관. */
  originalText: string;

  /** 정형화 어려운 추가 조건 (자유 텍스트) — autoEvaluable=false인 경우 originalText와 함께 표시 */
  additionalRules?: string;
}

/**
 * 수능 응시영역기준 (B1, P0)
 *
 * `CsatMinimum`(최저학력기준)과 다른 차원 — 충족 못하면 **지원 자격 미달**.
 * 즉, 응시영역 미충족자는 csatMinimum 충족 여부와 무관하게 자동 탈락.
 *
 * 예 1 (서울대 자연계):
 *   - 수학: 미적분 또는 기하 중 1과목 응시 필수
 *   - 탐구: 과학탐구 2과목 응시 필수 (사회탐구 불인정)
 *
 * 예 2 (인문계):
 *   - 수학: 확률과통계 가능 (미적분/기하도 무방)
 *   - 탐구: 사탐 2 또는 사탐+과탐 또는 과탐 2 모두 가능
 *
 * 자동 판정 가능: 사용자 csat.korean.course / csat.math.course / csat.investigation[].type
 * 와 비교해 충족 여부 산출.
 */
export interface CsatRequiredAreas {
  /** 국어 — 화법과작문 / 언어와매체 중 인정되는 과목 */
  korean?: {
    courses: ("speech_writing" | "language_media")[];
    required: boolean;
  };
  /** 수학 — 확률과통계 / 미적분 / 기하 중 인정되는 과목 */
  math?: {
    courses: ("probability_statistics" | "calculus" | "geometry")[];
    required: boolean;
  };
  /** 영어 응시 필수 여부 */
  english: boolean;
  /** 한국사 응시 필수 여부 (보통 true) */
  history: boolean;
  /** 탐구 — 인정되는 종류와 응시 필수 과목 수 */
  investigation?: {
    types: ("social" | "science" | "vocational")[];
    requiredCount: number; // 보통 1 또는 2
  };
  /** 정형화 어려운 추가 룰 (자유 텍스트) */
  notes?: string;
}

/**
 * 변환점수 후공지 모델 (B2, P-012)
 *
 * 한국 정시는 모집요강 발표 시점(7~9월)에 변환표가 미정.
 * 수능 후(11월 말~12월) 대학별 변환표가 공지되며, ETL은 2단계로 운영:
 *   - 1차 (모집요강 시즌, 7~9월): status="preliminary", table 미존재
 *   - 2차 (수능 후, 12월): status="finalized", table 채움
 *
 * status="preliminary" 상태에서 사용자에게는 "변환표 후공지" 안내 노출.
 */
export interface ConversionTable {
  status: "preliminary" | "finalized" | "not_applicable";
  publishedAt?: Timestamp;
  /** 모집요강 또는 변환표 PDF URL */
  sourceUrl?: string;
  /** 변환점수 매핑 — 키: 과목명 (e.g., "물리학II"), 값: 변환표준점수 */
  table?: Record<string, number>;
}

/**
 * 학생부(교과) 환산표 (B3)
 *
 * 학교마다 다름:
 *   - 고려대: { 1: 100, 2: 96, 3: 92, ..., 9: 0 }
 *   - 다른 학교: 다른 분포
 *
 * AdmissionTrack 에 보유. 해당 전형이 학생부교과 반영 시 채움.
 */
export interface NaesinConversionTable {
  /** 등급 1~9 → 환산점수 */
  gradeToScore: Record<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9, number>;
  /** 학년별 가중치 합 = 1.0. 학년 가중치 없으면 균등(undefined). */
  yearWeights?: { y1: number; y2: number; y3: number };
  /**
   * 진로선택 환산 정책
   *   - korea_pattern: 성취도 A=1등급, B/C는 분포비율로 변환석차등급 산출
   *   - snu_pattern:   서울대 패턴 (별도)
   *   - custom:        모집요강 본문 참조
   */
  careerSelectionPolicy?: "korea_pattern" | "snu_pattern" | "custom";
  /** 수강자 수 조정등급 — 수강자 N명 미만이면 등급 X 이상 인정 */
  cohortAdjustment?: { thresholdCount: number; minGrade: number };
}

/**
 * 재외국민·외국인 전형 자격 (B8, P-013)
 *
 * 일반 한국 입시(susi_*, jeongsi_*)와 자격·평가 기준이 분리됨.
 * AdmissionTrack.kind === "jaeoegukmin" 일 때만 채움.
 */
export interface JaeoegukminEligibility {
  /** 분류 */
  category:
    | "overseas_korean"        // 재외국민 (한국 국적, 부모와 본인 해외 거주)
    | "foreigner"              // 외국인 (외국 국적자)
    | "foreign_education_12yr" // 12년 외국 교육과정 이수자
    | "north_korean_defector"; // 북한이탈주민 (별도 카테고리지만 jaeoegukmin과 묶이는 학교 있음)
  /** 해외 거주 최소 기간 (개월) */
  minOverseasMonths?: number;
  /** 부모 동반 거주 요구 여부 */
  parentResidence?: boolean;
  /** 외국 국적 요구 여부 */
  foreignNationality?: boolean;
  /** 외국 학교 졸업 학년 요구 (예: 12년) */
  foreignSchoolYears?: number;
  /** TOEFL·SAT·IELTS 등 어학·표준화 시험 요구 */
  standardizedTestRequired?: boolean;
  /** 정형화 어려운 추가 자격 (자유 텍스트). 학교마다 세부 차이 큼. */
  notes?: string;
}

/**
 * 영역별 반영비율 (정시·논술·교과 등에서 사용)
 *
 * 합산 정책:
 *   - 비율 합이 항상 100인 것은 아님 (예: 서울대 정시 국 100 + 수 120 + 탐 80 = 300).
 *     ETL은 모집요강 표기 그대로 보유. 매칭 알고리즘이 정규화.
 *
 * 영역마다 점수 종류가 다른 대학이 있어 영역별 ScoreType 별도 보유.
 *
 * gradeMap polarity (P-010):
 *   - 양수 = 가산점, 음수 = 감점
 *   - ETL은 모집요강의 "감점" 표현을 음수로 변환해 저장
 *   - 예: 영어 "1등급 0, 2등급 -0.5, 3등급 -2.0" (감점 모델)
 *   - 예: 일부 학교 "1등급 100, 2등급 95" (가산 모델)
 */
export interface ReflectionRatio {
  korean: { ratio: number; scoreType: ScoreType };
  math: { ratio: number; scoreType: ScoreType };
  english: { ratio: number; gradeMap?: Record<number, number> };
  investigation: { ratio: number; scoreType: ScoreType };
  history?: { ratio: number; gradeMap?: Record<number, number> };
  /** 수학·탐구 선택과목별 가산점 (e.g., 미적분 +5, 과탐II +3) */
  bonusByCourse?: Record<string, number>;
  /**
   * 과학탐구 응시 조합별 조정점수 (B4).
   * 예: { "I+I": 0, "I+II": 3, "II+II": 5 } — 서울대 정시 자연계 패턴
   * 키 형식: 응시한 두 과목의 레벨 정렬 ("I+I" / "I+II" / "II+II")
   */
  investigationCombinationBonus?: Record<"I+I" | "I+II" | "II+II", number>;
}

/**
 * 전년도 입결 — 합격선 추정 1차 prior
 *
 * 단계별 전형은 stage별 컷을 보유해야 함 (학종 1단계 컷과 최종 컷은 다름).
 * 학종 분해 표시(결정 ⑤)를 위해 stage1ApplicantCount·stage1PassRate 등 추가 필드 보유.
 */
export interface PrevYearResult {
  /** 경쟁률 = 지원자 ÷ 모집인원 */
  competitionRate?: number;
  /** 정시 환산점수 컷 — 70%컷·50%컷·평균 (대학 공시 형식 기준) */
  cutoff70?: number;
  cutoff50?: number;
  cutoffAvg?: number;
  /** 학종·교과 — 내신 등급 컷 (낮을수록 우수) */
  gradeCutoff70?: number;
  gradeCutoffAvg?: number;

  /** 학종 1단계 — 서류 통과 컷 (점수 또는 등급) */
  stage1Cutoff?: number;
  stage1GradeCutoff?: number;
  /** 학종 1단계 — 지원자 수, 통과 인원, 통과율 (1단계 통과 확률 베이스라인) */
  stage1ApplicantCount?: number;
  stage1PassCount?: number;
  /** 학종 2단계 — 1단계 통과자 중 최종 합격률 (면접 통과율 baseline) */
  stage2PassRate?: number;

  notes?: string;
}

/** 단일 전형 */
export interface AdmissionTrack {
  /** 전형 정식명 (e.g., "지역균형전형", "논술우수자전형") — 대학마다 명칭 다름 */
  name: string;
  kind: AdmissionTrackKind;
  specialType: SpecialAdmissionType;

  /** 모집인원 (모집요강 발표 시점) */
  quotaInitial: number;
  /** 수시 미충원 이월 후 — 정시 트랙에서만 의미 있음. ETL이 1월 하순에 갱신. */
  quotaFinal?: number;

  stages: AdmissionStage[];

  /** 수능최저 (수시 only) */
  csatMinimum?: CsatMinimum;

  /** 수능 응시영역기준 (B1, P0) — 미충족 시 자격 미달 (csatMinimum 과 다른 차원) */
  requiredAreas?: CsatRequiredAreas;

  /** 정시·논술·교과의 영역별 반영 */
  reflectionRatio?: ReflectionRatio;

  /** 변환점수 후공지 (B2, P-012) — 정시 트랙에서 주로 사용 */
  conversionTable?: ConversionTable;

  /** 학생부 환산표 (B3) — 학생부교과·학종 트랙에서 주로 사용 */
  naesinConversion?: NaesinConversionTable;

  /** 재외국민·외국인 자격 (B8, P-013) — kind === "jaeoegukmin" 일 때만 채움 */
  jaeoegukminEligibility?: JaeoegukminEligibility;

  /** 일정 — ISO date string */
  schedule?: {
    applicationStart?: string;
    applicationEnd?: string;
    documentDeadline?: string;
    interviewDate?: string;
    practicalDate?: string;
    announcementDate?: string;
  };

  /** 정형화 어려운 메모 (가산점 정책, 면접 형식, 결격 사유 등) */
  notes?: string;
}

/**
 * 학과별·연도별 모집요강 (단일 도큐먼트)
 *
 * 인덱스 친화 필드:
 *   - availableTrackKinds: AdmissionTrackKind[] → array-contains 인덱스 가능
 *     (Firestore는 dynamic key 인덱스 불가이므로 tracks를 직접 인덱스 못 함)
 */
export interface DepartmentAdmissions {
  /** 도큐먼트 ID = year (4자리 학년도, e.g., "2027") */
  id: string;
  universityId: string;
  departmentId: string;
  year: AdmissionYear;

  /** 전형별 묶음 — 한 학과가 같은 kind 내 복수 전형 운영 가능 (e.g., 학종 일반 + 학종 지역균형) */
  tracks: Partial<Record<AdmissionTrackKind, AdmissionTrack[]>>;

  /** 인덱스 보조 필드 — 어떤 전형이 있는지 빠르게 필터링 */
  availableTrackKinds: AdmissionTrackKind[];

  /** 전년도 입결 (전형별 통합 또는 대표 전형 1개; 상세는 track.notes) */
  prevYearResult?: PrevYearResult;

  /** 모집요강 출처 — 재파싱 reproducibility */
  source: {
    url?: string;
    publishedAt?: Timestamp;
    parsedAt: Timestamp;
    parserVersion: string;
  };

  updatedAt: Timestamp;
}

/* ═══════════════════════════════════════════════════════════════════════
   4. users/{uid}/specs — 사용자 입력 스펙
   ═══════════════════════════════════════════════════════════════════════ */

export type SubjectArea = "korean" | "math" | "english" | "social" | "science" | "history" | "etc";

/**
 * 영역별 점수
 * - 표준점수·백분위·등급 동시 보유 (대학마다 어떤 걸 반영할지 다르므로 모두 저장)
 */
export interface AreaScore {
  /** 표준점수 — 평균 100, 표준편차 20 정도. 영역별 분포 다름. */
  standard?: number;
  /** 백분위 (0~100, 높을수록 우수) */
  percentile?: number;
  /** 등급 1~9 (낮을수록 우수) */
  grade: Grade;
  /** 원점수 (선택) */
  rawScore?: number;
}

/**
 * 수능/모의 점수
 *
 * 영어·한국사는 절대평가 → 등급만.
 * 탐구는 1~2과목 응시 (보통 2과목), 과목별로 보관.
 */
export interface CsatScore {
  /** true = 본 수능, false = 학평/모평 */
  actual: boolean;
  /** ISO date — e.g., "2026-11-13" */
  takenAt: string;

  korean: AreaScore & { course?: "speech_writing" | "language_media" };
  math: AreaScore & { course?: "calculus" | "probability_statistics" | "geometry" };
  english: { grade: Grade };
  history: { grade: Grade };
  /** 탐구 — 보통 2과목, 사회/과학/직업 */
  investigation: Array<AreaScore & {
    course: string; // e.g., "생활과윤리", "사회문화", "물리학I"
    type: "social" | "science" | "vocational";
  }>;
  secondLang?: AreaScore & { course: string };
}

/**
 * 학력평가/모의평가 — CsatScore와 같은 구조이지만 별도 타입으로 출처 구분
 */
export interface MockExam {
  /** monthly = 시도교육청 학평, evaluation = 평가원 모평, private = 사설 */
  type: "monthly" | "evaluation" | "private";
  takenAt: string;
  scores: Pick<CsatScore, "korean" | "math" | "english" | "history" | "investigation">;
}

/**
 * 내신 (학생부 교과)
 *
 * 한국 내신은 단위수 가중평균 등급 (1.00~9.00, 낮을수록 우수).
 * 진로선택 과목은 절대평가(A/B/C)이므로 일반선택과 분리 저장.
 */
export interface SchoolRecord {
  /** 학년·학기별 등급 스냅샷 */
  gpaByTerm: Array<{
    schoolYear: SchoolYear;
    semester: Semester;
    /** 공통/일반선택 — 단위수 가중평균 등급 (1.00~9.00) */
    relativeGpa: number;
    /** 진로선택 환산값 (대학마다 환산식 다름 — UI에 표시할 단일 값. 원본 분포는 absoluteDistribution) */
    absoluteGpa?: number;
    /** 진로선택 A/B/C 분포 (단위수 합) — 대학별 환산식 적용을 위해 raw 보관 */
    absoluteDistribution?: { A: number; B: number; C: number };
    /** 단위수 합 — 가중평균 계산용 */
    totalUnits: number;
  }>;
  /** 교과별 평균 등급 — 학종에서 전공적합성 평가에 사용 (e.g., 컴공 지원 시 수학·과학 등급) */
  gpaBySubject?: Partial<Record<SubjectArea, number>>;
  /** 전체 가중평균 — 캐시 (gpaByTerm으로부터 재계산 가능) */
  gpaOverall?: number;
}

/**
 * 활동 정량 지표 (자율·동아리·봉사·진로 공통)
 */
export interface ActivityMetric {
  /** 누적 시간 */
  hours: number;
  /** 참여 횟수 */
  participationCount: number;
  /** 임원/대표 여부 */
  role?: "leader" | "member";
}

/**
 * 생기부 비교과 정량화
 *
 * 자소서 폐지(24학번~)로 활동의 양·질을 표현할 통로가 줄었기 때문에,
 * 이 정량 신호가 학종 합격 가능성 산출의 핵심 피처가 된다.
 *
 * 봉사·독서·수상은 24학번부터 대입 미반영 / 학기당 1개만 / 미반영이지만
 * 학종 평가관이 세특·행특을 통해 간접 평가하므로 데이터는 보관.
 */
export interface SchoolActivity {
  /** 자율활동 — 학급/학생회 임원, 자치활동 */
  autonomous?: ActivityMetric;
  /** 동아리 — 학년별 지속 여부가 학종에서 중요 */
  club?: ActivityMetric & { yearsPersistent: number };
  /** 봉사 — 24학번부터 개인봉사 미반영 (학교 주관만 인정) */
  volunteering?: ActivityMetric;
  /** 진로활동 — 전공적합성 핵심. majorAlignment는 사용자 자가평가(1~5). */
  career?: ActivityMetric & { majorAlignment: 1 | 2 | 3 | 4 | 5 };
  /** 세부능력 및 특기사항 (세특) — 학업역량의 가장 중요한 시그널 */
  detailedAbility?: {
    /** 학기별 기재 항목 수 합 */
    entriesCount: number;
    /** 진로 관련 기재 수 */
    majorRelatedCount: number;
    /** 사용자 주관 평가 (1~5). 객관 지표 부족할 때 보조. */
    qualityScore?: 1 | 2 | 3 | 4 | 5;
  };
  /** 행동특성 및 종합의견 (행특) — 담임 종합 기재 */
  behavioralCharacteristics?: { qualityScore?: 1 | 2 | 3 | 4 | 5 };
  /** 수상 — 24학번부터 학기당 1개만 대학 제출 */
  awards?: Array<{
    name: string;
    /** 학교/지역/전국/국제 */
    level: "school" | "district" | "national" | "international";
    year: SchoolYear;
  }>;
  /** 독서 — 24학번부터 미반영이지만 세특 연계 가능 */
  readingCount?: number;
}

/**
 * 지원 슬롯 — 수시 6장 / 정시 가·나·다 각 1장
 */
export interface AdmissionSlot {
  universityId: string;
  departmentId: string;
  trackKind: AdmissionTrackKind;
  /** 전형 정식명 — 같은 kind 내 복수 전형이 있을 때 식별 */
  trackName: string;
  /** 사용자 선호 순위 */
  priority: number;
  addedAt: Timestamp;
}

/**
 * 지원 의향 — 가/나/다군 중복지원 제한 검증용
 *
 * 검증 규칙:
 *   - susi.length <= 6
 *   - jeongsi.{ga,na,da} 각각 0 또는 1개
 *   - 같은 군에 두 대학 슬롯 불가 (구조상 자동)
 *   - 같은 대학이 가/나/다군에 학과를 분산 둘 수 있으므로 대학 중복은 허용 (다른 학과)
 *   - 단, 같은 군 내 같은 대학 다른 학과는 불가 → ga/na/da를 단일 슬롯으로 강제
 *
 * 이 검증은 클라이언트만으로 부족 — 결제·합격예측 트리거 시 서버에서 재검증.
 */
export interface AdmissionIntent {
  /** 수시 — 최대 6개 */
  susi: AdmissionSlot[];
  jeongsi: {
    ga?: AdmissionSlot;
    na?: AdmissionSlot;
    da?: AdmissionSlot;
  };
}

/**
 * 사용자 학업 스펙 — 시점별 스냅샷
 *
 * 같은 사용자가 학년·학기마다 새 specs 도큐먼트를 만들어 추이 추적.
 * 최신 1개만 매칭에 사용.
 */
export interface UserAcademicSpec {
  /** 입력 시점 */
  asOf: { schoolYear: SchoolYear; semester: Semester; recordedAt: Timestamp };

  schoolRecord: SchoolRecord;
  csat?: CsatScore;
  mockExams?: MockExam[];
  schoolActivity?: SchoolActivity;
  intent?: AdmissionIntent;

  /** 출신학교 유형 — 학종 합격 추정에 영향 */
  schoolType?: "general" | "autonomous" | "special_purpose" | "specialized";

  updatedAt: Timestamp;
}

/* ═══════════════════════════════════════════════════════════════════════
   5. admissionResults — 과거 합격 사례 (root collection)
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * 익명화된 합격 사례 — 코사인 유사도로 비슷한 케이스를 찾아
 * 합격선·합격 가능성을 추정하는 데 사용.
 *
 * 출처별 신뢰도:
 *   - self_report: 0.5 (검증 후 1.0 가능)
 *   - official_disclosure: 1.0 (대학 공시)
 *   - media: 0.7 (언론·합격수기)
 *
 * verified=true만 노출 (rules에서 강제).
 */
export interface AdmissionResult {
  id: string;

  universityId: string;
  departmentId: string;
  year: AdmissionYear;
  trackKind: AdmissionTrackKind;
  trackName: string;

  /** 결과 */
  outcome: "accepted" | "waitlist" | "rejected";
  /** 추가합격 차수 (있으면) */
  waitlistRank?: number;

  /** 학종 한정 — 1단계(서류) 통과 여부.
   *  outcome=rejected 라도 1단계 통과 표본은 stage1Pass 분포 학습에 사용. */
  passedStage1?: boolean;

  /** 합격자 익명 스펙 — 매칭 피처 벡터 원천 */
  specSnapshot: {
    schoolRecord?: {
      gpaOverall: number;
      gpaBySubject?: Partial<Record<SubjectArea, number>>;
    };
    csat?: {
      koreanStd?: number; mathStd?: number; englishGrade?: Grade;
      investigationStdAvg?: number; historyGrade?: Grade;
      koreanPct?: number; mathPct?: number; investigationPctAvg?: number;
    };
    /** 비교과 정량 점수 (0~100, 합산 추정값) */
    schoolActivity?: { score?: number };
    schoolType?: "general" | "autonomous" | "special_purpose" | "specialized";
  };

  /** 코사인 유사도용 정규화 벡터 — 서버(ETL/함수)에서 미리 계산. Firestore 인덱스 불가 → 메모리/Vector Search. */
  featureVector?: number[];

  /** 데이터 신뢰도 */
  confidence: number;
  source: "self_report" | "official_disclosure" | "media";

  /** 검증 상태 — verified=true만 노출 (rules) */
  verified: boolean;
  verifiedAt?: Timestamp;

  createdAt: Timestamp;
}

/* ═══════════════════════════════════════════════════════════════════════
   6. orders / entitlements — 단건결제 + 구독 호환
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * 상품 — 단건결제 우선이지만 구독 호환을 위해 같은 enum에 둠
 * 추후 subscription_pro/elite 추가는 코드 변경 없이 가능.
 */
export type ProductKind =
  | "report_one"
  | "season_pass"
  | "consult_one"
  | "subscription_pro"
  | "subscription_elite";

export type OrderStatus = "pending" | "approved" | "failed" | "refunded" | "cancelled";

/**
 * 주문 — 토스 orderId와 1:1
 *
 * paymentKey는 서버 전용 (rules로 클라 read 차단). 환불·분쟁 추적에만 사용.
 */
export interface Order {
  /** = 토스 호출 orderId. 형식: "ord_{ulid}" 또는 "{kind}_{billing}_{uid}_{ts}" */
  id: string;
  uid: string;

  productKind: ProductKind;
  /** 사용자 표시명 (e.g., "정시 컨설팅 1회") */
  productName: string;
  /** KRW */
  amount: number;

  status: OrderStatus;

  /** 결제 주기 — 단건은 "once", 구독 호환은 monthly/yearly */
  period: "once" | "monthly" | "yearly";

  /** 시즌권 등 효력 기간 */
  validFrom?: Timestamp;
  validUntil?: Timestamp;

  /** 토스 결과 메타 */
  payment?: {
    /** 서버 전용 — rules에서 클라 read 차단 필요 */
    paymentKey: string;
    method?: string;
    approvedAt?: string;
  };

  refund?: {
    refundedAt: Timestamp;
    amount: number;
    reason: string;
    cancelKey?: string;
  };

  /** 멱등성 추적 — 동일 키로 재요청 시 같은 결과 반환 */
  idempotencyKey?: string;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * 사용자 권한 — 단건/구독 통합 뷰
 *
 * 결제 승인 트랜잭션에서 active 배열에 추가.
 * 구독 전환 시 currentPlan을 pro/elite로 변경.
 */
export interface UserEntitlement {
  uid: string;
  active: Array<{
    orderId: string;
    productKind: ProductKind;
    validUntil?: Timestamp;
    grantedAt: Timestamp;
  }>;
  /** 구독 호환 — 현재 유효한 플랜 (free / pro / elite) */
  currentPlan: "free" | "pro" | "elite";
  /** 권한 출처 — 단건 누적인지 구독인지 */
  planSource: "free" | "one_time" | "subscription";
  updatedAt: Timestamp;
}

/* ═══════════════════════════════════════════════════════════════════════
   합격 사례 표본 집계 — 비공개 판정용 (결정: 표본 < 5는 비공개)
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * 학과·전형·연도별 합격사례 표본 집계
 *
 * 매번 admissionResults 컬렉션을 카운트하면 비싸므로 별도 집계 도큐먼트로 유지.
 * admissionResults write 또는 verified 변경 시 Cloud Function trigger로 갱신.
 *
 * 도큐먼트 ID 형식: `{universityId}_{departmentId}_{year}_{trackKind}`
 */
export interface AdmissionSampleStats {
  id: string;
  universityId: string;
  departmentId: string;
  year: AdmissionYear;
  trackKind: AdmissionTrackKind;

  /** verified=true 표본만 카운트 (단순 N) */
  verifiedCount: number;
  /** confidence 합 (자가보고 0.5 + 공식 1.0 등) — 가중 표본 N */
  weightedCount: number;
  /** outcome=accepted 만 카운트 (합격선 추정에 직접 사용) */
  acceptedCount: number;

  /** 학종 분해 — 1단계 통과 표본 (passedStage1=true) */
  stage1PassedCount?: number;
  /** 학종 분해 — 1단계 통과한 표본 중 최종 합격 (stage2 통과율 추정용) */
  stage2AcceptedCount?: number;

  updatedAt: Timestamp;
}

/* ═══════════════════════════════════════════════════════════════════════
   합격 확률 출력 (matching 알고리즘 결과 래퍼)
   ═══════════════════════════════════════════════════════════════════════ */

/** 일반 분류 + 표본 부족 별도 카테고리 (결정: 표본 < 5는 "표본 부족" 메시지) */
export type ProbabilityCategory =
  | "reach" | "hard_target" | "target" | "safety"
  | "insufficient_sample";

/**
 * 학종 합격 확률 — 1단계 × 2단계 분해 (결정: 분해 표시)
 *
 * combined = stage1Pass × stage2Pass
 *
 * 표본이 stage1/최종 둘 중 하나라도 부족하면 sampleSufficient=false,
 * 모든 확률 필드는 null. UI는 "표본 부족" 메시지로 폴백.
 */
export interface HakjongProbability {
  /** 서류 통과 확률 (1단계 컷 기준) — 0~1 */
  stage1Pass: number | null;
  /** 1단계 통과 가정 시 최종 합격 확률 (면접 영향 포함) — 0~1 */
  stage2Pass: number | null;
  /** 최종 합격 확률 = stage1Pass × stage2Pass — 0~1 */
  combined: number | null;
  /** UI 신뢰구간 — 0~1 */
  combinedLow: number | null;
  combinedHigh: number | null;

  /** 1단계 컷 기준 합격 표본 수 */
  stage1SampleN: number;
  /** 최종 컷 기준 합격 표본 수 */
  finalSampleN: number;

  /** 양쪽 표본 모두 ≥ 임계치일 때만 true */
  sampleSufficient: boolean;
}

/**
 * 합격 확률 단일 결과
 *
 * 학종(susi_comprehensive)일 때만 hakjong 필드 채워짐. 그 외는 단일 probability.
 * sampleSufficient=false → category="insufficient_sample", probability=null.
 */
export interface AdmissionProbability {
  category: ProbabilityCategory;
  /** 0~100 (insufficient_sample이면 null) */
  probability: number | null;
  low: number | null;
  high: number | null;

  sampleSufficient: boolean;
  sampleN: number;
  weightedSampleN: number;

  /** 학종 전형에 한해 채워짐 */
  hakjong?: HakjongProbability;
}

/* ═══════════════════════════════════════════════════════════════════════
   지원 의향 검증 결과 (가/나/다군 트랜잭션 가드 출력)
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * 지원 의향 검증 에러 코드
 *
 * - susi_overflow:           수시 6장 초과
 * - jeongsi_group_collision: 같은 군에 두 슬롯 (구조상 차단되지만 client가 과거 도큐먼트 마이그레이션 시 발생 가능)
 * - duplicate_department:    같은 학과를 여러 슬롯에 등록 (수시 다중 전형 지원은 가능하나 동일 전형 중복은 금지)
 * - invalid_track_kind:      kind와 슬롯 위치 불일치 (e.g., susi 슬롯에 jeongsi_ga)
 * - cross_group_violation:   드물지만 일부 대학이 이중지원 금지 정책 → 데이터로 표현 시 검출
 */
export type AdmissionIntentError =
  | { code: "susi_overflow"; current: number; max: 6 }
  | { code: "jeongsi_group_collision"; group: "ga" | "na" | "da"; universityIds: string[] }
  | { code: "duplicate_department"; universityId: string; departmentId: string; trackKinds: AdmissionTrackKind[] }
  | { code: "invalid_track_kind"; slot: AdmissionSlot; expected: "susi" | "jeongsi_ga" | "jeongsi_na" | "jeongsi_da" }
  | { code: "cross_group_violation"; universityId: string; reason: string };

export interface AdmissionIntentValidation {
  valid: boolean;
  errors: AdmissionIntentError[];
}

/* ═══════════════════════════════════════════════════════════════════════
   prismedu.kr 호환 어댑터 (lib/matching.ts와 호환)
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * prismedu.kr `School` 인터페이스 호환 형태.
 * 매칭 알고리즘(matchSchools)이 그대로 동작하도록 University+Department+Track을 평탄화.
 *
 * 변환 함수는 src/lib/admissions/adapter.ts에서 구현 예정.
 */
export interface LegacySchoolShape {
  /** University.n + " " + Department.name */
  n: string;
  /** University.rankOrder */
  rk: number;
  /** PrevYearResult.competitionRate에서 역산한 합격률 (1/competitionRate * 100) */
  r: number;
  /** [정시 환산 cutoff70, cutoff50] — 표준점수 기반 */
  sat: number[];
  /** PrevYearResult.gradeCutoffAvg (낮을수록 우수, US gpa와 polarity 반대 — 역수 처리) */
  gpa: number;
  /** University.shortName 또는 ID */
  c: string;
  /** University.d */
  d: string;
  /** University.region */
  loc?: string;
  /** Department.track */
  setting?: string;
  /** active=false면 true */
  closed?: boolean;
  /** 이하 매칭 알고리즘이 채우는 computed 필드 — prismedu.kr와 동일 */
  prob?: number;
  lo?: number;
  hi?: number;
  cat?: string;
  academicIdx?: number;
}
