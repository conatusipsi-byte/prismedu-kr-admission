/**
 * GET /api/admin/consulting/slots — 운영자 슬롯 조회 (available/booked/blocked 전체).
 *
 * 공개 GET /api/consulting/slots 는 available 만 노출하지만, 운영자는 닫힌(blocked)·
 * 예약된(booked) 슬롯까지 봐야 열기/닫기를 판단할 수 있으므로 전체 status 반환.
 *
 * Query: ?from=YYYY-MM-DD&to=YYYY-MM-DD&status=available|booked|blocked (모두 optional)
 *   - 기본 범위: 오늘(KST) ~ +30일.
 * 권한: requireMasterAuth — 비-master 403.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireMasterAuth, zodErrorResponse } from "@/lib/api-auth";
import { getAdminSupabase } from "@/lib/supabase-server";
import { AdminConsultingSlotsQuerySchema } from "@/lib/schemas/api/admin";

export const dynamic = "force-dynamic";

interface SlotRow {
  id: string;
  start_at: string;
  end_at: string;
  duration_minutes: number;
  status: "available" | "booked" | "blocked";
}

const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireMasterAuth(req);
  if (!auth.ok) return auth.response;

  const params: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => {
    params[k] = v;
  });
  const parsed = AdminConsultingSlotsQuerySchema.safeParse(params);
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const { from, to, status } = parsed.data;

  // 기본 범위: 오늘(KST 자정) ~ +30일. KST 경계는 +09:00 오프셋으로 표현.
  const fromIso = from ? `${from}T00:00:00+09:00` : new Date().toISOString();
  const toIso = to
    ? `${to}T23:59:59+09:00`
    : new Date(Date.now() + 30 * DAY_MS).toISOString();

  const sb = getAdminSupabase();
  let query = sb
    .from("consulting_time_slots")
    .select("id, start_at, end_at, duration_minutes, status")
    .gte("start_at", fromIso)
    .lte("start_at", toIso)
    .order("start_at", { ascending: true });
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) {
    console.error("[/api/admin/consulting/slots GET] error:", error.message);
    return NextResponse.json({ error: "슬롯 조회 중 오류가 발생했습니다." }, { status: 500 });
  }

  const rows = (data ?? []) as SlotRow[];
  const slots = rows.map((r) => ({
    id: r.id,
    startAt: r.start_at,
    endAt: r.end_at,
    durationMinutes: r.duration_minutes,
    status: r.status,
  }));
  const counts = {
    available: rows.filter((r) => r.status === "available").length,
    booked: rows.filter((r) => r.status === "booked").length,
    blocked: rows.filter((r) => r.status === "blocked").length,
  };

  return NextResponse.json({ slots, counts, total: slots.length });
}
