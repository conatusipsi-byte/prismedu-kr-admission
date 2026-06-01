/**
 * PATCH /api/admin/consulting/slots/[id] — 단일 슬롯 열기/닫기.
 *
 *   available ↔ blocked 토글만 허용.
 *   booked 슬롯은 변경 거부 (예약 보호, 정직성 P-002) → 409.
 *
 * Body: { status: "available" | "blocked" }
 * 권한: requireMasterAuth.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireMasterAuth, zodErrorResponse } from "@/lib/api-auth";
import { getAdminSupabase } from "@/lib/supabase-server";
import { AdminConsultingSlotPatchSchema } from "@/lib/schemas/api/admin";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export async function PATCH(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const auth = await requireMasterAuth(req);
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "유효하지 않은 슬롯 ID 형식입니다." }, { status: 400 });
  }

  let body: unknown = {};
  try {
    const txt = await req.text();
    if (txt.length > 0) body = JSON.parse(txt);
  } catch {
    return NextResponse.json({ error: "요청 본문이 유효한 JSON 이 아닙니다" }, { status: 400 });
  }
  const parsed = AdminConsultingSlotPatchSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const { status } = parsed.data;

  const sb = getAdminSupabase();

  // booked 보호 — status='booked' 면 UPDATE 매칭 X. available↔blocked 만 전환.
  const { data, error } = await sb
    .from("consulting_time_slots")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .in("status", ["available", "blocked"])
    .select("id, status, start_at")
    .maybeSingle();

  if (error) {
    console.error("[/api/admin/consulting/slots PATCH] error:", error.message);
    return NextResponse.json({ error: "슬롯 변경 중 오류" }, { status: 500 });
  }

  if (!data) {
    // 매칭 실패 — booked 이거나 미존재. 구분해서 안내.
    const { data: existing } = await sb
      .from("consulting_time_slots")
      .select("id, status")
      .eq("id", id)
      .maybeSingle();
    if (!existing) {
      return NextResponse.json({ error: "슬롯을 찾을 수 없습니다." }, { status: 404 });
    }
    return NextResponse.json(
      { error: "예약된(booked) 슬롯은 변경할 수 없습니다.", code: "slot_booked" },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true, slot: data });
}
