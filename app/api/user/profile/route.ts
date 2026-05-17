/**
 * GET /api/user/profile — 본인 프로필 조회
 * POST /api/user/profile — 프로필 갱신 (name/schoolType/notificationOptIn)
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase-server";
import { requireAuth, zodErrorResponse } from "@/lib/api-auth";
import { UserProfileUpdateSchema } from "@/lib/schemas/api/user";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const sb = getAdminSupabase();
  const { data, error } = await sb
    .from("profiles")
    .select("*")
    .eq("id", auth.uid)
    .maybeSingle();
  if (error) {
    console.error("[/api/user/profile] GET error:", error.message);
    return NextResponse.json({ error: "프로필 조회 실패" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "프로필이 없습니다" }, { status: 404 });
  }
  return NextResponse.json(data);
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
  const parsed = UserProfileUpdateSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  const update: Record<string, unknown> = {};
  if (parsed.data.name != null) update.name = parsed.data.name;
  if (parsed.data.notificationOptIn != null) update.notification_opt_in = parsed.data.notificationOptIn;
  // schoolType 은 profiles 가 아니라 user_specs 영역 — 본 라우트에서는 별도 무시

  const sb = getAdminSupabase();
  const { error } = await sb.from("profiles").update(update).eq("id", auth.uid);
  if (error) {
    console.error("[/api/user/profile] POST error:", error.message);
    return NextResponse.json({ error: "프로필 갱신 실패" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
