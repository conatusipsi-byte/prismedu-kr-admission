/**
 * POST /api/admin/etl-promote — admissions_staging → department_admissions(live) 승격 (Supabase).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireMasterAuth, zodErrorResponse } from "@/lib/api-auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getAdminSupabase } from "@/lib/supabase-server";
import { AdminEtlPromoteSchema } from "@/lib/schemas/api/admin";
import type {
  AdmissionTrack,
  AdmissionTrackKind,
  CsatMinimum,
  DepartmentAdmissions,
  ReflectionRatio,
} from "@/types/admission";

interface StagingPayload {
  id: string;
  university_id: string;
  year: number;
  needs_review: boolean;
  tracks?: {
    parsed?: {
      reflectionRatioPartial?: {
        korean?: number;
        math?: number;
        english?: number;
        investigation?: number;
      };
    };
    csatMinimumFinalized?: CsatMinimum | null;
  };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireMasterAuth(req);
  if (!auth.ok) return auth.response;

  const rateErr = await enforceRateLimit({
    bucket: "admin_etl_promote",
    uid: auth.uid,
    windowMs: 60_000,
    limit: 30,
  });
  if (rateErr) return rateErr;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "유효하지 않은 JSON 본문" }, { status: 400 });
  }
  const parsed = AdminEtlPromoteSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const { stagingId, departmentId, trackKind, trackName, quotaInitial, reviewerNotes } = parsed.data;

  const sb = getAdminSupabase();

  try {
    // staging 조회
    const { data: stagingData, error: stagingErr } = await sb
      .from("admissions_staging")
      .select("id, university_id, year, needs_review, tracks")
      .eq("id", stagingId)
      .maybeSingle();
    if (stagingErr || !stagingData) {
      return NextResponse.json({ error: "승격할 staging 항목을 찾을 수 없어요." }, { status: 404 });
    }
    const staging = stagingData as StagingPayload;
    if (!staging.needs_review) {
      return NextResponse.json({ error: "이미 승격된 항목입니다." }, { status: 409 });
    }

    const admId = `${staging.university_id}_${departmentId}_${staging.year}`;
    const reflectionRatio = buildReflectionRatio(staging.tracks?.parsed?.reflectionRatioPartial);

    const newTrack: AdmissionTrack = {
      name: trackName,
      kind: trackKind as AdmissionTrackKind,
      specialType: "general",
      quotaInitial,
      stages: [
        {
          step: 1,
          components: (trackKind as string).startsWith("jeongsi_")
            ? { csat: 100 }
            : { document: 100 },
        },
      ],
      csatMinimum: staging.tracks?.csatMinimumFinalized ?? undefined,
      reflectionRatio,
      notes: reviewerNotes ?? undefined,
    };

    // 기존 admissions row 조회 후 merge
    const { data: existing } = await sb
      .from("department_admissions")
      .select("tracks, available_track_kinds")
      .eq("id", admId)
      .maybeSingle();

    const existingTracks =
      (existing as { tracks: DepartmentAdmissions["tracks"] } | null)?.tracks ?? {};
    const existingKinds =
      (existing as { available_track_kinds: AdmissionTrackKind[] } | null)?.available_track_kinds ?? [];
    const trackList = existingTracks[trackKind as AdmissionTrackKind] ?? [];

    const mergedTracks = {
      ...existingTracks,
      [trackKind]: [...trackList, newTrack],
    };
    const mergedKinds = existingKinds.includes(trackKind as AdmissionTrackKind)
      ? existingKinds
      : [...existingKinds, trackKind as AdmissionTrackKind];

    // upsert department_admissions
    const { error: admErr } = await sb.from("department_admissions").upsert({
      id: admId,
      university_id: staging.university_id,
      department_id: departmentId,
      year: staging.year,
      tracks: mergedTracks,
      available_track_kinds: mergedKinds,
      source: {
        promotedFromStagingId: stagingId,
        promotedBy: auth.uid,
        promotedAt: new Date().toISOString(),
        parsedAt: new Date().toISOString(),
        parserVersion: "supabase-v1",
      },
    });
    if (admErr) throw admErr;

    // staging.needs_review = false (멱등 가드)
    const { error: stagingUpdErr } = await sb
      .from("admissions_staging")
      .update({
        needs_review: false,
        reviewer_notes: reviewerNotes ?? null,
      })
      .eq("id", stagingId);
    if (stagingUpdErr) throw stagingUpdErr;

    return NextResponse.json({
      success: true,
      stagingId,
      universityId: staging.university_id,
      departmentId,
      year: staging.year,
      trackKind,
    });
  } catch (e) {
    console.error(`[/api/admin/etl-promote] CRITICAL: stagingId=${stagingId}`, e);
    return NextResponse.json(
      {
        error: "승격 처리 중 오류가 발생했어요. 운영팀에 다음 번호를 알려주세요.",
        code: "PROMOTE_TX_FAILED",
        recoveryId: stagingId,
      },
      { status: 500 },
    );
  }
}

function buildReflectionRatio(
  partial:
    | { korean?: number; math?: number; english?: number; investigation?: number }
    | undefined,
): ReflectionRatio | undefined {
  if (!partial) return undefined;
  const { korean, math, english, investigation } = partial;
  if (korean == null || math == null || english == null || investigation == null) return undefined;
  return {
    korean: { ratio: korean, scoreType: "standard" },
    math: { ratio: math, scoreType: "standard" },
    english: { ratio: english },
    investigation: { ratio: investigation, scoreType: "standard" },
  };
}
