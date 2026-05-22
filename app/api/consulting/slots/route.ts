/**
 * GET /api/consulting/slots — 가용 컨설팅 슬롯 조회 (공개).
 *
 * Day 2 of consulting 계약. 캘린더 UI 가 주별로 호출.
 *
 * Query: ?from=YYYY-MM-DD&to=YYYY-MM-DD (둘 다 필수, to > from, 범위 ≤ 60일)
 * Response: { slots: [{ id, startAt, endAt, durationMinutes }] }
 *
 * Cache: public, s-maxage=60 — 다른 사용자 예약으로 가용 상태가 변동 가능.
 *   너무 길면 stale, 너무 짧으면 시즌(7~11월) 트래픽에 origin 부담. 1분이 절충점.
 *
 * 접근: 비로그인 OK (캘린더 자체는 공개 — 실 예약은 entitlement 검증).
 *   RLS: consulting_time_slots SELECT 정책 = anon/authenticated 모두 (status='available' 한정).
 *   본 라우트는 status='available' 만 조회하므로 service_role/anon 어느 클라이언트로도 결과 동일.
 *   service_role 로 호출 — 일관성·캐싱 가능성.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSupabase } from "@/lib/supabase-server";
import { zodErrorResponse } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
};

const MAX_RANGE_DAYS = 60;

const DateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식이어야 합니다");

const SlotsQuerySchema = z
  .object({
    from: DateOnlySchema,
    to: DateOnlySchema,
  })
  .refine(
    (q) => {
      const fromMs = Date.parse(`${q.from}T00:00:00Z`);
      const toMs = Date.parse(`${q.to}T00:00:00Z`);
      return !Number.isNaN(fromMs) && !Number.isNaN(toMs) && toMs > fromMs;
    },
    { message: "to 는 from 보다 이후여야 합니다", path: ["to"] },
  )
  .refine(
    (q) => {
      const fromMs = Date.parse(`${q.from}T00:00:00Z`);
      const toMs = Date.parse(`${q.to}T00:00:00Z`);
      const days = (toMs - fromMs) / (24 * 60 * 60 * 1000);
      return days <= MAX_RANGE_DAYS;
    },
    { message: `조회 범위는 ${MAX_RANGE_DAYS}일 이내여야 합니다`, path: ["to"] },
  );

interface SlotRow {
  id: string;
  start_at: string;
  end_at: string;
  duration_minutes: number;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const params: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => {
    params[k] = v;
  });
  const parsed = SlotsQuerySchema.safeParse(params);
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const { from, to } = parsed.data;

  try {
    const sb = getAdminSupabase();
    const { data, error } = await sb
      .from("consulting_time_slots")
      .select("id, start_at, end_at, duration_minutes")
      .eq("status", "available")
      .gte("start_at", `${from}T00:00:00Z`)
      .lt("start_at", `${to}T00:00:00Z`)
      .order("start_at", { ascending: true });

    if (error) {
      console.error("[/api/consulting/slots] supabase error:", error.message);
      return NextResponse.json(
        { error: "가용 시간을 불러오지 못했어요." },
        { status: 500 },
      );
    }

    const rows = (data ?? []) as SlotRow[];
    const slots = rows.map((r) => ({
      id: r.id,
      startAt: r.start_at,
      endAt: r.end_at,
      durationMinutes: r.duration_minutes,
    }));

    return NextResponse.json({ slots }, { headers: CACHE_HEADERS });
  } catch (e) {
    console.error("[/api/consulting/slots] threw:", e);
    return NextResponse.json(
      { error: "가용 시간을 불러오지 못했어요." },
      { status: 500 },
    );
  }
}
