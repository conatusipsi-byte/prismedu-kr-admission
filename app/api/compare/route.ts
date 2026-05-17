/**
 * POST /api/compare — 학과 비교 (Pro/Elite 전용, Supabase).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, zodErrorResponse } from "@/lib/api-auth";
import { getAdminSupabase } from "@/lib/supabase-server";
import { reportRouteError } from "@/lib/sentry-report";
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
    const sb = getAdminSupabase();

    const plan = await loadPlan(auth.uid);
    if (plan === "free") {
      return NextResponse.json(
        { error: "학과 비교는 Pro 전용 기능입니다.", upgradeUrl: "/pricing" },
        { status: 403 },
      );
    }

    const year = new Date().getFullYear() + 1;

    let baseSpecs: KrSpecsInput | null = null;
    if (baseSpecId) {
      const { data: matchRow, error: matchErr } = await sb
        .from("matches")
        .select("user_id, specs_snapshot")
        .eq("id", baseSpecId)
        .maybeSingle();
      if (matchErr || !matchRow) {
        return NextResponse.json(
          { error: "기준 분석 결과를 찾을 수 없습니다." },
          { status: 404 },
        );
      }
      const row = matchRow as { user_id: string; specs_snapshot: KrSpecsInput | null };
      if (row.user_id !== auth.uid) {
        return NextResponse.json(
          { error: "기준 분석 결과를 찾을 수 없습니다." },
          { status: 404 },
        );
      }
      if (row.specs_snapshot) {
        const validated = KrSpecsSchema.safeParse(row.specs_snapshot);
        if (validated.success) baseSpecs = validated.data;
      }
    }

    const enriched = await Promise.all(
      items.map((item) => loadCompareItem(item, year)),
    );

    const validCandidates: MatchCandidate[] = [];
    for (const e of enriched) {
      if (e.kind === "ok") validCandidates.push(e.candidate);
    }

    const probMap: Map<string, CandidateProbability> = new Map();
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
    reportRouteError("api.compare", e, { uid: auth.uid, itemCount: items.length });
    return NextResponse.json(
      { error: "비교 처리 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   item 로드 — Supabase 임베드 select 로 한 번에
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
  const sb = getAdminSupabase();

  const admId = `${item.universityId}_${item.departmentId}_${year}`;
  const statsId = `${item.universityId}_${item.departmentId}_${year}_${item.trackKind}`;

  const [univR, depR, admR, statsR] = await Promise.all([
    sb.from("universities").select("id, n, category, campuses").eq("id", item.universityId).maybeSingle(),
    sb.from("departments").select("id, name, track").eq("university_id", item.universityId).eq("id", item.departmentId).maybeSingle(),
    sb.from("department_admissions").select("tracks, prev_year_result, available_track_kinds").eq("id", admId).maybeSingle(),
    sb.from("admission_sample_stats").select("verified_count, weighted_count, accepted_count, stage1_passed_count, stage2_accepted_count").eq("id", statsId).maybeSingle(),
  ]);

  if (!univR.data || !depR.data) {
    return failItem(item, "학과 또는 대학 정보를 찾을 수 없습니다.");
  }
  if (!admR.data) {
    return failItem(item, `${year}학년도 모집요강이 등록되지 않았습니다.`);
  }

  const univ = univR.data as { id: string; n: string; category: University["category"]; campuses: University["campuses"] };
  const dep = depR.data as { id: string; name: string; track: Department["track"] };
  const adm = admR.data as {
    tracks: DepartmentAdmissions["tracks"];
    prev_year_result: DepartmentAdmissions["prevYearResult"];
    available_track_kinds: AdmissionTrackKind[];
  };

  const trackList = adm.tracks[item.trackKind] ?? [];
  if (trackList.length === 0) {
    return failItem(item, "해당 전형이 운영되지 않습니다.");
  }
  const track =
    (item.trackName && trackList.find((t) => t.name === item.trackName)) ||
    trackList[0];

  const sampleStats: AdmissionSampleStats | undefined = statsR.data
    ? {
        id: statsId,
        universityId: item.universityId,
        departmentId: item.departmentId,
        year,
        trackKind: item.trackKind,
        verifiedCount: (statsR.data as Record<string, unknown>).verified_count as number,
        weightedCount: (statsR.data as Record<string, unknown>).weighted_count as number,
        acceptedCount: (statsR.data as Record<string, unknown>).accepted_count as number,
        stage1PassedCount: (statsR.data as Record<string, unknown>).stage1_passed_count as number | undefined,
        stage2AcceptedCount: (statsR.data as Record<string, unknown>).stage2_accepted_count as number | undefined,
        updatedAt: new Date().toISOString() as unknown as AdmissionSampleStats["updatedAt"],
      }
    : undefined;

  // 부분 DepartmentAdmissions — buildItemResponse 가 prevYearResult / tracks 만 사용
  const admissionsView: DepartmentAdmissions = {
    id: admId,
    universityId: item.universityId,
    departmentId: item.departmentId,
    year,
    tracks: adm.tracks,
    availableTrackKinds: adm.available_track_kinds,
    prevYearResult: adm.prev_year_result,
    source: { parsedAt: new Date().toISOString() as unknown as DepartmentAdmissions["source"]["parsedAt"], parserVersion: "supabase-v1" },
    updatedAt: new Date().toISOString() as unknown as DepartmentAdmissions["updatedAt"],
  };

  return {
    kind: "ok",
    input: item,
    university: univ,
    department: dep,
    admissions: admissionsView,
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
      prevYearResult: adm.prev_year_result,
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

async function loadPlan(uid: string): Promise<"free" | "pro" | "elite"> {
  try {
    const sb = getAdminSupabase();
    const { data, error } = await sb
      .from("user_entitlements")
      .select("current_plan")
      .eq("user_id", uid)
      .maybeSingle();
    if (error || !data) return "free";
    return ((data as { current_plan: string }).current_plan as "free" | "pro" | "elite") ?? "free";
  } catch {
    return "free";
  }
}
