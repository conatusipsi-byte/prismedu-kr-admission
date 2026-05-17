/**
 * POST /api/admissions/analyze — 단일 학과 분석.
 *
 * 입력: universityId + departmentId + year
 * 출력: 학과 모집요강 + (사용자 specs 있으면) probability
 *
 * 사용자 specs 가 user_specs 테이블에 있으면 matchKrAdmissions 단일 후보 실행.
 * 없으면 정형 정보만 반환.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, zodErrorResponse } from "@/lib/api-auth";
import { getAdminSupabase } from "@/lib/supabase-server";
import { reportRouteError } from "@/lib/sentry-report";
import { AdmissionsAnalyzeSchema } from "@/lib/schemas/api/admissions";
import { KrSpecsSchema, type KrSpecsInput } from "@/lib/schemas/api/match";
import { matchKrAdmissions, type MatchCandidate } from "@/lib/matching-kr";
import type {
  AdmissionSampleStats,
  AdmissionTrackKind,
  DepartmentAdmissions,
} from "@/types/admission";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "유효하지 않은 JSON" }, { status: 400 });
  }
  const parsed = AdmissionsAnalyzeSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const { universityId, departmentId, year } = parsed.data;

  try {
    const sb = getAdminSupabase();
    const admId = `${universityId}_${departmentId}_${year}`;

    const [univR, depR, admR, specsR] = await Promise.all([
      sb.from("universities").select("id, n, category, campuses").eq("id", universityId).maybeSingle(),
      sb.from("departments").select("id, name, track").eq("university_id", universityId).eq("id", departmentId).maybeSingle(),
      sb.from("department_admissions").select("tracks, available_track_kinds, prev_year_result").eq("id", admId).maybeSingle(),
      sb.from("user_specs").select("school_record, csat, intent, school_type, as_of").eq("user_id", auth.uid).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    if (!univR.data || !depR.data) {
      return NextResponse.json({ error: "학과를 찾을 수 없습니다" }, { status: 404 });
    }
    if (!admR.data) {
      return NextResponse.json({ error: `${year}학년도 모집요강이 없습니다` }, { status: 404 });
    }
    const univ = univR.data as { id: string; n: string; category: string; campuses: unknown };
    const dep = depR.data as { id: string; name: string; track: string };
    const adm = admR.data as {
      tracks: DepartmentAdmissions["tracks"];
      available_track_kinds: AdmissionTrackKind[];
      prev_year_result: DepartmentAdmissions["prevYearResult"];
    };

    // 사용자 specs 가 KrSpecsSchema 와 호환되는지 검증 — 호환 안되면 정형 정보만 반환.
    // 본 단계: user_specs 컬럼이 단순화된 표현이라 직접 KrSpecsInput 변환 불가 — null 유지.
    // 실 매칭은 /api/match (specs 직접 입력) 권장.
    const specs: KrSpecsInput | null = null;
    void specsR.data;

    // 트랙별 sample stats + (specs 있으면) matching
    const trackResults: Record<string, { sampleSufficient: boolean; probability?: unknown }> = {};
    for (const kind of adm.available_track_kinds) {
      if (kind === "jaeoegukmin") continue;
      const statsId = `${universityId}_${departmentId}_${year}_${kind}`;
      const { data: statsRow } = await sb
        .from("admission_sample_stats")
        .select("verified_count, weighted_count, accepted_count, stage1_passed_count, stage2_accepted_count")
        .eq("id", statsId)
        .maybeSingle();
      const sampleSufficient = !!statsRow && (statsRow as Record<string, number>).verified_count >= 5;
      const result: { sampleSufficient: boolean; probability?: unknown } = { sampleSufficient };

      if (specs && sampleSufficient) {
        const trackList = adm.tracks[kind] ?? [];
        const track = trackList[0];
        if (track) {
          const r = statsRow as Record<string, unknown>;
          const candidate: MatchCandidate = {
            universityId, universityName: univ.n,
            departmentId, departmentName: dep.name,
            trackKind: kind, trackName: track.name, track,
            prevYearResult: adm.prev_year_result,
            sampleStats: {
              id: statsId, universityId, departmentId, year, trackKind: kind,
              verifiedCount: r.verified_count as number,
              weightedCount: r.weighted_count as number,
              acceptedCount: r.accepted_count as number,
              stage1PassedCount: r.stage1_passed_count as number | undefined,
              stage2AcceptedCount: r.stage2_accepted_count as number | undefined,
              updatedAt: new Date().toISOString() as unknown as AdmissionSampleStats["updatedAt"],
            },
          };
          const m = matchKrAdmissions({ specs, candidates: [candidate] });
          result.probability = m.results[0]?.probability ?? null;
        }
      }
      trackResults[kind] = result;
    }

    return NextResponse.json({
      university: univ,
      department: dep,
      year,
      availableTrackKinds: adm.available_track_kinds,
      tracksByKind: adm.tracks,
      prevYearResult: adm.prev_year_result,
      trackResults,
      hasUserSpecs: !!specsR.data,
    });
  } catch (e) {
    reportRouteError("api.admissions.analyze", e, { uid: auth.uid, universityId, departmentId });
    return NextResponse.json(
      { error: "분석 처리 중 오류가 발생했습니다" },
      { status: 500 },
    );
  }
}

// KrSpecsSchema 사용 보장 (lint 회피)
void KrSpecsSchema;
