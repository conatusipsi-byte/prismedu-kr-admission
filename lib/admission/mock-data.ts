/**
 * Mock 데이터 — DB 연결 전 임시 사용
 *
 * ⚠️ TODO: Firestore 연결 후 본 모듈 제거.
 * 사용처:
 *   - app/admissions/[universityId]/[departmentId]/page.tsx
 *   - 컴포넌트 회귀 테스트 (시드 데이터 없는 환경에서)
 *
 * 본 데이터는 init-collections.ts (서울대 의예과 2027학년도) 와 동일 구조 유지.
 * 클라이언트 가입 후 staging 환경에서 init-collections.ts 시드와 1:1 일치하므로
 * 시드 로드 후 mock 제거만으로 실 데이터 전환 가능.
 */

import { finalizeMinReq } from "./min-req-classifier";
import type {
  University,
  Department,
  DepartmentAdmissions,
  AdmissionTrack,
  AdmissionSampleStats,
  PrevYearResult,
  Timestamp,
} from "@/types/admission";

const MOCK_TS: Timestamp = {
  seconds: Math.floor(Date.now() / 1000),
  nanoseconds: 0,
  toDate: () => new Date(),
  toMillis: () => Date.now(),
};

const SNU_UNIVERSITY: University = {
  id: "snu",
  n: "서울대학교",
  nameEn: "Seoul National University",
  shortName: "서울대",
  d: "snu.ac.kr",
  category: "seoul_top",
  campuses: [
    {
      id: "main",
      name: "관악캠퍼스",
      address: "서울특별시 관악구 관악로 1",
      region: "seoul",
      isMain: true,
    },
  ],
  rankOrder: 1,
  admissionGuideUrl: "https://admission.snu.ac.kr",
  websiteUrl: "https://www.snu.ac.kr",
  active: true,
  updatedAt: MOCK_TS,
};

const MED_DEPARTMENT: Department = {
  id: "med",
  universityId: "snu",
  campusId: "main",
  name: "의예과",
  nameEn: "Premedical",
  unitType: "department",
  track: "medical",
  totalQuota: 135,
  isProfessional: true,
  professionalType: "medical",
  active: true,
  updatedAt: MOCK_TS,
};

const JEONGSI_NA_TRACK: AdmissionTrack = {
  name: "일반전형",
  kind: "jeongsi_na",
  specialType: "general",
  quotaInitial: 105,
  stages: [{ step: 1, components: { csat: 100 } }],
  csatMinimum: finalizeMinReq({
    candidateAreas: ["korean", "math", "english", "investigation"],
    requiredCount: 4,
    sumGradeMax: 5,
    historyGradeMax: 4,
    investigationRule: "two_avg",
    originalText: "국·수·영·탐 4개 영역 등급의 합이 5 이내, 한국사 4등급 이내",
  }),
  requiredAreas: {
    math: { courses: ["calculus", "geometry"], required: true },
    english: true,
    history: true,
    investigation: { types: ["science"], requiredCount: 2 },
    notes: "수학 미적분/기하 중 1과목, 과학탐구 2과목 응시 필수",
  },
  reflectionRatio: {
    korean: { ratio: 100, scoreType: "standard" },
    math: { ratio: 120, scoreType: "standard" },
    english: {
      ratio: 0,
      gradeMap: {
        1: 0, 2: -0.5, 3: -2.0, 4: -4.0,
        5: -6.0, 6: -8.0, 7: -10.0, 8: -12.0, 9: -14.0,
      },
    },
    investigation: { ratio: 80, scoreType: "standard" },
    history: {
      ratio: 0,
      gradeMap: {
        1: 0, 2: 0, 3: 0, 4: -0.4,
        5: -0.8, 6: -1.2, 7: -1.6, 8: -2.0, 9: -2.4,
      },
    },
    investigationCombinationBonus: { "I+I": 0, "I+II": 3, "II+II": 5 },
  },
  conversionTable: {
    status: "preliminary",
    sourceUrl: "https://admission.snu.ac.kr",
  },
  schedule: {
    applicationStart: "2026-12-29",
    applicationEnd: "2026-12-31",
    announcementDate: "2027-01-30",
  },
  notes: "정시 합격자 대상으로 적성·인성면접 결격 여부 판단",
};

const ADMISSIONS_2027: DepartmentAdmissions = {
  id: "2027",
  universityId: "snu",
  departmentId: "med",
  year: 2027,
  tracks: { jeongsi_na: [JEONGSI_NA_TRACK] },
  availableTrackKinds: ["jeongsi_na"],
  source: {
    url: "https://admission.snu.ac.kr/files/2027_jeongsi.pdf",
    parsedAt: MOCK_TS,
    parserVersion: "mock-v1",
  },
  prevYearResult: {
    competitionRate: 5.4,
    cutoff70: 728.5,
    cutoff50: 731.2,
    cutoffAvg: 729.8,
    notes: "2026학년도 일반전형 입결 (수시 이월 후)",
  },
  updatedAt: MOCK_TS,
};

const SAMPLE_STATS: AdmissionSampleStats = {
  id: "snu_med_2027_jeongsi_na",
  universityId: "snu",
  departmentId: "med",
  year: 2027,
  trackKind: "jeongsi_na",
  verifiedCount: 1,
  weightedCount: 1.0,
  acceptedCount: 1,
  updatedAt: MOCK_TS,
};

/* ═══════════════════════════════════════════════════════════════════════
   Public mock — 페이지에서 직접 import
   ═══════════════════════════════════════════════════════════════════════ */

export interface MockDepartmentDetail {
  university: University;
  department: Department;
  admissions: DepartmentAdmissions;
  prevYearResult?: PrevYearResult;
  sampleStats: AdmissionSampleStats;
  /** sample-gate.checkSampleSufficiency 결과 — 페이지에서 직접 사용 */
  sampleSufficient: boolean;
}

export const MOCK_SNU_MEDICAL: MockDepartmentDetail = {
  university: SNU_UNIVERSITY,
  department: MED_DEPARTMENT,
  admissions: ADMISSIONS_2027,
  prevYearResult: ADMISSIONS_2027.prevYearResult,
  sampleStats: SAMPLE_STATS,
  // 임계 5건 미만 — sample-gate가 false 반환. 안내 카드 노출 시연.
  sampleSufficient: false,
};

/**
 * 임시 lookup — 실제로는 Firestore 조회.
 * TODO: lib/firebase-admin.ts 의 getAdminDb() 로 교체.
 */
export function getMockDepartmentDetail(
  universityId: string,
  departmentId: string,
): MockDepartmentDetail | null {
  if (universityId === "snu" && departmentId === "med") {
    return MOCK_SNU_MEDICAL;
  }
  return null;
}

/* ═══════════════════════════════════════════════════════════════════════
   University-only lookup — /admissions/[universityId] 페이지용
   ═══════════════════════════════════════════════════════════════════════ */

export interface MockUniversityDetail {
  university: University;
  /** 그 대학의 학과 목록 — 정렬은 모집인원 내림차순. */
  departments: Array<{
    department: Department;
    /** 학과별 가용 트랙 (Department 카드 뱃지용) — 미세팅 시 빈 배열. */
    availableTracks: AdmissionTrack["kind"][];
    totalQuota: number;
  }>;
}

/**
 * 대학 단독 상세 lookup. 시드 후 Firestore 조회로 교체.
 * 현재는 SNU(서울대)만 mock — 학과 1개(의예과)만 노출.
 */
export function getMockUniversityDetail(
  universityId: string,
): MockUniversityDetail | null {
  if (universityId !== "snu") return null;
  return {
    university: SNU_UNIVERSITY,
    departments: [
      {
        department: MED_DEPARTMENT,
        availableTracks: ADMISSIONS_2027.availableTrackKinds,
        totalQuota: MED_DEPARTMENT.totalQuota,
      },
    ],
  };
}
