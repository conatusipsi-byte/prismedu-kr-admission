/**
 * POST /api/match/simulate — what-if 시뮬레이터 (Pro/Elite, Supabase).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, zodErrorResponse } from "@/lib/api-auth";
import { getAdminSupabase } from "@/lib/supabase-server";
import { reportRouteError } from "@/lib/sentry-report";
import {
  KrSpecsSchema,
  MatchSimulateSchema,
  type KrSpecsInput,
} from "@/lib/schemas/api/match";
import {
  matchKrAdmissions,
  type MatchCandidate,
} from "@/lib/matching-kr";
import type {
  AdmissionSampleStats,
  AdmissionTrackKind,
  Department,
  DepartmentAdmissions,
  University,
} from "@/types/admission";

const DEFAULT_CANDIDATE_LIMIT = 60;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "유효하지 않은 JSON 본문" }, { status: 400 });
  }
  const parsed = MatchSimulateSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const { baseSpecId, override } = parsed.data;

  try {
    const plan = await loadPlan(auth.uid);
    if (plan === "free") {
      return NextResponse.json(
        {
          error: "What-if 시뮬레이터는 Pro 전용 기능입니다.",
          upgradeUrl: "/pricing",
        },
        { status: 403 },
      );
    }

    const sb = getAdminSupabase();
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
    if (!row.specs_snapshot) {
      return NextResponse.json(
        { error: "기준 분석에 사용된 spec 데이터가 없습니다. 새 분석을 먼저 진행해주세요." },
        { status: 400 },
      );
    }

    const simulatedSpecs = applyOverride(row.specs_snapshot, override);
    const validated = KrSpecsSchema.safeParse(simulatedSpecs);
    if (!validated.success) {
      return NextResponse.json(
        { error: "override 적용 후 spec이 유효하지 않습니다." },
        { status: 400 },
      );
    }

    const candidates = await loadCandidates(validated.data, DEFAULT_CANDIDATE_LIMIT);
    const { results, globalCaveats } = matchKrAdmissions({
      specs: validated.data,
      candidates,
    });

    return NextResponse.json({
      simulated: true,
      baseSpecId,
      results,
      globalCaveats,
      override,
      candidateCount: candidates.length,
    });
  } catch (e) {
    reportRouteError("api.match.simulate", e, { uid: auth.uid, baseSpecId });
    return NextResponse.json(
      { error: "시뮬레이션 처리 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   override 적용 (순수)
   ═══════════════════════════════════════════════════════════════════════ */

function applyOverride(
  base: KrSpecsInput,
  override: { csat?: { koreanGrade?: number; mathGrade?: number; englishGrade?: number; investigationGradeAvg?: number }; naesinGpa?: number },
): KrSpecsInput {
  const next: KrSpecsInput = JSON.parse(JSON.stringify(base));

  if (override.csat) {
    if (override.csat.koreanGrade != null) {
      next.score.csat.korean.grade = clampGrade(override.csat.koreanGrade);
    }
    if (override.csat.mathGrade != null) {
      next.score.csat.math.grade = clampGrade(override.csat.mathGrade);
    }
    if (override.csat.englishGrade != null) {
      next.score.csat.english.grade = clampGrade(override.csat.englishGrade);
    }
    if (override.csat.investigationGradeAvg != null) {
      const avg = clampGrade(Math.round(override.csat.investigationGradeAvg));
      next.score.csat.investigation = next.score.csat.investigation.map((i) => ({
        ...i,
        grade: avg,
      }));
    }
  }

  if (override.naesinGpa != null) {
    const gpa = Math.max(1, Math.min(9, override.naesinGpa));
    next.score.naesin = next.score.naesin.map((e) => ({
      ...e,
      relativeGpa: gpa,
    }));
  }

  return next;
}

function clampGrade(g: number): 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 {
  const r = Math.max(1, Math.min(9, Math.round(g)));
  return r as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
}

/* ═══════════════════════════════════════════════════════════════════════
   매칭 헬퍼 — /api/match 와 동일 로직 (추후 lib 로 통합 권장)
   ═══════════════════════════════════════════════════════════════════════ */

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

async function loadCandidates(
  specs: KrSpecsInput,
  limit: number,
): Promise<MatchCandidate[]> {
  const sb = getAdminSupabase();
  const year = new Date().getFullYear() + 1;

  const { data, error } = await sb
    .from("departments")
    .select(`
      id, university_id, name, track, active, updated_at,
      universities!inner ( id, n, category, campuses, active ),
      department_admissions!inner ( year, tracks, available_track_kinds, prev_year_result )
    `)
    .eq("active", true)
    .eq("universities.active", true)
    .eq("department_admissions.year", year)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  type Row = {
    id: string;
    university_id: string;
    name: string;
    track: Department["track"];
    universities: { id: string; n: string; category: University["category"]; campuses: University["campuses"]; active: boolean };
    department_admissions: Array<{
      year: number;
      tracks: DepartmentAdmissions["tracks"];
      available_track_kinds: AdmissionTrackKind[];
      prev_year_result: DepartmentAdmissions["prevYearResult"];
    }>;
  };

  const candidates: MatchCandidate[] = [];

  for (const raw of data as unknown as Row[]) {
    const univ = raw.universities;
    const admissions = raw.department_admissions[0];
    if (!admissions) continue;

    if (!matchesUiTrack(specs.basic.track, raw.track)) continue;
    if (specs.filter?.category && univ.category !== specs.filter.category) continue;
    if (
      specs.filter?.region &&
      !univ.campuses.some((c) => c.region === specs.filter!.region)
    ) continue;

    for (const trackKind of admissions.available_track_kinds) {
      if (trackKind === "jaeoegukmin") continue;
      const trackList = admissions.tracks[trackKind] ?? [];
      for (const track of trackList) {
        const sampleStats = await loadSampleStats(univ.id, raw.id, year, trackKind);
        candidates.push({
          universityId: univ.id,
          universityName: univ.n,
          departmentId: raw.id,
          departmentName: raw.name,
          trackKind,
          trackName: track.name,
          track,
          prevYearResult: admissions.prev_year_result,
          sampleStats,
        });
      }
    }
  }
  return candidates;
}

async function loadSampleStats(
  universityId: string,
  departmentId: string,
  year: number,
  trackKind: AdmissionTrackKind,
): Promise<AdmissionSampleStats | undefined> {
  try {
    const sb = getAdminSupabase();
    const id = `${universityId}_${departmentId}_${year}_${trackKind}`;
    const { data } = await sb
      .from("admission_sample_stats")
      .select("verified_count, weighted_count, accepted_count, stage1_passed_count, stage2_accepted_count")
      .eq("id", id)
      .maybeSingle();
    if (!data) return undefined;
    const row = data as Record<string, unknown>;
    return {
      id,
      universityId,
      departmentId,
      year,
      trackKind,
      verifiedCount: row.verified_count as number,
      weightedCount: row.weighted_count as number,
      acceptedCount: row.accepted_count as number,
      stage1PassedCount: row.stage1_passed_count as number | undefined,
      stage2AcceptedCount: row.stage2_accepted_count as number | undefined,
      updatedAt: new Date().toISOString() as unknown as AdmissionSampleStats["updatedAt"],
    };
  } catch {
    return undefined;
  }
}

function matchesUiTrack(
  uiTrack: KrSpecsInput["basic"]["track"],
  depTrack: Department["track"],
): boolean {
  if (uiTrack === "humanities") return depTrack === "humanities" || depTrack === "social" || depTrack === "interdisciplinary";
  if (uiTrack === "natural") return depTrack === "natural" || depTrack === "engineering" || depTrack === "medical" || depTrack === "interdisciplinary";
  if (uiTrack === "arts") return depTrack === "arts";
  return false;
}
