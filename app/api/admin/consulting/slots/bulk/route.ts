/**
 * POST /api/admin/consulting/slots/bulk — 특정 KST 날짜 전체 열기/닫기.
 *
 *   open : 해당 날짜 blocked → available
 *   close: 해당 날짜 available → blocked
 *   booked 슬롯은 WHERE 조건상 제외됨 (예약 보호, 정직성 P-002).
 *
 * 날짜 경계는 KST(+09:00) 기준 [date 00:00, date 24:00).
 *
 * Body: { date: "YYYY-MM-DD", action: "open" | "close" }
 * 권한: requireMasterAuth.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireMasterAuth, zodErrorResponse } from "@/lib/api-auth";
import { getAdminSupabase } from "@/lib/supabase-server";
import { AdminConsultingSlotsBulkSchema } from "@/lib/schemas/api/admin";

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
  const parsed = AdminConsultingSlotsBulkSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const { date, action } = parsed.data;

  const fromIso = `${date}T00:00:00+09:00`;
  const toIso = `${date}T23:59:59.999+09:00`;
  const fromStatus = action === "open" ? "blocked" : "available";
  const toStatus = action === "open" ? "available" : "blocked";

  const sb = getAdminSupabase();
  // booked 은 eq(status, fromStatus) 조건상 자동 제외 — 예약 보호.
  const { data, error } = await sb
    .from("consulting_time_slots")
    .update({ status: toStatus, updated_at: new Date().toISOString() })
    .eq("status", fromStatus)
    .gte("start_at", fromIso)
    .lte("start_at", toIso)
    .select("id");

  if (error) {
    console.error("[/api/admin/consulting/slots/bulk] error:", error.message);
    return NextResponse.json({ error: "일괄 변경 중 오류" }, { status: 500 });
  }

  const changed = (data ?? []).length;
  return NextResponse.json({ ok: true, action, date, changed });
}
