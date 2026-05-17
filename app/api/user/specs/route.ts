/**
 * GET /api/user/specs — 본인 스펙 스냅샷 목록 (최신순)
 * POST /api/user/specs — 신규 스냅샷 추가
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase-server";
import { requireAuth, zodErrorResponse } from "@/lib/api-auth";
import { UserSpecsUpsertSchema } from "@/lib/schemas/api/user";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const sb = getAdminSupabase();
  const { data, error } = await sb
    .from("user_specs")
    .select("id, as_of, school_record, csat, school_type, updated_at")
    .eq("user_id", auth.uid)
    .order("updated_at", { ascending: false })
    .limit(20);
  if (error) {
    console.error("[/api/user/specs] GET error:", error.message);
    return NextResponse.json({ error: "스펙 조회 실패" }, { status: 500 });
  }
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "유효하지 않은 JSON" }, { status: 400 });
  }
  const parsed = UserSpecsUpsertSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const input = parsed.data;

  const sb = getAdminSupabase();
  const { data, error } = await sb
    .from("user_specs")
    .insert({
      user_id: auth.uid,
      as_of: { ...input.asOf, recordedAt: new Date().toISOString() },
      school_record: input.schoolRecord,
      csat: input.csat ?? null,
      school_type: input.schoolType ?? null,
    })
    .select("id")
    .single();
  if (error) {
    console.error("[/api/user/specs] POST error:", error.message);
    return NextResponse.json({ error: "스펙 저장 실패" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: (data as { id: string }).id });
}
