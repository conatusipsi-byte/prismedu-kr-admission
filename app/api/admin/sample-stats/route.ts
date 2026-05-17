/**
 * GET /api/admin/sample-stats — 합격사례 표본 집계 (Supabase).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireMasterAuth, zodErrorResponse } from "@/lib/api-auth";
import { getAdminSupabase } from "@/lib/supabase-server";
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
  source: "supabase" | "mock";
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
    const sb = getAdminSupabase();
    let q = sb
      .from("admission_sample_stats")
      .select("*")
      .eq("year", year)
      .order("accepted_count", { ascending: true })
      .limit(limit);

    if (trackKind) {
      q = q.eq("track_kind", trackKind);
    }

    const { data, error } = await q;

    if (error || !data || data.length === 0) {
      const mockItems = buildMockItems(year, trackKind);
      const filtered = filterByStatus(mockItems, status);
      return NextResponse.json({
        items: filtered,
        summary: summarizeSampleStats(filtered),
        source: "mock",
      } satisfies ApiResponse);
    }

    const items: SampleStatsItem[] = (data as Array<Record<string, unknown>>).map((row) => {
      const stats: AdmissionSampleStats = {
        id: row.id as string,
        universityId: row.university_id as string,
        departmentId: row.department_id as string,
        year: row.year as number,
        trackKind: row.track_kind as AdmissionSampleStats["trackKind"],
        verifiedCount: row.verified_count as number,
        weightedCount: row.weighted_count as number,
        acceptedCount: row.accepted_count as number,
        stage1PassedCount: row.stage1_passed_count as number | undefined,
        stage2AcceptedCount: row.stage2_accepted_count as number | undefined,
        updatedAt: new Date(row.updated_at as string).toISOString() as unknown as AdmissionSampleStats["updatedAt"],
      };
      return toStatsItem(stats);
    });
    const filtered = filterByStatus(items, status);

    return NextResponse.json({
      items: filtered,
      summary: summarizeSampleStats(filtered),
      source: "supabase",
    } satisfies ApiResponse);
  } catch (e) {
    console.error("[/api/admin/sample-stats] error:", e);
    return NextResponse.json({ error: "조회 중 오류가 발생했어요." }, { status: 500 });
  }
}

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
    updatedAtMs: typeof stats.updatedAt === "string"
      ? new Date(stats.updatedAt).getTime()
      : (stats.updatedAt as unknown as { toMillis?: () => number })?.toMillis?.() ?? Date.now(),
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

function buildMockItems(year: number, trackKind: string | undefined): SampleStatsItem[] {
  const ts = new Date().toISOString();
  const mocks: AdmissionSampleStats[] = [
    {
      id: "snu_med_2027_jeongsi_na",
      universityId: "snu", departmentId: "med", year, trackKind: "jeongsi_na",
      verifiedCount: 1, weightedCount: 1.0, acceptedCount: 1,
      updatedAt: ts as unknown as AdmissionSampleStats["updatedAt"],
    },
    {
      id: "yonsei_business_2027_susi_comprehensive",
      universityId: "yonsei", departmentId: "business", year, trackKind: "susi_comprehensive",
      verifiedCount: 12, weightedCount: 9.5, acceptedCount: 8,
      stage1PassedCount: 15, stage2AcceptedCount: 8,
      updatedAt: ts as unknown as AdmissionSampleStats["updatedAt"],
    },
    {
      id: "yonsei_business_2027_jeongsi_na",
      universityId: "yonsei", departmentId: "business", year, trackKind: "jeongsi_na",
      verifiedCount: 18, weightedCount: 13.0, acceptedCount: 10,
      updatedAt: ts as unknown as AdmissionSampleStats["updatedAt"],
    },
    {
      id: "pusan_info-comp_2027_jeongsi_ga",
      universityId: "pusan", departmentId: "info-comp", year, trackKind: "jeongsi_ga",
      verifiedCount: 14, weightedCount: 10.0, acceptedCount: 10,
      updatedAt: ts as unknown as AdmissionSampleStats["updatedAt"],
    },
    {
      id: "korea_liberal_2027_susi_comprehensive",
      universityId: "korea", departmentId: "liberal", year, trackKind: "susi_comprehensive",
      verifiedCount: 2, weightedCount: 1.0, acceptedCount: 2,
      stage1PassedCount: 4, stage2AcceptedCount: 2,
      updatedAt: ts as unknown as AdmissionSampleStats["updatedAt"],
    },
    {
      id: "knua_film_2027_susi_practical",
      universityId: "knua", departmentId: "film", year, trackKind: "susi_practical",
      verifiedCount: 8, weightedCount: 5.5, acceptedCount: 8,
      updatedAt: ts as unknown as AdmissionSampleStats["updatedAt"],
    },
  ];
  return mocks
    .filter((m) => !trackKind || m.trackKind === trackKind)
    .map(toStatsItem);
}
