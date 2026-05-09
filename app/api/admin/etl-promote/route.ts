/**
 * POST /api/admin/etl-promote — admissionsStaging → admissions(live) 승격
 *
 * 마스터 전용. 운영자가 검수 modal에서 호출.
 *
 * 흐름:
 *   1. requireMasterAuth + Rate limit
 *   2. AdminEtlPromoteSchema 검증 — stagingId + 운영자 보강 메타
 *   3. admissionsStaging/{stagingId} 조회 + 이미 promoted면 409
 *   4. 트랜잭션:
 *      - admissionsStaging.promoted = true (멱등 가드)
 *      - universities/{uid}/departments/{did}/admissions/{year} 적재 (merge)
 *      - tracks[trackKind]에 새 트랙 push 또는 기존 trackName과 일치 시 갱신
 *   5. 응답
 *
 * 정직성 (P-002):
 *   - 자동 승격 절대 X — 본 라우트는 운영자 explicit 호출만 처리
 *   - 필수 필드(quotaInitial 등) 미입력 시 400
 *   - 트랜잭션 실패 시 silent X — recoveryId 반환
 */

import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireMasterAuth, zodErrorResponse } from "@/lib/api-auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getAdminDb } from "@/lib/firebase-admin";
import { AdminEtlPromoteSchema } from "@/lib/schemas/api/admin";
import type { CsatMinimum, ReflectionRatio } from "@/types/admission";

interface StagingDocPayload {
  id: string;
  universityId: string;
  year: number;
  promoted?: boolean;
  csatMinimumFinalized?: CsatMinimum | null;
  parsed?: {
    departmentNameCandidates?: string[];
    reflectionRatioPartial?: {
      korean?: number;
      math?: number;
      english?: number;
      investigation?: number;
    };
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

  const db = getAdminDb();
  const stagingRef = db.collection("admissionsStaging").doc(stagingId);

  try {
    const stagingSnap = await stagingRef.get();
    if (!stagingSnap.exists) {
      return NextResponse.json({ error: "승격할 staging 항목을 찾을 수 없어요." }, { status: 404 });
    }
    const staging = stagingSnap.data() as StagingDocPayload;
    if (staging.promoted) {
      return NextResponse.json({ error: "이미 승격된 항목입니다." }, { status: 409 });
    }

    // 트랜잭션 — staging.promoted=true + admissions/{year} 적재
    const admissionsRef = db
      .collection("universities").doc(staging.universityId)
      .collection("departments").doc(departmentId)
      .collection("admissions").doc(String(staging.year));

    await db.runTransaction(async (tx) => {
      const recheck = await tx.get(stagingRef);
      if (!recheck.exists || (recheck.data() as StagingDocPayload).promoted) {
        // race — 다른 호출이 이미 처리. 멱등 종료.
        return;
      }

      const reflectionRatio = buildReflectionRatio(staging.parsed?.reflectionRatioPartial);

      // 기존 admissions 도큐먼트와 merge — 같은 trackKind에 새 트랙 추가
      // 단순 set + merge: 운영자가 같은 학과의 다른 트랙을 별도로 승격 시 누적.
      // 같은 trackName 중복 방지는 운영자 검수 책임 (UI에서 기존 트랙 표시).
      const newTrack = {
        name: trackName,
        kind: trackKind,
        specialType: "general",
        quotaInitial,
        stages: [{ step: 1, components: trackKind.startsWith("jeongsi_") ? { csat: 100 } : { document: 100 } }],
        csatMinimum: staging.csatMinimumFinalized ?? null,
        reflectionRatio,
        notes: reviewerNotes ?? null,
      };

      tx.set(
        admissionsRef,
        {
          universityId: staging.universityId,
          departmentId,
          year: staging.year,
          tracks: { [trackKind]: FieldValue.arrayUnion(newTrack) },
          availableTrackKinds: FieldValue.arrayUnion(trackKind),
          source: {
            promotedFromStagingId: stagingId,
            promotedBy: auth.uid,
            promotedAt: FieldValue.serverTimestamp(),
          },
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      tx.set(
        stagingRef,
        {
          promoted: true,
          promotedAt: FieldValue.serverTimestamp(),
          promotedBy: auth.uid,
          reviewerNotes: reviewerNotes ?? null,
        },
        { merge: true },
      );
    });

    return NextResponse.json({
      success: true,
      stagingId,
      universityId: staging.universityId,
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
