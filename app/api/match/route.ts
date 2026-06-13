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
import { KrSpecsSchema, type MatchResultItem } from "@/lib/schemas/api/match";
import {
  matchKrAdmissions,
  type CandidateProbability,
} from "@/lib/matching-kr";
import { isLockable, type Plan } from "@/lib/admission/sample-gate";
import { loadKrCandidates } from "@/lib/admission/candidate-loader";

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

    const candidates = await loadKrCandidates(specs, limit);
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
