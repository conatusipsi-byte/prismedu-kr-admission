/**
 * POST /api/match — 합격률 분석
 *
 * 처리 단계:
 *   1. 인증 (requireAuth)
 *   2. KrSpecsSchema 입력 검증 (P-013: abroadHighSchool='no'만 허용)
 *   3. 사용자 entitlement → plan 결정 (free / pro / elite)
 *   4. 후보 학과 조회 — Supabase embedded select (departments + universities + department_admissions)
 *   5. matchKrAdmissions 호출 → 학과별 AdmissionProbability
 *   6. P-001 Free preview 컷 산정 (sample-gate.isLockable)
 *   7. matches 테이블 저장
 *   8. 응답 (MatchResponse)
 *
 * Supabase 마이그레이션:
 *   - Firestore collectionGroup → Postgres 단일 테이블 + 임베드 select
 *   - users/{uid}/entitlements/current → user_entitlements (PK=user_id)
 *   - admissions/{year} subcollection → department_admissions root
 *   - admissionSampleStats → admission_sample_stats
 *   - matches/{matchId} → matches root
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase-server";
import { requireAuth, zodErrorResponse } from "@/lib/api-auth";
import { reportRouteError } from "@/lib/sentry-report";
import { KrSpecsSchema, type KrSpecsInput, type MatchResultItem } from "@/lib/schemas/api/match";
import {
  matchKrAdmissions,
  type CandidateProbability,
  type MatchCandidate,
} from "@/lib/matching-kr";
import { isLockable, type Plan } from "@/lib/admission/sample-gate";
import type {
  AdmissionSampleStats,
  AdmissionTrack,
  AdmissionTrackKind,
  Department,
  DepartmentAdmissions,
  University,
} from "@/types/admission";

const FREE_PREVIEW_QUOTA = 20;
const DEFAULT_CANDIDATE_LIMIT = 60;
const MAX_CANDIDATE_LIMIT = 200;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "유효하지 않은 JSON 본문" }, { status: 400 });
  }
  const parsed = KrSpecsSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const specs = parsed.data;

  try {
    const plan = await loadPlan(auth.uid);
    const limit = clampLimit(specs.filter?.limit, plan);

    const candidates = await loadCandidates(specs, limit);
    if (candidates.length === 0) {
      return NextResponse.json(
        {
          error: "조건에 맞는 학과를 찾지 못했습니다. 필터를 조정해주세요.",
          suggestion: "filter.region/category를 비우거나 다른 값으로 시도하세요.",
        },
        { status: 404 },
      );
    }

    const { results: candidateResults, globalCaveats } = matchKrAdmissions({
      specs,
      candidates,
    });

    const { items, lockedCount, freePreviewUsed } = applyFreePreview(candidateResults, plan);

    const matchId = `match_${auth.uid}_${Date.now()}`;
    const createdAt = new Date().toISOString();

    const sb = getAdminSupabase();
    const { error: insertError } = await sb.from("matches").insert({
      id: matchId,
      user_id: auth.uid,
      results: items,
      preview: {
        plan,
        freePreviewQuota: plan === "free" ? FREE_PREVIEW_QUOTA : 0,
        freePreviewUsed,
        lockedCount,
      },
      global_caveats: globalCaveats,
      specs_snapshot: specs,
      // created_at 은 Postgres default now() 가 채움 — 명시 안 함
    });
    if (insertError) {
      reportRouteError("api.match", insertError, { uid: auth.uid });
      // 매칭 결과는 응답으로 반환하되 저장 실패는 로그만
    }

    return NextResponse.json({
      matchId,
      createdAt,
      results: items,
      preview: {
        plan,
        freePreviewQuota: plan === "free" ? FREE_PREVIEW_QUOTA : 0,
        freePreviewUsed,
        lockedCount,
      },
      globalCaveats,
    });
  } catch (e) {
    reportRouteError("api.match", e, { uid: auth.uid });
    return NextResponse.json(
      { error: "분석 처리 중 오류가 발생했습니다" },
      { status: 500 },
    );
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   비즈니스 로직
   ═══════════════════════════════════════════════════════════════════════ */

async function loadPlan(uid: string): Promise<Plan> {
  try {
    const sb = getAdminSupabase();
    const { data, error } = await sb
      .from("user_entitlements")
      .select("current_plan")
      .eq("user_id", uid)
      .maybeSingle();
    if (error || !data) return "free";
    return ((data as { current_plan: string }).current_plan as Plan) ?? "free";
  } catch {
    return "free";
  }
}

function clampLimit(req: number | undefined, plan: Plan): number {
  if (plan === "free") return Math.min(req ?? DEFAULT_CANDIDATE_LIMIT, DEFAULT_CANDIDATE_LIMIT);
  return Math.min(req ?? DEFAULT_CANDIDATE_LIMIT, MAX_CANDIDATE_LIMIT);
}

/**
 * 후보 학과 조회 — departments + 부모 university + department_admissions/{year} 한 번에.
 *
 * Postgres 임베드 select 로 N+1 회피.
 */
async function loadCandidates(
  specs: KrSpecsInput,
  limit: number,
): Promise<MatchCandidate[]> {
  const sb = getAdminSupabase();
  const year = new Date().getFullYear() + 1;

  // PostgREST 의 임베드 select — universities 조인, department_admissions 조인.
  // !inner 는 LEFT JOIN 대신 INNER JOIN (admissions 행 없으면 학과 자체 제외).
  // 컬럼명 snake_case 주의.
  const { data: rows, error } = await sb
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

  if (error || !rows) return [];

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

  for (const raw of rows as unknown as Row[]) {
    const univ = raw.universities;
    const admissions = raw.department_admissions[0];
    if (!admissions) continue;

    if (!matchesUiTrack(specs.basic.track, raw.track)) continue;
    if (specs.filter?.category && univ.category !== specs.filter.category) continue;
    if (
      specs.filter?.region &&
      !univ.campuses.some((c) => c.region === specs.filter!.region)
    ) {
      continue;
    }

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
    const { data, error } = await sb
      .from("admission_sample_stats")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return undefined;
    // snake_case → camelCase 매핑 (AdmissionSampleStats 타입은 camelCase)
    const row = data as Record<string, unknown>;
    return {
      id: row.id as string,
      universityId: row.university_id as string,
      departmentId: row.department_id as string,
      year: row.year as number,
      trackKind: row.track_kind as AdmissionTrackKind,
      verifiedCount: row.verified_count as number,
      weightedCount: row.weighted_count as number,
      acceptedCount: row.accepted_count as number,
      stage1PassedCount: row.stage1_passed_count as number | undefined,
      stage2AcceptedCount: row.stage2_accepted_count as number | undefined,
      updatedAt: row.updated_at as AdmissionSampleStats["updatedAt"],
    };
  } catch {
    return undefined;
  }
}

function matchesUiTrack(
  uiTrack: KrSpecsInput["basic"]["track"],
  depTrack: AdmissionTrack["kind"] extends never ? never : Department["track"],
): boolean {
  if (uiTrack === "humanities") return depTrack === "humanities" || depTrack === "social" || depTrack === "interdisciplinary";
  if (uiTrack === "natural") return depTrack === "natural" || depTrack === "engineering" || depTrack === "medical";
  if (uiTrack === "arts") return depTrack === "arts";
  return true;
}

function applyFreePreview(
  candidateResults: CandidateProbability[],
  plan: Plan,
): { items: MatchResultItem[]; lockedCount: number; freePreviewUsed: number } {
  let usedQuota = 0;
  let lockedCount = 0;
  const items: MatchResultItem[] = [];

  for (const r of candidateResults) {
    const sample = r.probability.sampleSufficient
      ? ({ sufficient: true, acceptedN: r.probability.sampleN, weightedN: r.probability.weightedSampleN } as const)
      : ({ sufficient: false, reason: "below_threshold" as const, acceptedN: r.probability.sampleN, weightedN: r.probability.weightedSampleN } as const);

    const isInPreview =
      plan === "free" && sample.sufficient && usedQuota < FREE_PREVIEW_QUOTA;
    if (isInPreview) usedQuota += 1;

    const lock = isLockable({ plan, isInFreePreview: isInPreview }, sample);
    const lockable = lock.lockable;
    if (lockable) lockedCount += 1;

    items.push({
      universityId: r.candidate.universityId,
      universityName: r.candidate.universityName,
      departmentId: r.candidate.departmentId,
      departmentName: r.candidate.departmentName,
      trackKind: r.candidate.trackKind,
      trackName: r.candidate.trackName,
      category: r.probability.category,
      probability: r.probability.probability,
      low: r.probability.low,
      high: r.probability.high,
      sampleSufficient: r.probability.sampleSufficient,
      sampleN: r.probability.sampleN,
      weightedSampleN: r.probability.weightedSampleN,
      hakjong: r.probability.hakjong,
      lockable,
      caveats: r.caveats,
    });
  }

  return { items, lockedCount, freePreviewUsed: usedQuota };
}
