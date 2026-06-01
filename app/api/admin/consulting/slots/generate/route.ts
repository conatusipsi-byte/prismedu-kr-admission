/**
 * POST /api/admin/consulting/slots/generate — 향후 N일치 슬롯 멱등 생성.
 *
 * 시드 스크립트(seed-consulting-slots.ts)와 동일한 스케줄 단일소스
 * (lib/consulting/slot-schedule.ts: 12:00~20:00 KST, 60분, 하루 8슬롯)를 재사용.
 * 운영자가 슬롯 소진 전 버튼 한 번으로 미래 슬롯을 채울 수 있게 함.
 *
 * 멱등: 동일 start_at 이미 존재하면 INSERT 제외 (consulting_time_slots 에 start_at
 *   UNIQUE 제약이 없어 in-memory 필터 — 시드 스크립트와 동일 전략).
 *
 * Body: { daysAhead?: number (1~60, default 14) }
 * 권한: requireMasterAuth.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireMasterAuth, zodErrorResponse } from "@/lib/api-auth";
import { getAdminSupabase } from "@/lib/supabase-server";
import { AdminConsultingSlotsGenerateSchema } from "@/lib/schemas/api/admin";
import { buildSeedSlots, CONSULTING_SLOT_START_HOURS_KST } from "@/lib/consulting/slot-schedule";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireMasterAuth(req);
  if (!auth.ok) return auth.response;

  let body: unknown = {};
  try {
    const txt = await req.text();
    if (txt.length > 0) body = JSON.parse(txt);
  } catch {
    return NextResponse.json({ error: "요청 본문이 유효한 JSON 이 아닙니다" }, { status: 400 });
  }
  const parsed = AdminConsultingSlotsGenerateSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const { daysAhead } = parsed.data;

  const slots = buildSeedSlots(new Date(), daysAhead);
  const startAts = slots.map((s) => s.start_at);

  const sb = getAdminSupabase();

  // 1. 기존 start_at 조회 (멱등 — 이미 있는 슬롯은 재삽입 X)
  const { data: existingRows, error: selErr } = await sb
    .from("consulting_time_slots")
    .select("start_at")
    .in("start_at", startAts);
  if (selErr) {
    console.error("[/api/admin/consulting/slots/generate] select error:", selErr.message);
    return NextResponse.json({ error: "기존 슬롯 조회 중 오류" }, { status: 500 });
  }
  const existing = new Set((existingRows ?? []).map((r) => (r as { start_at: string }).start_at));
  const toInsert = slots.filter((s) => !existing.has(s.start_at));

  if (toInsert.length === 0) {
    return NextResponse.json({
      ok: true,
      inserted: 0,
      skipped: slots.length,
      daysAhead,
      perDay: CONSULTING_SLOT_START_HOURS_KST.length,
      message: "추가할 새 슬롯이 없습니다 (모두 이미 존재).",
    });
  }

  // 2. 신규만 INSERT
  const { error: insErr } = await sb.from("consulting_time_slots").insert(toInsert);
  if (insErr) {
    console.error("[/api/admin/consulting/slots/generate] insert error:", insErr.message);
    return NextResponse.json({ error: "슬롯 생성 중 오류" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    inserted: toInsert.length,
    skipped: existing.size,
    daysAhead,
    perDay: CONSULTING_SLOT_START_HOURS_KST.length,
  });
}
