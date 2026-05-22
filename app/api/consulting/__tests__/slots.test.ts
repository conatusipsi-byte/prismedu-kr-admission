/**
 * GET /api/consulting/slots 회귀 테스트.
 *
 * 검증:
 *   1. 정상 응답 — slots 배열 + 응답 형식 (id, startAt, endAt, durationMinutes)
 *   2. 빈 결과 — slots: []
 *   3. 잘못된 날짜 쿼리 — 400 + zod details
 *   4. 누락 쿼리 — 400
 *   5. to ≤ from — 400
 *   6. 범위 초과 (>60일) — 400
 *   7. Cache-Control 헤더 (s-maxage=60)
 *   8. RLS 정책과 일치 — status='available' 필터 적용
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// supabase-server mock — chainable query 빌더 흉내
const slotRows: Array<{
  id: string;
  start_at: string;
  end_at: string;
  duration_minutes: number;
  status: string;
}> = [];
const lastFilters: Record<string, unknown> = {};

function makeQueryBuilder() {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn((col: string, val: unknown) => {
      lastFilters[`eq:${col}`] = val;
      return builder;
    }),
    gte: vi.fn((col: string, val: unknown) => {
      lastFilters[`gte:${col}`] = val;
      return builder;
    }),
    lt: vi.fn((col: string, val: unknown) => {
      lastFilters[`lt:${col}`] = val;
      return builder;
    }),
    order: vi.fn(() => Promise.resolve({ data: filteredRows(), error: null })),
  };
  return builder;
}

function filteredRows() {
  const gteVal = lastFilters["gte:start_at"] as string | undefined;
  const ltVal = lastFilters["lt:start_at"] as string | undefined;
  const eqStatus = lastFilters["eq:status"] as string | undefined;
  return slotRows.filter((r) => {
    if (eqStatus && r.status !== eqStatus) return false;
    if (gteVal && r.start_at < gteVal) return false;
    if (ltVal && r.start_at >= ltVal) return false;
    return true;
  });
}

vi.mock("@/lib/supabase-server", () => ({
  getAdminSupabase: () => ({
    from: (_table: string) => makeQueryBuilder(),
  }),
}));

vi.mock("server-only", () => ({}));

beforeEach(() => {
  slotRows.length = 0;
  for (const k of Object.keys(lastFilters)) delete lastFilters[k];
});

function buildReq(qs: string): NextRequest {
  return new NextRequest(`http://localhost/api/consulting/slots?${qs}`);
}

describe("GET /api/consulting/slots", () => {
  it("정상 응답 — slots 배열 + 응답 형식", async () => {
    slotRows.push({
      id: "slot-1",
      start_at: "2026-05-22T19:00:00.000Z",
      end_at: "2026-05-22T20:00:00.000Z",
      duration_minutes: 60,
      status: "available",
    });
    slotRows.push({
      id: "slot-2",
      start_at: "2026-05-23T10:00:00.000Z",
      end_at: "2026-05-23T11:00:00.000Z",
      duration_minutes: 60,
      status: "available",
    });

    const { GET } = await import("../slots/route");
    const res = await GET(buildReq("from=2026-05-22&to=2026-05-29"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { slots: unknown[] };
    expect(body.slots).toHaveLength(2);
    expect(body.slots[0]).toEqual({
      id: "slot-1",
      startAt: "2026-05-22T19:00:00.000Z",
      endAt: "2026-05-22T20:00:00.000Z",
      durationMinutes: 60,
    });
  });

  it("빈 결과 — slots: []", async () => {
    const { GET } = await import("../slots/route");
    const res = await GET(buildReq("from=2026-05-22&to=2026-05-29"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { slots: unknown[] };
    expect(body.slots).toEqual([]);
  });

  it("잘못된 날짜 형식 — 400", async () => {
    const { GET } = await import("../slots/route");
    const res = await GET(buildReq("from=invalid&to=2026-05-29"));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("유효하지 않은 입력");
  });

  it("필수 쿼리 누락 — 400", async () => {
    const { GET } = await import("../slots/route");
    const res = await GET(buildReq("from=2026-05-22"));
    expect(res.status).toBe(400);
  });

  it("to ≤ from — 400", async () => {
    const { GET } = await import("../slots/route");
    const res = await GET(buildReq("from=2026-05-29&to=2026-05-22"));
    expect(res.status).toBe(400);
  });

  it("범위 초과 (>60일) — 400", async () => {
    const { GET } = await import("../slots/route");
    const res = await GET(buildReq("from=2026-01-01&to=2026-12-31"));
    expect(res.status).toBe(400);
  });

  it("Cache-Control 헤더 — s-maxage=60", async () => {
    const { GET } = await import("../slots/route");
    const res = await GET(buildReq("from=2026-05-22&to=2026-05-29"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("s-maxage=60");
  });

  it("status='available' 필터 적용 — RLS 정책과 일치", async () => {
    slotRows.push({
      id: "avail",
      start_at: "2026-05-22T19:00:00.000Z",
      end_at: "2026-05-22T20:00:00.000Z",
      duration_minutes: 60,
      status: "available",
    });
    slotRows.push({
      id: "booked",
      start_at: "2026-05-22T20:30:00.000Z",
      end_at: "2026-05-22T21:30:00.000Z",
      duration_minutes: 60,
      status: "booked",
    });

    const { GET } = await import("../slots/route");
    const res = await GET(buildReq("from=2026-05-22&to=2026-05-29"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { slots: Array<{ id: string }> };
    expect(body.slots.map((s) => s.id)).toEqual(["avail"]);
    expect(lastFilters["eq:status"]).toBe("available");
  });
});
