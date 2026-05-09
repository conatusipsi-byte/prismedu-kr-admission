/**
 * 재외국민·외국인 전형 운영 대학 — Mock 데이터
 *
 * ⚠️ TODO: ETL 실 데이터로 교체. 현재는 5개 대표 대학의 표면 정보만.
 * 정확한 자격·서류는 각 대학 입학처 모집요강에서 확인 필수 (P-002 정직성).
 */

export interface JaeoegukminUniversitySummary {
  universityId: string;
  name: string;
  shortName: string;
  campus: string;
  region: string;
  /** 카테고리 — 재외국민 / 외국인 / 12년 외국교육 / 모두 */
  trackTypes: Array<"jaeoegukmin" | "foreigner" | "foreign_education_12yr">;
  /** 자격 요건 요약 (1~2줄) */
  eligibilitySummary: string;
  /** 별도 어학·표준화 시험 필수 여부 */
  standardizedTestRequired: boolean;
  /** 모집요강 URL */
  admissionGuideUrl: string;
}

export const MOCK_JAEOEGUKMIN_UNIVERSITIES: JaeoegukminUniversitySummary[] = [
  {
    universityId: "snu",
    name: "서울대학교",
    shortName: "서울대",
    campus: "관악",
    region: "서울",
    trackTypes: ["jaeoegukmin", "foreign_education_12yr"],
    eligibilitySummary:
      "재외국민(부모와 본인 외국 거주 3년 이상) 또는 12년 외국교육이수자. 모집인원 별도.",
    standardizedTestRequired: true,
    admissionGuideUrl: "https://admission.snu.ac.kr",
  },
  {
    universityId: "yonsei",
    name: "연세대학교",
    shortName: "연세대",
    campus: "신촌",
    region: "서울",
    trackTypes: ["jaeoegukmin", "foreigner"],
    eligibilitySummary:
      "재외국민(거주 3년+) / 외국인(외국 국적 + 외국 고교 졸업). TOPIK·TOEFL 점수 별도.",
    standardizedTestRequired: true,
    admissionGuideUrl: "https://underwood.yonsei.ac.kr",
  },
  {
    universityId: "korea",
    name: "고려대학교",
    shortName: "고려대",
    campus: "안암",
    region: "서울",
    trackTypes: ["jaeoegukmin", "foreigner", "foreign_education_12yr"],
    eligibilitySummary:
      "3개 트랙 모두 운영. 재외국민·외국인·12년 외국교육 분리 모집. 어학 시험 + 서류 평가.",
    standardizedTestRequired: true,
    admissionGuideUrl: "https://oku.korea.ac.kr",
  },
  {
    universityId: "skku",
    name: "성균관대학교",
    shortName: "성대",
    campus: "인문사회",
    region: "서울",
    trackTypes: ["foreigner"],
    eligibilitySummary:
      "외국인 전형 위주. 한국어 능력 중심 평가. 어학·서류 단계별 평가.",
    standardizedTestRequired: true,
    admissionGuideUrl: "https://admissions.skku.edu",
  },
  {
    universityId: "hanyang",
    name: "한양대학교",
    shortName: "한양대",
    campus: "서울",
    region: "서울",
    trackTypes: ["jaeoegukmin", "foreigner"],
    eligibilitySummary:
      "재외국민·외국인 분리 모집. 어학 시험 점수 + 학업 능력 평가.",
    standardizedTestRequired: true,
    admissionGuideUrl: "https://go.hanyang.ac.kr",
  },
];

/**
 * 자격 분류 결과 → 추천 대학 필터링.
 * - jaeoegukmin: jaeoegukmin 트랙 운영 대학
 * - foreigner: foreigner 트랙 운영 대학
 * - both: 둘 다 운영 대학
 * - not_eligible: 빈 배열 (일반 전형 안내)
 */
export function filterUniversitiesByEligibility(
  type: "jaeoegukmin" | "foreigner" | "both" | "not_eligible",
): JaeoegukminUniversitySummary[] {
  if (type === "not_eligible") return [];
  if (type === "both") {
    return MOCK_JAEOEGUKMIN_UNIVERSITIES.filter(
      (u) => u.trackTypes.includes("jaeoegukmin") && u.trackTypes.includes("foreigner"),
    );
  }
  return MOCK_JAEOEGUKMIN_UNIVERSITIES.filter((u) => u.trackTypes.includes(type));
}
