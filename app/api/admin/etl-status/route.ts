/**
 * GET /api/admin/etl-status — ETL 검수 대기 + 통계 (Supabase).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireMasterAuth, zodErrorResponse } from "@/lib/api-auth";
import { getAdminSupabase } from "@/lib/supabase-server";
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
    const sb = getAdminSupabase();
    let q = sb
      .from("admissions_staging")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (promoted !== "all") {
      q = q.eq("needs_review", promoted === "false");
    }
    if (trustLevel !== "all") {
      q = q.eq("parser_trust_level", trustLevel);
    }
    if (year != null) {
      q = q.eq("year", year);
    }
    if (cursor) {
      q = q.lt("created_at", cursor);
    }

    const { data, error } = await q;

    if (error || !data || (data.length === 0 && !cursor)) {
      // dev mock fallback
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

    const rows = data as Array<{
      id: string;
      university_id: string;
      year: number;
      parser_trust_level: ParserTrustLevel;
      needs_review: boolean;
      created_at: string;
      tracks: unknown;
      source: unknown;
    }>;

    const items: StagingEntry[] = rows.map((r) => ({
      id: r.id,
      universityId: r.university_id,
      universityName: r.university_id, // 별도 컬럼 없음 — 추후 보강
      year: r.year,
      uploadedBy: "",
      sourceFilename: "",
      trustLevel: r.parser_trust_level,
      toolChain: [],
      parsed: r.tracks as StagingEntry["parsed"],
      promoted: !r.needs_review,
      createdAtMs: new Date(r.created_at).getTime(),
    }));
    const summary = summarizeStaging(items);
    const nextCursor = rows.length === limit ? rows[rows.length - 1]?.created_at : undefined;

    return NextResponse.json({ items, summary, nextCursor, source: "supabase" });
  } catch (e) {
    console.error("[/api/admin/etl-status] error:", e);
    return NextResponse.json({ error: "조회 중 오류가 발생했어요." }, { status: 500 });
  }
}
