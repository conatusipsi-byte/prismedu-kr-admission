/**
 * GET /api/admin/sample-stats — 합격사례 표본 집계 (Day 11 실 구현)
 *
 * 마스터 전용. admissionSampleStats 컬렉션 조회 + sample-gate 분류.
 *
 * 응답: { items, summary, source: "firestore"|"mock", nextCursor? }
 *
 * 정직성 (P-002):
 *   - insufficient 카운트로 운영자가 "확률 비공개 학과" 비율 한눈에 파악
 *   - status="insufficient" 항목은 별도 강조 (UI에서 rose 톤)
 *   - 표본 부족 사유(no_data·below_threshold·weighted_below·no_accepted) 분포 노출
 */

import { NextRequest, NextResponse } from "next/server";
import { requireMasterAuth, zodErrorResponse } from "@/lib/api-auth";
import { getAdminDb } from "@/lib/firebase-admin";
import { AdminSampleStatsQuerySchema } from "@/lib/schemas/api/admin";
import { checkSampleSufficiency } from "@/lib/admission/sample-gate";
import {
  summarizeSampleStats,
  type SampleStatsItem,
  type SampleStatsSummary,
} from "@/lib/admission/sample-stats-summary";
import type { AdmissionSampleStats } from "@/types/admission";

interface ApiResponse {
  items: SampleStatsItem[];
  summary: SampleStatsSummary;
  source: "firestore" | "mock";
  nextCursor?: string;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireMasterAuth(req);
  if (!auth.ok) return auth.response;

  const params: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => {
    params[k] = v;
  });
  const parsed = AdminSampleStatsQuerySchema.safeParse(params);
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const { year, trackKind, status, limit } = parsed.data;

  try {
    const db = getAdminDb();
    let q = db.collection("admissionSampleStats")
      .where("year", "==", year)
      .orderBy("acceptedCount", "asc") // 부족 학과 우선
      .limit(limit);

    if (trackKind) {
      q = q.where("trackKind", "==", trackKind);
    }

    const snap = await q.get();

    // Firestore 비어있으면 mock 데이터 fallback
    if (snap.empty) {
      const mockItems = buildMockItems(year, trackKind);
      const filtered = filterByStatus(mockItems, status);
      return NextResponse.json({
        items: filtered,
        summary: summarizeSampleStats(filtered),
        source: "mock",
      } satisfies ApiResponse);
    }

    const items: SampleStatsItem[] = snap.docs.map((d) => {
      const stats = d.data() as AdmissionSampleStats;
      return toStatsItem(stats);
    });
    const filtered = filterByStatus(items, status);

    return NextResponse.json({
      items: filtered,
      summary: summarizeSampleStats(filtered),
      source: "firestore",
    } satisfies ApiResponse);
  } catch (e) {
    console.error("[/api/admin/sample-stats] error:", e);
    return NextResponse.json({ error: "조회 중 오류가 발생했어요." }, { status: 500 });
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   helpers
   ═══════════════════════════════════════════════════════════════════════ */

function toStatsItem(stats: AdmissionSampleStats): SampleStatsItem {
  const gate = checkSampleSufficiency(stats);
  return {
    id: stats.id,
    universityId: stats.universityId,
    departmentId: stats.departmentId,
    year: stats.year,
    trackKind: stats.trackKind,
    verifiedCount: stats.verifiedCount,
    weightedCount: stats.weightedCount,
    acceptedCount: stats.acceptedCount,
    stage1PassedCount: stats.stage1PassedCount,
    stage2AcceptedCount: stats.stage2AcceptedCount,
    gate,
    updatedAtMs: stats.updatedAt?.toMillis?.() ?? Date.now(),
  };
}

function filterByStatus(
  items: SampleStatsItem[],
  status: "sufficient" | "insufficient" | undefined,
): SampleStatsItem[] {
  if (!status) return items;
  return items.filter((it) => {
    if (status === "sufficient") return it.gate.sufficient;
    return !it.gate.sufficient;
  });
}

/* ═══════════════════════════════════════════════════════════════════════
   Mock data — Firestore 비어있을 때 dev fallback
   ═══════════════════════════════════════════════════════════════════════ */

function buildMockItems(year: number, trackKind: string | undefined): SampleStatsItem[] {
  const ts = { toMillis: () => Date.now() } as { toMillis: () => number };
  const mocks: AdmissionSampleStats[] = [
    {
      id: "snu_med_2027_jeongsi_na",
      universityId: "snu", departmentId: "med", year, trackKind: "jeongsi_na",
      verifiedCount: 1, weightedCount: 1.0, acceptedCount: 1,
      updatedAt: ts as never,
    },
    {
      id: "yonsei_business_2027_susi_comprehensive",
      universityId: "yonsei", departmentId: "business", year, trackKind: "susi_comprehensive",
      verifiedCount: 12, weightedCount: 9.5, acceptedCount: 8,
      stage1PassedCount: 15, stage2AcceptedCount: 8,
      updatedAt: ts as never,
    },
    {
      id: "yonsei_business_2027_jeongsi_na",
      universityId: "yonsei", departmentId: "business", year, trackKind: "jeongsi_na",
      verifiedCount: 18, weightedCount: 13.0, acceptedCount: 10,
      updatedAt: ts as never,
    },
    {
      id: "pusan_info-comp_2027_jeongsi_ga",
      universityId: "pusan", departmentId: "info-comp", year, trackKind: "jeongsi_ga",
      verifiedCount: 14, weightedCount: 10.0, acceptedCount: 10,
      updatedAt: ts as never,
    },
    {
      id: "korea_liberal_2027_susi_comprehensive",
      universityId: "korea", departmentId: "liberal", year, trackKind: "susi_comprehensive",
      verifiedCount: 2, weightedCount: 1.0, acceptedCount: 2,
      stage1PassedCount: 4, stage2AcceptedCount: 2,
      updatedAt: ts as never,
    },
    {
      id: "knua_film_2027_susi_practical",
      universityId: "knua", departmentId: "film", year, trackKind: "susi_practical",
      verifiedCount: 8, weightedCount: 5.5, acceptedCount: 8,
      updatedAt: ts as never,
    },
  ];
  const items = mocks
    .filter((m) => !trackKind || m.trackKind === trackKind)
    .map(toStatsItem);
  return items;
}
