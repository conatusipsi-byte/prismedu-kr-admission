/**
 * 한국 입시 도메인 라벨 — i18n 호환 분리.
 *
 * 모든 한국어 사용자 노출 텍스트를 본 모듈에 모음. 추후 i18n 적용 시
 * lib/i18n/* 에서 ko/en 두 벌 매핑으로 분기.
 */

import type {
  AdmissionTrackKind,
  KoreanRegion,
  Track,
  UniversityCategory,
} from "@/types/admission";

/* ═══════════════════════════════════════════════════════════════════════
   AdmissionTrackKind — 7종 + 추가모집
   ═══════════════════════════════════════════════════════════════════════ */

export const TRACK_KIND_LABELS: Record<AdmissionTrackKind, string> = {
  susi_subject: "학생부교과",
  susi_comprehensive: "학생부종합",
  susi_essay: "논술",
  susi_practical: "실기",
  jeongsi_ga: "정시 가군",
  jeongsi_na: "정시 나군",
  jeongsi_da: "정시 다군",
  additional: "추가모집",
  jaeoegukmin: "재외국민·외국인",
};

/**
 * AdmissionTrackKind → 시각 토큰 색상 그룹.
 *
 * P-013: jaeoegukmin 은 별도 색상 (purple) — 다른 6종(수시 4 + 정시 3)과 시각 분리.
 * 회귀 테스트(p-001-policy.test.tsx)가 본 매핑이 정확히 분리됐는지 검증.
 */
export const TRACK_KIND_COLOR_TOKEN: Record<AdmissionTrackKind, string> = {
  susi_subject: "blue",
  susi_comprehensive: "indigo",
  susi_essay: "amber",
  susi_practical: "rose",
  jeongsi_ga: "emerald",
  jeongsi_na: "teal",
  jeongsi_da: "cyan",
  additional: "slate",
  jaeoegukmin: "purple", // P-013 — 별도 색상
};

/**
 * 사용자 진입점에서 jaeoegukmin 을 디폴트로 노출하지 않기 위한 mask.
 * TrackFilter 에서 `false` 인 kind 는 명시적 선택 시에만 포함.
 */
export const TRACK_KIND_DEFAULT_VISIBLE: Record<AdmissionTrackKind, boolean> = {
  susi_subject: true,
  susi_comprehensive: true,
  susi_essay: true,
  susi_practical: true,
  jeongsi_ga: true,
  jeongsi_na: true,
  jeongsi_da: true,
  additional: true,
  jaeoegukmin: false, // P-013 — 진입점 분리
};

/* ═══════════════════════════════════════════════════════════════════════
   UniversityCategory — 5종 (지역·운영주체)
   ═══════════════════════════════════════════════════════════════════════ */

export const UNIVERSITY_CATEGORY_LABELS: Record<UniversityCategory, string> = {
  seoul_top: "서울 상위권",
  seoul: "서울권",
  national_flag: "거점국립",
  national_local: "지방국립",
  private_local: "지방사립",
  special: "특수대학",
};

/** RegionFilter 가 사용하는 5분류 그룹 */
export type RegionGroup =
  | "seoul"
  | "national_flag"
  | "national_local"
  | "private_local"
  | "special";

export const REGION_GROUP_LABELS: Record<RegionGroup, string> = {
  seoul: "서울권",
  national_flag: "거점국립",
  national_local: "지방거점",
  private_local: "지방사립",
  special: "특수대학",
};

/** RegionFilter 그룹 → UniversityCategory 매핑 */
export const REGION_GROUP_TO_CATEGORIES: Record<RegionGroup, UniversityCategory[]> = {
  seoul: ["seoul_top", "seoul"],
  national_flag: ["national_flag"],
  national_local: ["national_local"],
  private_local: ["private_local"],
  special: ["special"],
};

/* ═══════════════════════════════════════════════════════════════════════
   Track (학과 계열) — 7종
   ═══════════════════════════════════════════════════════════════════════ */

export const TRACK_LABELS: Record<Track, string> = {
  humanities: "인문",
  social: "사회",
  natural: "자연",
  engineering: "공학",
  medical: "의약",
  arts: "예체능",
  interdisciplinary: "자유전공/광역",
};

/**
 * UniversityCategoryFilter 가 사용하는 단일 선택 카테고리.
 * Track + 별도 그룹 ("상경", "어문") + "all".
 *
 * "상경"·"어문" 은 Track 안에 명시적 매핑 X — 사용자 검색 편의 위한 별도 카테고리.
 * 매칭은 기본 Track 들(humanities, social) 에서 추출하거나 후속 PR 로 메타데이터 추가.
 */
export type DepartmentCategory =
  | "all"
  | "humanities"
  | "social"
  | "natural"
  | "engineering"
  | "medical"
  | "arts"
  | "business"
  | "language";

export const DEPARTMENT_CATEGORY_LABELS: Record<DepartmentCategory, string> = {
  all: "전체",
  humanities: "인문",
  social: "사회",
  natural: "자연",
  engineering: "공학",
  medical: "의약",
  arts: "예체능",
  business: "상경",
  language: "어문",
};

/* ═══════════════════════════════════════════════════════════════════════
   KoreanRegion — 시도 17개
   ═══════════════════════════════════════════════════════════════════════ */

export const KOREAN_REGION_LABELS: Record<KoreanRegion, string> = {
  seoul: "서울",
  busan: "부산",
  daegu: "대구",
  incheon: "인천",
  gwangju: "광주",
  daejeon: "대전",
  ulsan: "울산",
  sejong: "세종",
  gyeonggi: "경기",
  gangwon: "강원",
  chungbuk: "충북",
  chungnam: "충남",
  jeonbuk: "전북",
  jeonnam: "전남",
  gyeongbuk: "경북",
  gyeongnam: "경남",
  jeju: "제주",
};

/* ═══════════════════════════════════════════════════════════════════════
   한글 자모 분리 검색 — "ㅅㅇ" → "서울" 매칭 지원
   ═══════════════════════════════════════════════════════════════════════ */

const HANGUL_CHO = [
  "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ",
  "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
];

/**
 * 한글 음절의 초성만 추출.
 *   "서울대학교" → "ㅅㅇㄷㅎㄱ"
 * 한글이 아닌 문자(영문·숫자·공백)는 그대로 유지.
 */
export function extractChoseong(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) {
      // 한글 음절 (가~힣)
      const idx = Math.floor((code - 0xac00) / (21 * 28));
      out += HANGUL_CHO[idx];
    } else {
      out += ch;
    }
  }
  return out;
}

/**
 * 검색어가 대상 문자열에 매칭되는지 확인.
 *
 * 매칭 조건 (위에서 아래로 OR):
 *   1. 일반 부분 문자열 (예: "서울대" matches "서울대학교")
 *   2. 검색어가 모두 초성이면 대상 초성에 부분 매칭 (예: "ㅅㅇ" matches "서울")
 *
 * 대소문자·공백 정규화. 영문도 부분 매칭(소문자).
 */
export function matchesSearchQuery(target: string, query: string): boolean {
  const t = target.trim().toLowerCase();
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (t.includes(q)) return true;

  // 검색어가 모두 초성 자모 문자만으로 구성 → 초성 검색
  const isAllCho = q.split("").every((c) => HANGUL_CHO.includes(c));
  if (isAllCho) {
    const targetCho = extractChoseong(target);
    return targetCho.includes(q);
  }
  return false;
}
