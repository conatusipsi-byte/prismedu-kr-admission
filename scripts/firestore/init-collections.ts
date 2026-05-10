#!/usr/bin/env node
/**
 * Firestore 컬렉션 초기화 스크립트
 *
 * 신규 프로젝트 빈 Firestore 에 다음을 자동 생성:
 *   1. universities/{snu}                                    — 서울대학교 (테스트용)
 *   2. universities/{snu}/departments/{med}                  — 의예과
 *   3. universities/{snu}/departments/{med}/admissions/{2027} — 2027학년도 모집요강
 *   4. admissionResults                                      — 빈 컬렉션 (인덱스 트리거용 시드 1건)
 *   5. admissionSampleStats                                  — 빈 컬렉션 시드 1건
 *   6. monitoring/adminNotifications                         — 운영자 알림 컬렉션
 *
 * 테스트 데이터는 docs/schema-validation-report.md 의 서울대 의예과 정보 기반.
 *
 * CLI:
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json \
 *   npx tsx scripts/firestore/init-collections.ts
 *
 * Idempotent — 이미 존재하면 skip. 재실행 안전.
 *
 * --force 플래그: 기존 도큐먼트 덮어쓰기 (운영 환경에서는 절대 사용 X — 개발 환경 reset 용도).
 */

import { initializeApp, cert, getApps, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { finalizeMinReq } from "../../lib/admission/min-req-classifier";
import type {
  University,
  Department,
  DepartmentAdmissions,
  AdmissionTrack,
  AdmissionSampleStats,
  AdmissionResult,
} from "../../types/admission";

/* ═══════════════════════════════════════════════════════════════════════
   설정
   ═══════════════════════════════════════════════════════════════════════ */

const TEST_YEAR = 2027;
const SNU_ID = "snu";
const SNU_DEPT_MED_ID = "med";

/** Day 3에서 추가한 mock 학과 4개 — P-001/P-006/P-012 분기 시연 */
const YONSEI_ID = "yonsei";
const YONSEI_DEPT_BIZ_ID = "business";
const PUSAN_ID = "pusan";
const PUSAN_DEPT_CS_ID = "info-comp";
const KOREA_ID = "korea";
const KOREA_DEPT_LIBERAL_ID = "liberal";
const KNUA_ID = "knua";
const KNUA_DEPT_FILM_ID = "film";

export interface Options {
  force: boolean;
  dryRun: boolean;
}

/* ═══════════════════════════════════════════════════════════════════════
   메인
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * 외부 wrapper(예: scripts/firestore/seed-staging.ts)에서 호출 가능.
 * 본 스크립트가 직접 실행될 때는 §CLI에서 호출.
 */
export async function runSeed(opts: Options): Promise<void> {
  return main(opts);
}

async function main(opts: Options): Promise<void> {
  if (getApps().length === 0) {
    // Emulator 모드 — FIRESTORE_EMULATOR_HOST 가 있으면 credential 없이 bare init.
    // (applicationDefault()는 GCP credential 부재 시 throw — CI 에서 emulator 사용 시 차단됨)
    const isEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;
    if (isEmulator) {
      initializeApp({
        projectId: process.env.GCLOUD_PROJECT || process.env.FIREBASE_ADMIN_PROJECT_ID || "demo-conatusipsi",
      });
    } else {
      initializeApp({
        credential: process.env.GOOGLE_APPLICATION_CREDENTIALS
          ? cert(process.env.GOOGLE_APPLICATION_CREDENTIALS)
          : applicationDefault(),
      });
    }
  }
  const db = getFirestore();
  const now = Timestamp.now();

  console.log(`🏗  Firestore 초기화 시작 (force=${opts.force}, dryRun=${opts.dryRun})\n`);

  /* ── 1. universities/{snu} ──────────────────────────────── */
  const universityData = buildSeoulNationalUniversity(now);
  await upsertDoc(db, `universities/${SNU_ID}`, universityData, opts);

  /* ── 2. universities/{snu}/departments/{med} ────────────── */
  const departmentData = buildMedicalDepartment(now);
  await upsertDoc(db, `universities/${SNU_ID}/departments/${SNU_DEPT_MED_ID}`, departmentData, opts);

  /* ── 3. admissions/{2027} ───────────────────────────────── */
  const admissionsData = buildMedicalAdmissions2027(now);
  await upsertDoc(
    db,
    `universities/${SNU_ID}/departments/${SNU_DEPT_MED_ID}/admissions/${TEST_YEAR}`,
    admissionsData,
    opts,
  );

  /* ── 4. admissionResults — 시드 1건 ───────────────────── */
  const resultData = buildSampleAdmissionResult(now);
  await upsertDoc(
    db,
    `admissionResults/seed-snu-med-2026`,
    resultData,
    opts,
  );

  /* ── 5. admissionSampleStats — 집계 시드 ────────────────── */
  const statsData = buildSampleStats(now);
  await upsertDoc(
    db,
    `admissionSampleStats/${SNU_ID}_${SNU_DEPT_MED_ID}_${TEST_YEAR}_jeongsi_na`,
    statsData,
    opts,
  );

  /* ── 6. monitoring/adminNotifications ─────────────────── */
  // 컬렉션 자체는 trigger 시 생성되므로 시드 1건만.
  await upsertDoc(
    db,
    `monitoring/adminNotifications/items/seed-init`,
    {
      kind: "system_init",
      severity: "info",
      title: "Firestore 초기화 완료",
      body: "신규 프로젝트 컬렉션 초기화 시드 데이터 생성. 본 알림은 검수 후 삭제 가능.",
      unresolved: false,
      createdAt: now,
    },
    opts,
  );

  /* ── 7. Mock 학과 4개 (Day 3 — P-001/P-006/P-012 분기 시연) ── */
  await seedYonseiBusiness(db, now, opts);
  await seedPusanInfoComp(db, now, opts);
  await seedKoreaLiberal(db, now, opts);
  await seedKnuaFilm(db, now, opts);

  console.log(`\n✨ 초기화 완료`);
}

/* ═══════════════════════════════════════════════════════════════════════
   도큐먼트 빌더 — 서울대 의예과 (schema-validation-report.md §1.1 기반)
   ═══════════════════════════════════════════════════════════════════════ */

function buildSeoulNationalUniversity(now: Timestamp): Omit<University, "id"> {
  return {
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
    updatedAt: now,
  };
}

function buildMedicalDepartment(now: Timestamp): Omit<Department, "id"> {
  return {
    universityId: SNU_ID,
    campusId: "main",
    name: "의예과",
    nameEn: "Premedical",
    unitType: "department",
    track: "medical",
    totalQuota: 135,
    isProfessional: true,
    professionalType: "medical",
    active: true,
    updatedAt: now,
  };
}

function buildMedicalAdmissions2027(now: Timestamp): Omit<DepartmentAdmissions, "id"> {
  /**
   * 검증 보고서 기반 — 서울대 정시 일반전형 (나군) 패턴 일부:
   *   국 100 + 수 120 + 탐 80 (표준점수)
   *   영어 등급 감점 / 한국사 등급 감점
   *   응시영역기준: 자연계 — 미적분/기하 + 과학탐구 2
   */
  const csatMinimum = finalizeMinReq({
    candidateAreas: ["korean", "math", "english", "investigation"],
    requiredCount: 4,
    sumGradeMax: 5,
    historyGradeMax: 4,
    investigationRule: "two_avg",
    originalText: "국·수·영·탐 4개 영역 등급의 합이 5 이내, 한국사 4등급 이내",
  });

  const jeongsiNaTrack: AdmissionTrack = {
    name: "일반전형",
    kind: "jeongsi_na",
    specialType: "general",
    quotaInitial: 105,
    stages: [
      {
        step: 1,
        components: { csat: 100 },
      },
    ],
    csatMinimum,
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
        gradeMap: { 1: 0, 2: -0.5, 3: -2.0, 4: -4.0, 5: -6.0, 6: -8.0, 7: -10.0, 8: -12.0, 9: -14.0 },
      },
      investigation: { ratio: 80, scoreType: "standard" },
      history: {
        ratio: 0,
        gradeMap: { 1: 0, 2: 0, 3: 0, 4: -0.4, 5: -0.8, 6: -1.2, 7: -1.6, 8: -2.0, 9: -2.4 },
      },
      investigationCombinationBonus: { "I+I": 0, "I+II": 3, "II+II": 5 },
    },
    conversionTable: {
      status: "preliminary",
      sourceUrl: "https://admission.snu.ac.kr",
    },
    notes: "정시 가산: 적성·인성면접 결격 여부 판단",
  };

  return {
    universityId: SNU_ID,
    departmentId: SNU_DEPT_MED_ID,
    year: TEST_YEAR,
    tracks: {
      jeongsi_na: [jeongsiNaTrack],
    },
    availableTrackKinds: ["jeongsi_na"],
    source: {
      url: "https://admission.snu.ac.kr/files/2027_jeongsi.pdf",
      parsedAt: now,
      parserVersion: "init-seed-v1",
    },
    updatedAt: now,
  };
}

function buildSampleAdmissionResult(now: Timestamp): Omit<AdmissionResult, "id"> {
  return {
    universityId: SNU_ID,
    departmentId: SNU_DEPT_MED_ID,
    year: 2026,
    trackKind: "jeongsi_na",
    trackName: "일반전형",
    outcome: "accepted",
    specSnapshot: {
      schoolRecord: { gpaOverall: 1.2 },
      csat: {
        koreanStd: 138,
        mathStd: 142,
        englishGrade: 1,
        investigationStdAvg: 70,
        historyGrade: 2,
      },
      schoolType: "general",
    },
    confidence: 1.0,
    source: "official_disclosure",
    verified: true,
    verifiedAt: now,
    createdAt: now,
  };
}

function buildSampleStats(now: Timestamp): Omit<AdmissionSampleStats, "id"> {
  return {
    universityId: SNU_ID,
    departmentId: SNU_DEPT_MED_ID,
    year: TEST_YEAR,
    trackKind: "jeongsi_na",
    verifiedCount: 1,
    weightedCount: 1.0,
    acceptedCount: 1,
    updatedAt: now,
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   Day 3 mock 학과 — 4개 시드 함수
   ───────────────────────────────────────────────────────────────────────
   각 학과는 university + department + admissions/{year} + sampleStats
   (+ 표본 충족 학과는 admissionResults 시드 5+건) 일괄 생성.

   ⚠️ TODO: 실 데이터 시즌(7~9월) 갱신 시 본 mock은 운영 환경에서 제거.
   본 함수의 데이터는 시연·테스트용이며 모집요강 원문 정확도와는 별개.
   ═══════════════════════════════════════════════════════════════════════ */

/** 연세대 경영학과 — P-006 학종 분해 시연 (학종 표본 충족) */
async function seedYonseiBusiness(
  db: FirebaseFirestore.Firestore,
  now: Timestamp,
  opts: Options,
): Promise<void> {
  const univ: Omit<University, "id"> = {
    n: "연세대학교",
    nameEn: "Yonsei University",
    shortName: "연세대",
    d: "yonsei.ac.kr",
    category: "seoul_top",
    campuses: [
      { id: "main", name: "신촌캠퍼스", address: "서울특별시 서대문구 연세로 50", region: "seoul", isMain: true },
    ],
    rankOrder: 3,
    admissionGuideUrl: "https://admission.yonsei.ac.kr",
    websiteUrl: "https://www.yonsei.ac.kr",
    active: true,
    updatedAt: now,
  };
  const dept: Omit<Department, "id"> = {
    universityId: YONSEI_ID,
    campusId: "main",
    name: "경영학과",
    nameEn: "Business Administration",
    unitType: "department",
    track: "social",
    totalQuota: 226,
    active: true,
    updatedAt: now,
  };
  const hakjongTrack: AdmissionTrack = {
    name: "활동우수형(학생부종합)",
    kind: "susi_comprehensive",
    specialType: "general",
    quotaInitial: 64,
    stages: [
      { step: 1, multiplier: 3, components: { document: 100 } },
      { step: 2, components: { document: 60, interview: 40 } },
    ],
    csatMinimum: finalizeMinReq({
      candidateAreas: ["korean", "math", "english", "investigation"],
      requiredCount: 2,
      sumGradeMax: 4,
      historyGradeMax: 4,
      investigationRule: "one",
      originalText: "국·수·영·탐(1) 중 2개 합 4 이내, 한국사 4 이내",
    }),
    notes: "학종 분해 — 1단계 서류, 2단계 면접 40% (P-006 시연용 시드)",
  };
  const jeongsiTrack: AdmissionTrack = {
    name: "일반전형(정시 나군)",
    kind: "jeongsi_na",
    specialType: "general",
    quotaInitial: 80,
    stages: [{ step: 1, components: { csat: 100 } }],
    reflectionRatio: {
      korean: { ratio: 200, scoreType: "standard" },
      math: { ratio: 200, scoreType: "standard" },
      english: { ratio: 0, gradeMap: { 1: 0, 2: -5, 3: -10, 4: -15, 5: -20, 6: -25, 7: -30, 8: -35, 9: -40 } },
      investigation: { ratio: 100, scoreType: "standard" },
    },
    conversionTable: { status: "finalized", sourceUrl: "https://admission.yonsei.ac.kr/2027" },
  };
  const admissions: Omit<DepartmentAdmissions, "id"> = {
    universityId: YONSEI_ID,
    departmentId: YONSEI_DEPT_BIZ_ID,
    year: TEST_YEAR,
    tracks: { susi_comprehensive: [hakjongTrack], jeongsi_na: [jeongsiTrack] },
    availableTrackKinds: ["susi_comprehensive", "jeongsi_na"],
    prevYearResult: {
      competitionRate: 18,
      gradeCutoffAvg: 1.7,
      gradeCutoff70: 1.9,
      stage1ApplicantCount: 1200,
      stage1PassCount: 192,
      stage1GradeCutoff: 2.1,
      stage2PassRate: 0.33,
      cutoffAvg: 295,
    },
    source: { url: "https://admission.yonsei.ac.kr/2027.pdf", parsedAt: now, parserVersion: "init-seed-v1-day3" },
    updatedAt: now,
  };
  await upsertUniversityBundle(db, opts, YONSEI_ID, YONSEI_DEPT_BIZ_ID, univ, dept, admissions);

  // 학종 분해 표본 충족 — stage1Passed=15, stage2Accepted=8
  await upsertDoc(
    db,
    `admissionSampleStats/${YONSEI_ID}_${YONSEI_DEPT_BIZ_ID}_${TEST_YEAR}_susi_comprehensive`,
    {
      universityId: YONSEI_ID, departmentId: YONSEI_DEPT_BIZ_ID, year: TEST_YEAR,
      trackKind: "susi_comprehensive",
      verifiedCount: 12, weightedCount: 9.5, acceptedCount: 8,
      stage1PassedCount: 15, stage2AcceptedCount: 8,
      updatedAt: now,
    } satisfies Omit<AdmissionSampleStats, "id">,
    opts,
  );
  await upsertDoc(
    db,
    `admissionSampleStats/${YONSEI_ID}_${YONSEI_DEPT_BIZ_ID}_${TEST_YEAR}_jeongsi_na`,
    {
      universityId: YONSEI_ID, departmentId: YONSEI_DEPT_BIZ_ID, year: TEST_YEAR,
      trackKind: "jeongsi_na",
      verifiedCount: 18, weightedCount: 13.0, acceptedCount: 10,
      updatedAt: now,
    } satisfies Omit<AdmissionSampleStats, "id">,
    opts,
  );
  // 표본 충족용 합격 사례 시드 (학종)
  for (let i = 0; i < 8; i++) {
    await upsertDoc(
      db,
      `admissionResults/seed-${YONSEI_ID}-${YONSEI_DEPT_BIZ_ID}-2026-h-${i}`,
      buildHakjongResult(now, YONSEI_ID, YONSEI_DEPT_BIZ_ID, i),
      opts,
    );
  }
}

/** 부산대 정보컴공 — P-012 정시 변환표 preliminary 시연 */
async function seedPusanInfoComp(
  db: FirebaseFirestore.Firestore,
  now: Timestamp,
  opts: Options,
): Promise<void> {
  const univ: Omit<University, "id"> = {
    n: "부산대학교",
    nameEn: "Pusan National University",
    shortName: "부산대",
    d: "pusan.ac.kr",
    category: "national_flag",
    campuses: [
      { id: "main", name: "장전캠퍼스", address: "부산광역시 금정구 부산대학로63번길 2", region: "busan", isMain: true },
    ],
    rankOrder: 12,
    admissionGuideUrl: "https://go.pusan.ac.kr",
    websiteUrl: "https://www.pusan.ac.kr",
    active: true,
    updatedAt: now,
  };
  const dept: Omit<Department, "id"> = {
    universityId: PUSAN_ID,
    campusId: "main",
    name: "정보컴퓨터공학부",
    nameEn: "Information & Computer Engineering",
    unitType: "division",
    track: "engineering",
    totalQuota: 110,
    active: true,
    updatedAt: now,
  };
  const jeongsiGaTrack: AdmissionTrack = {
    name: "일반전형(정시 가군)",
    kind: "jeongsi_ga",
    specialType: "general",
    quotaInitial: 45,
    stages: [{ step: 1, components: { csat: 100 } }],
    requiredAreas: {
      math: { courses: ["calculus", "geometry"], required: true },
      english: true,
      history: true,
      investigation: { types: ["science"], requiredCount: 2 },
    },
    reflectionRatio: {
      korean: { ratio: 25, scoreType: "standard" },
      math: { ratio: 35, scoreType: "standard" },
      english: { ratio: 15, gradeMap: { 1: 100, 2: 95, 3: 88, 4: 78, 5: 65, 6: 50, 7: 30, 8: 10, 9: 0 } },
      investigation: { ratio: 25, scoreType: "converted_standard" },
    },
    // P-012 시연 — 변환표 후공지 상태
    conversionTable: {
      status: "preliminary",
      sourceUrl: "https://go.pusan.ac.kr/2027",
    },
    notes: "변환표 후공지(P-012 시연용 시드)",
  };
  const admissions: Omit<DepartmentAdmissions, "id"> = {
    universityId: PUSAN_ID,
    departmentId: PUSAN_DEPT_CS_ID,
    year: TEST_YEAR,
    tracks: { jeongsi_ga: [jeongsiGaTrack] },
    availableTrackKinds: ["jeongsi_ga"],
    prevYearResult: {
      competitionRate: 6,
      cutoffAvg: 285,
      cutoff70: 282,
      gradeCutoffAvg: 2.4,
    },
    source: { url: "https://go.pusan.ac.kr/2027.pdf", parsedAt: now, parserVersion: "init-seed-v1-day3" },
    updatedAt: now,
  };
  await upsertUniversityBundle(db, opts, PUSAN_ID, PUSAN_DEPT_CS_ID, univ, dept, admissions);

  await upsertDoc(
    db,
    `admissionSampleStats/${PUSAN_ID}_${PUSAN_DEPT_CS_ID}_${TEST_YEAR}_jeongsi_ga`,
    {
      universityId: PUSAN_ID, departmentId: PUSAN_DEPT_CS_ID, year: TEST_YEAR,
      trackKind: "jeongsi_ga",
      verifiedCount: 14, weightedCount: 10.0, acceptedCount: 10,
      updatedAt: now,
    } satisfies Omit<AdmissionSampleStats, "id">,
    opts,
  );
  for (let i = 0; i < 10; i++) {
    await upsertDoc(
      db,
      `admissionResults/seed-${PUSAN_ID}-${PUSAN_DEPT_CS_ID}-2026-${i}`,
      buildJeongsiResult(now, PUSAN_ID, PUSAN_DEPT_CS_ID, "jeongsi_ga", i),
      opts,
    );
  }
}

/** 고려대 자유전공 — P-001 옵션 B (표본 부족 의도적) */
async function seedKoreaLiberal(
  db: FirebaseFirestore.Firestore,
  now: Timestamp,
  opts: Options,
): Promise<void> {
  const univ: Omit<University, "id"> = {
    n: "고려대학교",
    nameEn: "Korea University",
    shortName: "고려대",
    d: "korea.ac.kr",
    category: "seoul_top",
    campuses: [
      { id: "main", name: "안암캠퍼스", address: "서울특별시 성북구 안암로 145", region: "seoul", isMain: true },
    ],
    rankOrder: 2,
    admissionGuideUrl: "https://oku.korea.ac.kr",
    websiteUrl: "https://www.korea.ac.kr",
    active: true,
    updatedAt: now,
  };
  const dept: Omit<Department, "id"> = {
    universityId: KOREA_ID,
    campusId: "main",
    name: "자유전공학부",
    nameEn: "Division of Liberal Studies",
    unitType: "broadcast",
    track: "interdisciplinary",
    totalQuota: 95,
    active: true,
    updatedAt: now,
  };
  const hakjongTrack: AdmissionTrack = {
    name: "학업우수전형(학생부종합)",
    kind: "susi_comprehensive",
    specialType: "general",
    quotaInitial: 30,
    stages: [
      { step: 1, multiplier: 5, components: { document: 100 } },
      { step: 2, components: { document: 70, interview: 30 } },
    ],
    notes: "광역모집·자유전공 — 표본 부족 학과 (P-001 옵션 B 시연)",
  };
  const admissions: Omit<DepartmentAdmissions, "id"> = {
    universityId: KOREA_ID,
    departmentId: KOREA_DEPT_LIBERAL_ID,
    year: TEST_YEAR,
    tracks: { susi_comprehensive: [hakjongTrack] },
    availableTrackKinds: ["susi_comprehensive"],
    prevYearResult: {
      competitionRate: 14,
      gradeCutoffAvg: 1.6,
    },
    source: { url: "https://oku.korea.ac.kr/2027.pdf", parsedAt: now, parserVersion: "init-seed-v1-day3" },
    updatedAt: now,
  };
  await upsertUniversityBundle(db, opts, KOREA_ID, KOREA_DEPT_LIBERAL_ID, univ, dept, admissions);

  // 표본 부족 — acceptedCount=2, weightedCount=1.0 (sample-gate 임계 미달)
  await upsertDoc(
    db,
    `admissionSampleStats/${KOREA_ID}_${KOREA_DEPT_LIBERAL_ID}_${TEST_YEAR}_susi_comprehensive`,
    {
      universityId: KOREA_ID, departmentId: KOREA_DEPT_LIBERAL_ID, year: TEST_YEAR,
      trackKind: "susi_comprehensive",
      verifiedCount: 2, weightedCount: 1.0, acceptedCount: 2,
      stage1PassedCount: 4, stage2AcceptedCount: 2,
      updatedAt: now,
    } satisfies Omit<AdmissionSampleStats, "id">,
    opts,
  );
  // admissionResults 시드는 의도적으로 적게 — 표본 부족 시연
  await upsertDoc(
    db,
    `admissionResults/seed-${KOREA_ID}-${KOREA_DEPT_LIBERAL_ID}-2026-h-0`,
    buildHakjongResult(now, KOREA_ID, KOREA_DEPT_LIBERAL_ID, 0),
    opts,
  );
}

/** 한국예술종합학교 영상원 — 실기 전형 (일반 패턴 외 케이스) */
async function seedKnuaFilm(
  db: FirebaseFirestore.Firestore,
  now: Timestamp,
  opts: Options,
): Promise<void> {
  const univ: Omit<University, "id"> = {
    n: "한국예술종합학교",
    nameEn: "Korea National University of Arts",
    shortName: "한예종",
    d: "karts.ac.kr",
    category: "special",
    campuses: [
      { id: "main", name: "석관캠퍼스", address: "서울특별시 성북구 화랑로 32길 146-37", region: "seoul", isMain: true },
    ],
    rankOrder: 30,
    admissionGuideUrl: "https://www.karts.ac.kr/admission",
    websiteUrl: "https://www.karts.ac.kr",
    active: true,
    updatedAt: now,
  };
  const dept: Omit<Department, "id"> = {
    universityId: KNUA_ID,
    campusId: "main",
    name: "영상원 영화과",
    nameEn: "School of Film, TV & Multimedia",
    unitType: "department",
    track: "arts",
    totalQuota: 28,
    active: true,
    updatedAt: now,
  };
  const practicalTrack: AdmissionTrack = {
    name: "실기전형(영상원)",
    kind: "susi_practical",
    specialType: "general",
    quotaInitial: 28,
    stages: [
      { step: 1, multiplier: 5, components: { document: 100 } },
      { step: 2, components: { practical: 70, interview: 30 } },
    ],
    notes: "1단계 서류, 2단계 실기·면접 — 수능최저 없음. 일반 매칭 패턴 외 케이스.",
  };
  const admissions: Omit<DepartmentAdmissions, "id"> = {
    universityId: KNUA_ID,
    departmentId: KNUA_DEPT_FILM_ID,
    year: TEST_YEAR,
    tracks: { susi_practical: [practicalTrack] },
    availableTrackKinds: ["susi_practical"],
    prevYearResult: {
      competitionRate: 25,
      // 실기는 등급 cutoff 없음 — 정형화 어려운 케이스
      notes: "실기 컷은 정형 데이터 없음 — 작품·면접 주관 평가",
    },
    source: { url: "https://www.karts.ac.kr/admission/2027.pdf", parsedAt: now, parserVersion: "init-seed-v1-day3" },
    updatedAt: now,
  };
  await upsertUniversityBundle(db, opts, KNUA_ID, KNUA_DEPT_FILM_ID, univ, dept, admissions);

  await upsertDoc(
    db,
    `admissionSampleStats/${KNUA_ID}_${KNUA_DEPT_FILM_ID}_${TEST_YEAR}_susi_practical`,
    {
      universityId: KNUA_ID, departmentId: KNUA_DEPT_FILM_ID, year: TEST_YEAR,
      trackKind: "susi_practical",
      verifiedCount: 8, weightedCount: 5.5, acceptedCount: 8,
      updatedAt: now,
    } satisfies Omit<AdmissionSampleStats, "id">,
    opts,
  );
  for (let i = 0; i < 8; i++) {
    await upsertDoc(
      db,
      `admissionResults/seed-${KNUA_ID}-${KNUA_DEPT_FILM_ID}-2026-${i}`,
      buildPracticalResult(now, KNUA_ID, KNUA_DEPT_FILM_ID, i),
      opts,
    );
  }
}

/* ───────────────────────────────────────────────────────────────────────
   학과 단위 helper — university + department + admissions 묶음 upsert
   ─────────────────────────────────────────────────────────────────────── */

async function upsertUniversityBundle(
  db: FirebaseFirestore.Firestore,
  opts: Options,
  universityId: string,
  departmentId: string,
  univ: Omit<University, "id">,
  dept: Omit<Department, "id">,
  admissions: Omit<DepartmentAdmissions, "id">,
): Promise<void> {
  await upsertDoc(db, `universities/${universityId}`, univ, opts);
  await upsertDoc(db, `universities/${universityId}/departments/${departmentId}`, dept, opts);
  await upsertDoc(
    db,
    `universities/${universityId}/departments/${departmentId}/admissions/${TEST_YEAR}`,
    admissions,
    opts,
  );
}

function buildHakjongResult(
  now: Timestamp,
  universityId: string,
  departmentId: string,
  idx: number,
): Omit<AdmissionResult, "id"> {
  return {
    universityId,
    departmentId,
    year: 2026,
    trackKind: "susi_comprehensive",
    trackName: "학생부종합전형",
    outcome: "accepted",
    passedStage1: true,
    specSnapshot: {
      schoolRecord: { gpaOverall: 1.8 + (idx % 3) * 0.1 },
      schoolType: "general",
      schoolActivity: { score: 70 + (idx % 4) * 5 },
    },
    confidence: 0.7,
    source: "self_report",
    verified: true,
    verifiedAt: now,
    createdAt: now,
  };
}

function buildJeongsiResult(
  now: Timestamp,
  universityId: string,
  departmentId: string,
  trackKind: "jeongsi_ga" | "jeongsi_na" | "jeongsi_da",
  idx: number,
): Omit<AdmissionResult, "id"> {
  return {
    universityId,
    departmentId,
    year: 2026,
    trackKind,
    trackName: "일반전형",
    outcome: "accepted",
    specSnapshot: {
      schoolRecord: { gpaOverall: 2.5 + (idx % 3) * 0.2 },
      csat: {
        koreanStd: 130 + (idx % 4) * 2,
        mathStd: 132 + (idx % 4) * 2,
        englishGrade: 2,
        investigationStdAvg: 65 + (idx % 4) * 1,
        historyGrade: 3,
      },
      schoolType: "general",
    },
    confidence: 0.7,
    source: "self_report",
    verified: true,
    verifiedAt: now,
    createdAt: now,
  };
}

function buildPracticalResult(
  now: Timestamp,
  universityId: string,
  departmentId: string,
  idx: number,
): Omit<AdmissionResult, "id"> {
  return {
    universityId,
    departmentId,
    year: 2026,
    trackKind: "susi_practical",
    trackName: "실기전형",
    outcome: "accepted",
    specSnapshot: {
      schoolRecord: { gpaOverall: 3.5 + (idx % 3) * 0.3 },
      schoolType: "general",
    },
    confidence: 0.6,
    source: "self_report",
    verified: true,
    verifiedAt: now,
    createdAt: now,
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   upsert 헬퍼
   ═══════════════════════════════════════════════════════════════════════ */

async function upsertDoc(
  db: FirebaseFirestore.Firestore,
  path: string,
  data: Record<string, unknown>,
  opts: Options,
): Promise<void> {
  const ref = db.doc(path);
  const existing = await ref.get();

  if (existing.exists && !opts.force) {
    console.log(`⏭  skip (exists): ${path}`);
    return;
  }

  if (opts.dryRun) {
    console.log(`💧 dry-run: ${path} (${existing.exists ? "overwrite" : "create"})`);
    return;
  }

  await ref.set(data, { merge: !opts.force });
  console.log(`✅ ${existing.exists ? "overwrite" : "create"}: ${path}`);
}

/* ═══════════════════════════════════════════════════════════════════════
   CLI
   ═══════════════════════════════════════════════════════════════════════ */

function parseArgs(): Options {
  const args = process.argv.slice(2);
  return {
    force: args.includes("--force"),
    dryRun: args.includes("--dry-run"),
  };
}

if (require.main === module) {
  main(parseArgs()).catch((e) => {
    console.error("🚨 초기화 실패:", e);
    process.exit(1);
  });
}
