/**
 * GET /api/admin/etl-status — ETL 검수 대기 + 통계 (Day 10 실 구현)
 *
 * 마스터 전용. admissionsStaging 컬렉션 + summary 집계.
 *
 * 응답: { items: StagingEntry[], summary: EtlStatusSummary, nextCursor?, source: "firestore"|"mock" }
 *
 * Firestore 빈 컬렉션이거나 자격증명 부재 시 mock 데이터 fallback (개발 환경).
 *
 * 정직성 (P-002):
 *   - promoted=false 항목은 사이트 prod admissions에 노출 안 됨
 *   - trustLevel별 카운트로 운영자가 suspicious 비율 한눈에 파악
 */

import { NextRequest, NextResponse } from "next/server";
import { requireMasterAuth, zodErrorResponse } from "@/lib/api-auth";
import { getAdminDb } from "@/lib/firebase-admin";
import { AdminEtlStatusListQuerySchema } from "@/lib/schemas/api/admin";
import {
  listMockStaging,
  summarizeStaging,
  type StagingEntry,
} from "@/lib/admission/mock-etl-staging";
import type { ParserTrustLevel } from "../../../../scripts/etl/parsers/types";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireMasterAuth(req);
  if (!auth.ok) return auth.response;

  const params: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => {
    params[k] = v;
  });
  const parsed = AdminEtlStatusListQuerySchema.safeParse(params);
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const { promoted, trustLevel, year, limit, cursor } = parsed.data;

  try {
    const db = getAdminDb();
    let q = db.collection("admissionsStaging").orderBy("createdAt", "desc").limit(limit);

    if (promoted !== "all") {
      q = q.where("promoted", "==", promoted === "true");
    }
    if (trustLevel !== "all") {
      q = q.where("trustLevel", "==", trustLevel);
    }
    if (year != null) {
      q = q.where("year", "==", year);
    }
    if (cursor) {
      const cursorDoc = await db.doc(cursor).get();
      if (cursorDoc.exists) q = q.startAfter(cursorDoc);
    }

    const snap = await q.get();

    // Firestore 비어있으면 dev mock fallback
    if (snap.empty && !cursor) {
      const mockItems = listMockStaging({
        promoted,
        trustLevel: trustLevel as ParserTrustLevel | "all",
        year,
      });
      return NextResponse.json({
        items: mockItems.slice(0, limit),
        summary: summarizeStaging(mockItems),
        source: "mock",
      });
    }

    const items = snap.docs.map((d) => stagingFromDoc(d.data()));
    const summary = summarizeStaging(items);
    const lastDoc = snap.docs[snap.docs.length - 1];
    const nextCursor = snap.size === limit ? lastDoc?.ref.path : undefined;

    return NextResponse.json({ items, summary, nextCursor, source: "firestore" });
  } catch (e) {
    console.error("[/api/admin/etl-status] error:", e);
    return NextResponse.json({ error: "조회 중 오류가 발생했어요." }, { status: 500 });
  }
}

function stagingFromDoc(data: FirebaseFirestore.DocumentData): StagingEntry {
  const ts = data.createdAt;
  const createdAtMs = ts?.toMillis?.() ?? Date.now();
  return {
    id: data.id,
    universityId: data.universityId,
    universityName: data.universityName ?? data.universityId,
    year: data.year,
    uploadedBy: data.uploadedBy,
    sourceFilename: data.sourceFilename,
    trustLevel: data.trustLevel,
    toolChain: data.toolChain ?? [],
    parsed: data.parsed,
    promoted: data.promoted ?? false,
    createdAtMs,
  };
}
