/**
 * POST /api/compare — 학과 비교 (Pro/Elite 전용)
 *
 * 2~4개 (학과,트랙) 페어를 받아 모집인원·전년 컷·반영비·표본통계를 한 번에 반환.
 * baseSpecId 가 있으면 matchKrAdmissions 로 각 페어의 합격률·카테고리도 산출.
 *
 * 정책:
 *   - Pro 전용 (free 403)
 *   - 본인 외 baseSpecId 접근은 404 (열거 차단)
 *   - jaeoegukmin 트랙은 본 라우트로 비교 불가 (P-013) — 400
 *   - 표본 부족 학과는 probability=null + sampleSufficient=false (P-001 정직성 유지)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, zodErrorResponse } from "@/lib/api-auth";
import { getAdminDb } from "@/lib/firebase-admin";
import { CompareRequestSchema } from "@/lib/schemas/api/compare";
import { KrSpecsSchema, type KrSpecsInput } from "@/lib/schemas/api/match";
import {
  matchKrAdmissions,
  type CandidateProbability,
  type MatchCandidate,
} from "@/lib/matching-kr";
import type {
  AdmissionSampleStats,
  AdmissionTrack,
  AdmissionTrackKind,
  Department,
  DepartmentAdmissions,
  University,
  UserEntitlement,
} from "@/types/admission";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "유효하지 않은 JSON 본문" }, { status: 400 });
  }
  const parsed = CompareRequestSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const { items, baseSpecId } = parsed.data;

  if (items.some((i) => i.trackKind === "jaeoegukmin")) {
    return NextResponse.json(
      { error: "재외국민·외국인 전형은 비교 대상에서 제외됩니다 (P-013)." },
      { status: 400 },
    );
  }

  try {
    const db = getAdminDb();

    const plan = await loadPlan(auth.uid);
    if (plan === "free") {
      return NextResponse.json(
        { error: "학과 비교는 Pro 전용 기능입니다.", upgradeUrl: "/pricing" },
        { status: 403 },
      );
    }

    const year = new Date().getFullYear() + 1;

    // baseSpec 로드 (선택) — 본인 검증 + specsSnapshot 추출
    let baseSpecs: KrSpecsInput | null = null;
    if (baseSpecId) {
      const matchSnap = await db.collection("matches").doc(baseSpecId).get();
      if (!matchSnap.exists) {
        return NextResponse.json(
          { error: "기준 분석 결과를 찾을 수 없습니다." },
          { status: 404 },
        );
      }
      const matchData = matchSnap.data() as {
        userId: string;
        specsSnapshot?: KrSpecsInput;
      };
      if (matchData.userId !== auth.uid) {
        return NextResponse.json(
          { error: "기준 분석 결과를 찾을 수 없습니다." },
          { status: 404 },
        );
      }
      if (matchData.specsSnapshot) {
        const validated = KrSpecsSchema.safeParse(matchData.specsSnapshot);
        if (validated.success) baseSpecs = validated.data;
      }
    }

    // 각 페어 enrich — 병렬 fetch (4개 이내라 부담 적음)
    const enriched = await Promise.all(
      items.map((item) => loadCompareItem(item, year)),
    );

    // 누락 페어 (학과 또는 트랙 부재) → 응답에 reason 명시
    // matchKrAdmissions 는 정상 페어만 통과
    const validCandidates: MatchCandidate[] = [];
    for (const e of enriched) {
      if (e.kind === "ok") validCandidates.push(e.candidate);
    }

    let probMap: Map<string, CandidateProbability> = new Map();
    let globalCaveats: string[] = [];
    if (baseSpecs && validCandidates.length > 0) {
      const result = matchKrAdmissions({ specs: baseSpecs, candidates: validCandidates });
      globalCaveats = result.globalCaveats;
      for (const r of result.results) {
        const key = `${r.candidate.universityId}_${r.candidate.departmentId}_${r.candidate.trackKind}_${r.candidate.trackName}`;
        probMap.set(key, r);
      }
    }

    const responseItems = enriched.map((e) => {
      if (e.kind !== "ok") return e.payload;
      const key = `${e.candidate.universityId}_${e.candidate.departmentId}_${e.candidate.trackKind}_${e.candidate.trackName}`;
      const probEntry = probMap.get(key);
      return buildItemResponse(e, probEntry);
    });

    return NextResponse.json({
      baseSpecId: baseSpecId ?? null,
      hasBaseSpec: baseSpecs !== null,
      year,
      items: responseItems,
      globalCaveats,
    });
  } catch (e) {
    console.error("[/api/compare] error:", e);
    return NextResponse.json(
      { error: "비교 처리 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   item 로드
   ═══════════════════════════════════════════════════════════════════════ */

interface LoadOk {
  kind: "ok";
  input: { universityId: string; departmentId: string; trackKind: AdmissionTrackKind; trackName?: string };
  university: Pick<University, "id" | "n" | "category" | "campuses">;
  department: Pick<Department, "id" | "name" | "track">;
  admissions: DepartmentAdmissions;
  track: AdmissionTrack;
  sampleStats?: AdmissionSampleStats;
  candidate: MatchCandidate;
}

interface LoadFail {
  kind: "fail";
  payload: {
    universityId: string;
    departmentId: string;
    trackKind: AdmissionTrackKind;
    trackName?: string;
    error: string;
  };
}

async function loadCompareItem(
  item: { universityId: string; departmentId: string; trackKind: AdmissionTrackKind; trackName?: string },
  year: number,
): Promise<LoadOk | LoadFail> {
  const db = getAdminDb();

  const [univSnap, depSnap, admSnap] = await Promise.all([
    db.collection("universities").doc(item.universityId).get(),
    db
      .collection("universities").doc(item.universityId)
      .collection("departments").doc(item.departmentId)
      .get(),
    db
      .collection("universities").doc(item.universityId)
      .collection("departments").doc(item.departmentId)
      .collection("admissions").doc(String(year))
      .get(),
  ]);

  if (!univSnap.exists || !depSnap.exists) {
    return failItem(item, "학과 또는 대학 정보를 찾을 수 없습니다.");
  }
  if (!admSnap.exists) {
    return failItem(item, `${year}학년도 모집요강이 등록되지 않았습니다.`);
  }

  const univ = univSnap.data() as University;
  const dep = depSnap.data() as Department;
  const adm = admSnap.data() as DepartmentAdmissions;

  const trackList = adm.tracks[item.trackKind] ?? [];
  if (trackList.length === 0) {
    return failItem(item, "해당 전형이 운영되지 않습니다.");
  }
  const track =
    (item.trackName && trackList.find((t) => t.name === item.trackName)) ||
    trackList[0];

  const statsId = `${item.universityId}_${item.departmentId}_${year}_${item.trackKind}`;
  const statsSnap = await db.collection("admissionSampleStats").doc(statsId).get();
  const sampleStats = statsSnap.exists
    ? (statsSnap.data() as AdmissionSampleStats)
    : undefined;

  return {
    kind: "ok",
    input: item,
    university: { id: univ.id, n: univ.n, category: univ.category, campuses: univ.campuses },
    department: { id: dep.id, name: dep.name, track: dep.track },
    admissions: adm,
    track,
    sampleStats,
    candidate: {
      universityId: univ.id,
      universityName: univ.n,
      departmentId: dep.id,
      departmentName: dep.name,
      trackKind: item.trackKind,
      trackName: track.name,
      track,
      prevYearResult: adm.prevYearResult,
      sampleStats,
    },
  };
}

function failItem(
  item: { universityId: string; departmentId: string; trackKind: AdmissionTrackKind; trackName?: string },
  error: string,
): LoadFail {
  return {
    kind: "fail",
    payload: {
      universityId: item.universityId,
      departmentId: item.departmentId,
      trackKind: item.trackKind,
      trackName: item.trackName,
      error,
    },
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   응답 빌드
   ═══════════════════════════════════════════════════════════════════════ */

function buildItemResponse(e: LoadOk, prob: CandidateProbability | undefined) {
  const t = e.track;
  return {
    universityId: e.university.id,
    universityName: e.university.n,
    universityCategory: e.university.category,
    departmentId: e.department.id,
    departmentName: e.department.name,
    departmentTrack: e.department.track,
    trackKind: e.input.trackKind,
    trackName: t.name,
    quotaInitial: t.quotaInitial,
    quotaFinal: t.quotaFinal ?? null,
    csatMinimum: t.csatMinimum ?? null,
    reflectionRatio: t.reflectionRatio ?? null,
    schedule: t.schedule ?? null,
    notes: t.notes ?? null,
    prevYearResult: e.admissions.prevYearResult ?? null,
    sampleStats: e.sampleStats
      ? {
          acceptedCount: e.sampleStats.acceptedCount,
          weightedCount: e.sampleStats.weightedCount,
          stage1PassedCount: e.sampleStats.stage1PassedCount ?? null,
          stage2AcceptedCount: e.sampleStats.stage2AcceptedCount ?? null,
        }
      : null,
    // baseSpec 가 있을 때만 — 정직성 원칙 그대로 (표본 부족이면 probability null)
    probability: prob
      ? {
          category: prob.probability.category,
          probability: prob.probability.probability,
          low: prob.probability.low,
          high: prob.probability.high,
          sampleSufficient: prob.probability.sampleSufficient,
          sampleN: prob.probability.sampleN,
          weightedSampleN: prob.probability.weightedSampleN,
          hakjong: prob.probability.hakjong ?? null,
          caveats: prob.caveats,
        }
      : null,
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   plan
   ═══════════════════════════════════════════════════════════════════════ */

async function loadPlan(uid: string): Promise<"free" | "pro" | "elite"> {
  try {
    const db = getAdminDb();
    const snap = await db
      .collection("users").doc(uid)
      .collection("entitlements")
      .doc("current")
      .get();
    if (!snap.exists) return "free";
    const ent = snap.data() as UserEntitlement;
    return ent.currentPlan ?? "free";
  } catch {
    return "free";
  }
}
