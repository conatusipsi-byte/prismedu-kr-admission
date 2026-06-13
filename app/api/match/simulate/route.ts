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
import { matchKrAdmissions } from "@/lib/matching-kr";
import { loadKrCandidates } from "@/lib/admission/candidate-loader";

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

    const candidates = await loadKrCandidates(validated.data, DEFAULT_CANDIDATE_LIMIT);
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

/* 후보 로딩은 lib/admission/candidate-loader.ts(loadKrCandidates)로 통합 — match 와 동일. */
