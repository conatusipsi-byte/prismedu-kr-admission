/**
 * ETL admissionsStaging mock — Firestore 데이터 없는 개발 환경 fallback
 *
 * 사용처:
 *   - /api/admin/etl-status: Firestore 빈 컬렉션이거나 자격증명 부재 시 mock 반환
 *   - components/admin/__tests__: 회귀 테스트 fixture
 *
 * ⚠️ TODO: staging Firebase 시드 후 본 mock은 dev-only 분기로 좁힘.
 */

import type { ParsedAdmissionPartial, ParserTrustLevel } from "../../scripts/etl/parsers/types";

export interface StagingEntry {
  id: string;
  universityId: string;
  universityName: string;
  year: number;
  uploadedBy: string;
  sourceFilename: string;
  trustLevel: ParserTrustLevel;
  toolChain: string[];
  parsed: ParsedAdmissionPartial;
  promoted: boolean;
  /** ms since epoch (Firestore Timestamp 직렬화 모방) */
  createdAtMs: number;
}

const NOW = Date.now();
const HOUR = 3600_000;

export const MOCK_STAGING_ENTRIES: StagingEntry[] = [
  {
    id: "staging_yonsei_2027_1730000000",
    universityId: "yonsei",
    universityName: "연세대학교",
    year: 2027,
    uploadedBy: "uid_admin_001",
    sourceFilename: "yonsei_admission_2027.pdf",
    trustLevel: "trusted",
    toolChain: ["pdftotext-utf-8✓"],
    parsed: {
      departmentNameCandidates: ["경영학과", "컴퓨터과학과"],
      trackKindCandidates: [
        { kind: "susi_comprehensive", matchedKeyword: "학생부종합", matchedAtOffset: 12 },
        { kind: "jeongsi_na", matchedKeyword: "정시 나군", matchedAtOffset: 240 },
      ],
      csatMinimumPartial: {
        candidateAreas: ["korean", "math", "english", "investigation"],
        requiredCount: 2,
        sumGradeMax: 4,
        historyGradeMax: 4,
        investigationRule: "one",
        originalText: "국·수·영·탐(1) 중 2개 합 4 이내, 한국사 4등급 이내",
        trustLevel: "trusted",
      },
      reflectionRatioPartial: {
        korean: 25, math: 35, english: 15, investigation: 25,
        originalText: "국 25 + 수 35 + 영 15 + 탐 25",
        trustLevel: "trusted",
      },
      trustLevel: "trusted",
      unparsedSections: [],
      rawCounts: { "경영학과": 8, "컴퓨터과학과": 6 },
    },
    promoted: false,
    createdAtMs: NOW - 2 * HOUR,
  },
  {
    id: "staging_pusan_2027_1730000010",
    universityId: "pusan",
    universityName: "부산대학교",
    year: 2027,
    uploadedBy: "uid_admin_001",
    sourceFilename: "pusan_jeongsi_2027.pdf",
    trustLevel: "trusted-fallback",
    toolChain: ["pdftotext-utf-8✗", "pdftotext-adobe-korea1✓"],
    parsed: {
      departmentNameCandidates: ["정보컴퓨터공학부"],
      trackKindCandidates: [
        { kind: "jeongsi_ga", matchedKeyword: "정시 가군", matchedAtOffset: 30 },
      ],
      trustLevel: "trusted-fallback",
      unparsedSections: ["반영비율 표가 PDF 내 이미지로 처리되어 텍스트 추출 부분 실패. 운영자가 직접 보강 필요."],
      rawCounts: { "정보컴퓨터공학부": 4 },
    },
    promoted: false,
    createdAtMs: NOW - 6 * HOUR,
  },
  {
    id: "staging_korea_2027_1730000020",
    universityId: "korea",
    universityName: "고려대학교",
    year: 2027,
    uploadedBy: "uid_admin_002",
    sourceFilename: "korea_haksong_2027.pdf",
    trustLevel: "suspicious", // OCR 결과 — 운영자 검수 필수
    toolChain: ["pdftotext-utf-8✗", "pdftotext-adobe-korea1✗", "pdftoppm✓", "tesseract-kor✓"],
    parsed: {
      departmentNameCandidates: ["자유전공학부"],
      trackKindCandidates: [
        { kind: "susi_comprehensive", matchedKeyword: "학생부종합", matchedAtOffset: 88 },
      ],
      trustLevel: "suspicious",
      unparsedSections: ["OCR 인식 텍스트 — 운영자 비교 검토 필수.\n학생부종합전형 안내. 1단계 서류 100% 5배수 통과 후 2단계 면접 30%."],
      rawCounts: { "자유전공학부": 3 },
    },
    promoted: false,
    createdAtMs: NOW - 12 * HOUR,
  },
  {
    id: "staging_snu_2027_1729000000",
    universityId: "snu",
    universityName: "서울대학교",
    year: 2027,
    uploadedBy: "uid_admin_001",
    sourceFilename: "snu_med_2027.pdf",
    trustLevel: "trusted",
    toolChain: ["pdftotext-utf-8✓"],
    parsed: {
      departmentNameCandidates: ["의예과"],
      trackKindCandidates: [
        { kind: "jeongsi_na", matchedKeyword: "정시 나군", matchedAtOffset: 50 },
      ],
      trustLevel: "trusted",
      unparsedSections: [],
      rawCounts: { "의예과": 9 },
    },
    promoted: true, // 이미 승격된 항목 — 검수 목록에서 자동 제외
    createdAtMs: NOW - 5 * 24 * HOUR,
  },
];

export function listMockStaging(filter: {
  promoted?: "true" | "false" | "all";
  trustLevel?: ParserTrustLevel | "all";
  year?: number;
}): StagingEntry[] {
  return MOCK_STAGING_ENTRIES.filter((e) => {
    if (filter.promoted === "true" && !e.promoted) return false;
    if (filter.promoted === "false" && e.promoted) return false;
    if (filter.trustLevel && filter.trustLevel !== "all" && e.trustLevel !== filter.trustLevel) return false;
    if (filter.year != null && e.year !== filter.year) return false;
    return true;
  });
}

export function getMockStaging(id: string): StagingEntry | null {
  return MOCK_STAGING_ENTRIES.find((e) => e.id === id) ?? null;
}

export interface EtlStatusSummary {
  totalStaging: number;
  pendingReview: number; // promoted=false
  promotedCount: number;
  trustLevelCounts: Record<ParserTrustLevel, number>;
  /** 최근 7일 일별 업로드 수 (시계열 차트용) */
  last7DaysUploads: Array<{ date: string; count: number }>;
}

export function summarizeStaging(entries: StagingEntry[]): EtlStatusSummary {
  const trustLevelCounts: Record<ParserTrustLevel, number> = {
    trusted: 0,
    "trusted-fallback": 0,
    suspicious: 0,
  };
  for (const e of entries) {
    trustLevelCounts[e.trustLevel] += 1;
  }
  const promotedCount = entries.filter((e) => e.promoted).length;
  const pendingReview = entries.length - promotedCount;

  // 최근 7일 일별 카운트
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const last7DaysUploads: Array<{ date: string; count: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 24 * HOUR);
    const dateStr = d.toISOString().slice(0, 10);
    const dayMs = d.getTime();
    const nextMs = dayMs + 24 * HOUR;
    const count = entries.filter((e) => e.createdAtMs >= dayMs && e.createdAtMs < nextMs).length;
    last7DaysUploads.push({ date: dateStr, count });
  }

  return {
    totalStaging: entries.length,
    pendingReview,
    promotedCount,
    trustLevelCounts,
    last7DaysUploads,
  };
}
