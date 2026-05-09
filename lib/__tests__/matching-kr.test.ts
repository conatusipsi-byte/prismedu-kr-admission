/**
 * matching-kr — 한국 입시 매칭 어댑터 회귀
 *
 * 검증 범위:
 *   1. normalizeKrSpecs — 내신 가중평균, 표준점수 평균, 등급 합, 비교과 합산
 *   2. evaluateRequiredAreasForTrack — B1 응시영역 자격 충족/미충족
 *   3. matchSingle — 일반 트랙
 *      - 정상 케이스 (분류 sanity)
 *      - 자격 미달 → 확률 1, caveat 첨부
 *      - 표본 부족 → category=insufficient_sample
 *      - 정시 + preliminary 변환표 → P-012 caveat 첨부
 *   4. matchSingle — 학종(susi_comprehensive) → HakjongProbability 분해
 *   5. matchKrAdmissions — 정렬·globalCaveats·외국 고교 거절
 *   6. polarity 변환 utility (kraGradeToUsGpa)
 */

import { describe, it, expect } from "vitest";
import {
  evaluateRequiredAreasForTrack,
  isJeongsiKind,
  kraGradeToUsGpa,
  kraStandardScoreToSat,
  matchKrAdmissions,
  matchSingle,
  normalizeKrSpecs,
  type MatchCandidate,
  type NormalizedStudent,
} from "@/lib/matching-kr";
import type { KrSpecsInput } from "@/lib/schemas/api/match";
import type {
  AdmissionSampleStats,
  AdmissionTrack,
  PrevYearResult,
  Timestamp,
} from "@/types/admission";

const TS: Timestamp = {
  seconds: 0,
  nanoseconds: 0,
  toDate: () => new Date(0),
  toMillis: () => 0,
};

/* ═══════════════════════════════════════════════════════════════════════
   Fixtures — KrSpecsInput
   ═══════════════════════════════════════════════════════════════════════ */

function specs(overrides: Partial<KrSpecsInput> = {}): KrSpecsInput {
  const base: KrSpecsInput = {
    basic: { gradeLevel: "high3", track: "natural", abroadHighSchool: "no" },
    score: {
      naesin: [
        { schoolYear: 1, semester: 1, relativeGpa: 1.5, absoluteGpa: null, totalUnits: 28 },
        { schoolYear: 1, semester: 2, relativeGpa: 1.4, absoluteGpa: null, totalUnits: 30 },
      ],
      csat: {
        actual: false,
        korean: { standard: 130, percentile: 95, grade: 2, course: "language_media" },
        math: { standard: 135, percentile: 96, grade: 1, course: "calculus" },
        english: { grade: 2 },
        history: { grade: 3 },
        investigation: [
          { course: "물리학I", type: "science", standard: 70, percentile: 95, grade: 1 },
          { course: "화학I",   type: "science", standard: 68, percentile: 93, grade: 2 },
        ],
      },
    },
    extra: {
      autonomous: { hours: 30, participationCount: 5 },
      club: { hours: 60, participationCount: 12, yearsPersistent: 3 },
      volunteering: { hours: 20, participationCount: 4 },
      career: { hours: 40, participationCount: 8, majorAlignment: 5 },
      detailedAbility: { entriesCount: 20, majorRelatedCount: 12, qualityScore: 4 },
      behavioralCharacteristics: { qualityScore: 4 },
      schoolType: "general",
    },
  };
  // 얕은 머지 정도면 충분 — 테스트는 deep override 안 사용.
  return { ...base, ...overrides };
}

function jeongsiTrack(overrides: Partial<AdmissionTrack> = {}): AdmissionTrack {
  return {
    name: "일반전형",
    kind: "jeongsi_na",
    specialType: "general",
    quotaInitial: 105,
    stages: [{ step: 1, components: { csat: 100 } }],
    requiredAreas: {
      math: { courses: ["calculus", "geometry"], required: true },
      english: true,
      history: true,
      investigation: { types: ["science"], requiredCount: 2 },
    },
    ...overrides,
  };
}

function hakjongTrack(overrides: Partial<AdmissionTrack> = {}): AdmissionTrack {
  return {
    name: "학생부종합전형",
    kind: "susi_comprehensive",
    specialType: "general",
    quotaInitial: 60,
    stages: [
      { step: 1, multiplier: 3, components: { document: 100 } },
      { step: 2, components: { document: 70, interview: 30 } },
    ],
    ...overrides,
  };
}

function prevYear(overrides: Partial<PrevYearResult> = {}): PrevYearResult {
  return {
    competitionRate: 5,
    cutoffAvg: 290,
    cutoff70: 288,
    gradeCutoffAvg: 1.8,
    gradeCutoff70: 2.0,
    stage1ApplicantCount: 600,
    stage1PassCount: 180,
    stage1GradeCutoff: 2.2,
    stage2PassRate: 0.42,
    ...overrides,
  };
}

function sampleStats(overrides: Partial<AdmissionSampleStats> = {}): AdmissionSampleStats {
  return {
    id: "univ_dept_2027_jeongsi_na",
    universityId: "univ",
    departmentId: "dept",
    year: 2027,
    trackKind: "jeongsi_na",
    verifiedCount: 20,
    weightedCount: 15.0,
    acceptedCount: 12,
    stage1PassedCount: 30,
    stage2AcceptedCount: 12,
    updatedAt: TS,
    ...overrides,
  };
}

function candidate(
  trackOverride: Partial<AdmissionTrack> = {},
  prevOverride: Partial<PrevYearResult> = {},
  sampleOverride: Partial<AdmissionSampleStats> = {},
): MatchCandidate {
  const track = trackOverride.kind === "susi_comprehensive"
    ? hakjongTrack(trackOverride)
    : jeongsiTrack(trackOverride);
  return {
    universityId: "univ",
    universityName: "테스트대학교",
    departmentId: "dept",
    departmentName: "테스트학과",
    trackKind: track.kind,
    trackName: track.name,
    track,
    prevYearResult: prevYear(prevOverride),
    sampleStats: sampleStats({ ...sampleOverride, trackKind: track.kind }),
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   1. normalizeKrSpecs — 정규화 + polarity
   ═══════════════════════════════════════════════════════════════════════ */

describe("normalizeKrSpecs", () => {
  it("내신 가중평균 등급 (단위수 가중) 산출", () => {
    const n = normalizeKrSpecs(specs());
    // (1.5*28 + 1.4*30) / (28+30) = (42 + 42) / 58 = 84/58 ≈ 1.448...
    expect(n.naesinGpa).toBeCloseTo(1.4483, 3);
  });

  it("수능 표준점수 평균 (국·수·탐평균)", () => {
    const n = normalizeKrSpecs(specs());
    // 국 130, 수 135, 탐평균 (70+68)/2=69 → 평균 (130+135+69)/3 ≈ 111.33
    expect(n.csatStdAvg).toBeCloseTo(111.33, 1);
  });

  it("수능 등급 합 (국+수+탐평균)", () => {
    const n = normalizeKrSpecs(specs());
    // 국 2, 수 1, 탐평균 (1+2)/2=1.5 → 합 4.5
    expect(n.csatGradeSum).toBeCloseTo(4.5);
  });

  it("응시 메타: math 'calculus' + science 2과목", () => {
    const n = normalizeKrSpecs(specs());
    expect(n.csatMeta.mathCourse).toBe("calculus");
    expect(n.csatMeta.investigationTypes).toEqual(["science", "science"]);
    expect(n.csatMeta.investigationCount).toBe(2);
  });

  it("비교과 합산 점수 (cap 12)", () => {
    const n = normalizeKrSpecs(specs());
    expect(n.extraScore).not.toBeNull();
    expect(n.extraScore!).toBeGreaterThan(0);
    expect(n.extraScore!).toBeLessThanOrEqual(12);
  });

  it("내신 모두 미입력 → naesinGpa null", () => {
    const n = normalizeKrSpecs(
      specs({
        basic: { gradeLevel: "high1", track: "natural", abroadHighSchool: "no" },
        score: {
          naesin: [],
          csat: {
            actual: false,
            korean: { standard: null, percentile: null, grade: null, course: null },
            math: { standard: null, percentile: null, grade: null, course: null },
            english: { grade: null },
            history: { grade: null },
            investigation: [],
          },
        },
        extra: specs().extra,
      }),
    );
    expect(n.naesinGpa).toBeNull();
    expect(n.csatStdAvg).toBeNull();
    expect(n.csatGradeSum).toBeNull();
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   2. B1 응시영역 자격
   ═══════════════════════════════════════════════════════════════════════ */

describe("evaluateRequiredAreasForTrack — B1 응시영역 자격", () => {
  it("미적분 + 과탐2 → eligible=true", () => {
    const n = normalizeKrSpecs(specs());
    const out = evaluateRequiredAreasForTrack(n, jeongsiTrack());
    expect(out.eligible).toBe(true);
    expect(out.reasons).toEqual([]);
  });

  it("확률과통계 → eligible=false (수학 미달)", () => {
    const n: NormalizedStudent = {
      ...normalizeKrSpecs(specs()),
      csatMeta: {
        mathCourse: "probability_statistics",
        investigationTypes: ["science", "science"],
        investigationCount: 2,
      },
    };
    const out = evaluateRequiredAreasForTrack(n, jeongsiTrack());
    expect(out.eligible).toBe(false);
    expect(out.reasons.some((r) => /수학/.test(r))).toBe(true);
  });

  it("사탐 2과목 → eligible=false (탐구 미달)", () => {
    const n: NormalizedStudent = {
      ...normalizeKrSpecs(specs()),
      csatMeta: {
        mathCourse: "calculus",
        investigationTypes: ["social", "social"],
        investigationCount: 2,
      },
    };
    const out = evaluateRequiredAreasForTrack(n, jeongsiTrack());
    expect(out.eligible).toBe(false);
    expect(out.reasons.some((r) => /탐구/.test(r))).toBe(true);
  });

  it("requiredAreas 없는 트랙 → 항상 eligible=true", () => {
    const n: NormalizedStudent = {
      ...normalizeKrSpecs(specs()),
      csatMeta: {
        mathCourse: "probability_statistics",
        investigationTypes: ["social"],
        investigationCount: 1,
      },
    };
    const out = evaluateRequiredAreasForTrack(n, hakjongTrack()); // 학종은 requiredAreas 없음
    expect(out.eligible).toBe(true);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   3. matchSingle — 일반 트랙
   ═══════════════════════════════════════════════════════════════════════ */

describe("matchSingle — 일반 트랙", () => {
  it("정상 케이스: 우수 학생 + 표본 충족 → probability 양수, sampleSufficient=true", () => {
    const n = normalizeKrSpecs(specs());
    const r = matchSingle(n, candidate());
    expect(r.probability.sampleSufficient).toBe(true);
    expect(r.probability.probability).not.toBeNull();
    expect(r.probability.probability!).toBeGreaterThan(0);
    expect(r.probability.probability!).toBeLessThanOrEqual(95);
    expect(r.caveats).toEqual([]);
  });

  it("자격 미달 (확통 + 자연계 트랙) → probability=1, caveat에 '자격 미달' 포함", () => {
    const sp = specs();
    sp.score.csat.math = { ...sp.score.csat.math, course: "probability_statistics" };
    const n = normalizeKrSpecs(sp);
    const r = matchSingle(n, candidate());
    expect(r.probability.probability).toBe(1);
    expect(r.caveats.some((c) => /자격 미달/.test(c))).toBe(true);
    // 자격 미달은 표본 부족이 아님
    expect(r.probability.sampleSufficient).toBe(true);
  });

  it("표본 부족 → category='insufficient_sample', probability null", () => {
    const n = normalizeKrSpecs(specs());
    const r = matchSingle(n, candidate({}, {}, { acceptedCount: 1, weightedCount: 0.5 }));
    expect(r.probability.category).toBe("insufficient_sample");
    expect(r.probability.probability).toBeNull();
    expect(r.probability.sampleSufficient).toBe(false);
  });

  it("정시 + preliminary 변환표 → caveat에 'P-012' 포함", () => {
    const n = normalizeKrSpecs(specs());
    const r = matchSingle(
      n,
      candidate({
        conversionTable: { status: "preliminary", sourceUrl: "https://..." },
      }),
    );
    expect(r.caveats.some((c) => /P-012|변환표/.test(c))).toBe(true);
  });

  it("학종 트랙(susi_comprehensive)은 preliminary caveat 미부착 (정시 전용)", () => {
    const n = normalizeKrSpecs(specs());
    const r = matchSingle(
      n,
      candidate({
        kind: "susi_comprehensive",
        conversionTable: { status: "preliminary", sourceUrl: "https://..." },
      }, {}, { trackKind: "susi_comprehensive" }),
    );
    expect(r.caveats.some((c) => /P-012/.test(c))).toBe(false);
  });

  it("확률은 PROB_FLOOR=1, PROB_CEILING=95 내", () => {
    // 매우 약한 학생
    const sp = specs({
      ...specs(),
      score: {
        naesin: [{ schoolYear: 1, semester: 1, relativeGpa: 8.5, absoluteGpa: null, totalUnits: 30 }],
        csat: specs().score.csat,
      },
    } as KrSpecsInput);
    const n = normalizeKrSpecs(sp);
    const r = matchSingle(n, candidate());
    expect(r.probability.probability).not.toBeNull();
    expect(r.probability.probability!).toBeGreaterThanOrEqual(1);
    expect(r.probability.probability!).toBeLessThanOrEqual(95);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   4. matchSingle — 학종(P-006 분해)
   ═══════════════════════════════════════════════════════════════════════ */

describe("matchSingle — 학종 트랙 (P-006 분해)", () => {
  it("학종 표본 충족 → hakjong 필드 채워짐 (stage1Pass·stage2Pass·combined)", () => {
    const n = normalizeKrSpecs(specs());
    const r = matchSingle(
      n,
      candidate(
        { kind: "susi_comprehensive" },
        {},
        { trackKind: "susi_comprehensive", stage1PassedCount: 30, stage2AcceptedCount: 12 },
      ),
    );
    expect(r.probability.hakjong).toBeDefined();
    expect(r.probability.hakjong!.sampleSufficient).toBe(true);
    expect(r.probability.hakjong!.stage1Pass).not.toBeNull();
    expect(r.probability.hakjong!.stage2Pass).not.toBeNull();
    expect(r.probability.hakjong!.combined).not.toBeNull();
  });

  it("학종 표본 부족 (stage1 < 7) → hakjong.sampleSufficient=false, 분해 null", () => {
    const n = normalizeKrSpecs(specs());
    const r = matchSingle(
      n,
      candidate(
        { kind: "susi_comprehensive" },
        {},
        {
          trackKind: "susi_comprehensive",
          // 일반 표본은 충족 (verifiedCount/acceptedCount), 분해 임계만 미달
          stage1PassedCount: 3,
          stage2AcceptedCount: 12,
        },
      ),
    );
    expect(r.probability.hakjong).toBeDefined();
    expect(r.probability.hakjong!.sampleSufficient).toBe(false);
    expect(r.probability.hakjong!.stage1Pass).toBeNull();
    expect(r.probability.hakjong!.stage2Pass).toBeNull();
    expect(r.probability.hakjong!.combined).toBeNull();
    // 일반 probability는 fallback으로 산출됨
    expect(r.probability.probability).not.toBeNull();
  });

  it("학종 일반 표본 자체가 부족 → category=insufficient_sample (분해 자체 진입 안 함)", () => {
    const n = normalizeKrSpecs(specs());
    const r = matchSingle(
      n,
      candidate(
        { kind: "susi_comprehensive" },
        {},
        {
          trackKind: "susi_comprehensive",
          acceptedCount: 1,
          weightedCount: 0.5,
        },
      ),
    );
    expect(r.probability.category).toBe("insufficient_sample");
    expect(r.probability.hakjong).toBeUndefined();
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   5. matchKrAdmissions — 메인
   ═══════════════════════════════════════════════════════════════════════ */

describe("matchKrAdmissions — 메인 진입점", () => {
  it("결과는 확률 desc 정렬 (insufficient_sample은 끝)", () => {
    const out = matchKrAdmissions({
      specs: specs(),
      candidates: [
        candidate({}, { competitionRate: 20 }), // 경쟁률 높음 → base 작음
        candidate({}, { competitionRate: 2 }),  // 경쟁률 낮음 → base 큼
        candidate({}, {}, { acceptedCount: 1 }), // 표본 부족
      ],
    });
    expect(out.results).toHaveLength(3);
    // 첫 결과 확률 ≥ 둘째 (둘 다 sufficient)
    const p0 = out.results[0].probability.probability;
    const p1 = out.results[1].probability.probability;
    expect(p0).not.toBeNull();
    expect(p1).not.toBeNull();
    expect(p0!).toBeGreaterThanOrEqual(p1!);
    // 마지막은 insufficient_sample
    expect(out.results[2].probability.category).toBe("insufficient_sample");
  });

  it("preliminary 학과가 있으면 globalCaveats에 P-012 안내", () => {
    const out = matchKrAdmissions({
      specs: specs(),
      candidates: [
        candidate({ conversionTable: { status: "preliminary", sourceUrl: "https://..." } }),
      ],
    });
    expect(out.globalCaveats.some((c) => /P-012|변환표/.test(c))).toBe(true);
  });

  it("표본 부족 학과 비율을 globalCaveats에 안내 (P-001)", () => {
    const out = matchKrAdmissions({
      specs: specs(),
      candidates: [
        candidate(),
        candidate({}, {}, { acceptedCount: 1 }),
        candidate({}, {}, { acceptedCount: 0 }),
      ],
    });
    expect(out.globalCaveats.some((c) => /표본/.test(c))).toBe(true);
  });

  it("외국 고교 답변 (스키마 우회 시) → 빈 결과 + 안내 caveat", () => {
    const sp = { ...specs(), basic: { ...specs().basic, abroadHighSchool: "yes" as unknown as "no" } };
    const out = matchKrAdmissions({ specs: sp, candidates: [candidate()] });
    expect(out.results).toEqual([]);
    expect(out.globalCaveats.some((c) => /jaeoegukmin|재외국민/.test(c))).toBe(true);
  });

  it("후보 0개 → 빈 결과", () => {
    const out = matchKrAdmissions({ specs: specs(), candidates: [] });
    expect(out.results).toEqual([]);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   6. utility — polarity 변환
   ═══════════════════════════════════════════════════════════════════════ */

describe("utility — kraGradeToUsGpa / kraStandardScoreToSat", () => {
  it("등급 1 → 4.5 (최우수, US 4.0 초과 표현)", () => {
    expect(kraGradeToUsGpa(1)).toBe(4.5);
  });
  it("등급 5 → 2.5 (중간 baseline)", () => {
    expect(kraGradeToUsGpa(5)).toBe(2.5);
  });
  it("등급 9 → 0.5 (최저), polarity 반전 정상", () => {
    expect(kraGradeToUsGpa(9)).toBe(0.5);
  });
  it("등급 1.5 < 등급 3 < 등급 5 (polarity 검증 — 작을수록 변환값 큼)", () => {
    expect(kraGradeToUsGpa(1.5)).toBeGreaterThan(kraGradeToUsGpa(3));
    expect(kraGradeToUsGpa(3)).toBeGreaterThan(kraGradeToUsGpa(5));
  });

  it("표준점수 100 → SAT 1000 (대략)", () => {
    expect(kraStandardScoreToSat(100)).toBe(1000);
  });
  it("표준점수 130 → SAT 1360", () => {
    expect(kraStandardScoreToSat(130)).toBe(1360);
  });
  it("표준점수는 polarity 정상 (높을수록 SAT 큼)", () => {
    expect(kraStandardScoreToSat(140)).toBeGreaterThan(kraStandardScoreToSat(120));
  });
});

describe("isJeongsiKind — 분기 헬퍼", () => {
  it("jeongsi_ga/na/da → true, 그 외 → false", () => {
    expect(isJeongsiKind("jeongsi_ga")).toBe(true);
    expect(isJeongsiKind("jeongsi_na")).toBe(true);
    expect(isJeongsiKind("jeongsi_da")).toBe(true);
    expect(isJeongsiKind("susi_subject")).toBe(false);
    expect(isJeongsiKind("susi_comprehensive")).toBe(false);
    expect(isJeongsiKind("jaeoegukmin")).toBe(false);
  });
});
