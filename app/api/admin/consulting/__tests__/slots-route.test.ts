/**
 * /api/admin/consulting/slots — 슬롯 관리 회귀 (2026-06-01).
 *
 * 시나리오:
 *   GET      — 비-master 403 / 전체 status 조회 + counts
 *   generate — 멱등(기존 존재 시 inserted=0) / 신규 생성 inserted=slots / 비-master 403
 *   PATCH    — available↔blocked 토글(in-status 가드) / booked 거부 409 / 미존재 404 / 잘못된 ID 400
 *   bulk     — open(blocked→available)·close(available→blocked) fromStatus 가드 / 비-master 403
 *
 * 정직성: booked 슬롯은 PATCH(.in available|blocked) · bulk(.eq fromStatus) 에서 자동 제외.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { buildSeedSlots } from "@/lib/consulting/slot-schedule";

const requireMasterAuthMock = vi.fn();
const fromCalls: Array<{ table: string; method: string; payload?: unknown; filters: Array<{ k: string; op: string; v: unknown }> }> = [];

// 테스트별 결과 제어
const state: {
  selectThen: { data: unknown; error: unknown };
  updateThen: { data: unknown; error: unknown };
  insertThen: { error: unknown };
  maybeSingleQueue: Array<{ data: unknown; error: unknown }>;
} = {
  selectThen: { data: [], error: null },
  updateThen: { data: [], error: null },
  insertThen: { error: null },
  maybeSingleQueue: [],
};

function makeBuilder(table: string): unknown {
  const filters: Array<{ k: string; op: string; v: unknown }> = [];
  const call = { table, method: "", payload: undefined as unknown, filters };
  fromCalls.push(call);
  const setMethodOnce = (m: string): void => {
    if (call.method === "") call.method = m;
  };
  const b: Record<string, unknown> = {};
  b.select = vi.fn(() => { setMethodOnce("select"); return b; });
  b.update = vi.fn((p: unknown) => { setMethodOnce("update"); call.payload = p; return b; });
  b.insert = vi.fn((p: unknown) => { setMethodOnce("insert"); call.payload = p; return b; });
  b.eq = vi.fn((k: string, v: unknown) => { filters.push({ k, op: "eq", v }); return b; });
  b.in = vi.fn((k: string, v: unknown) => { filters.push({ k, op: "in", v }); return b; });
  b.gte = vi.fn((k: string, v: unknown) => { filters.push({ k, op: "gte", v }); return b; });
  b.lte = vi.fn((k: string, v: unknown) => { filters.push({ k, op: "lte", v }); return b; });
  b.order = vi.fn(() => b);
  b.maybeSingle = vi.fn(() =>
    Promise.resolve(state.maybeSingleQueue.shift() ?? { data: null, error: null }),
  );
  b.then = (onF: (v: unknown) => unknown): Promise<unknown> => {
    const result =
      call.method === "insert" ? state.insertThen
      : call.method === "update" ? state.updateThen
      : state.selectThen;
    return Promise.resolve(result).then(onF);
  };
  return b;
}

vi.mock("@/lib/api-auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-auth")>("@/lib/api-auth");
  return { ...actual, requireMasterAuth: (req: NextRequest) => requireMasterAuthMock(req) };
});
vi.mock("@/lib/supabase-server", () => ({
  getAdminSupabase: () => ({ from: (table: string) => makeBuilder(table) }),
}));
vi.mock("server-only", () => ({}));

beforeEach(() => {
  requireMasterAuthMock.mockReset();
  fromCalls.length = 0;
  state.selectThen = { data: [], error: null };
  state.updateThen = { data: [], error: null };
  state.insertThen = { error: null };
  state.maybeSingleQueue = [];
  requireMasterAuthMock.mockResolvedValue({ ok: true, uid: "admin-uid", isMaster: true, email: "a@b.c" });
});

const masterFail = () =>
  requireMasterAuthMock.mockResolvedValue({
    ok: false,
    response: new Response(JSON.stringify({ error: "마스터 권한 필요" }), { status: 403 }),
  });

/* ───────────────────────── GET ───────────────────────── */
describe("GET /api/admin/consulting/slots", () => {
  it("비-master → 403", async () => {
    masterFail();
    const { GET } = await import("../slots/route");
    const res = await GET(new NextRequest("http://localhost/api/admin/consulting/slots"));
    expect(res.status).toBe(403);
  });

  it("전체 status 슬롯 + counts 반환", async () => {
    state.selectThen = {
      data: [
        { id: "s1", start_at: "2026-06-02T03:00:00Z", end_at: "2026-06-02T04:00:00Z", duration_minutes: 60, status: "available" },
        { id: "s2", start_at: "2026-06-02T04:00:00Z", end_at: "2026-06-02T05:00:00Z", duration_minutes: 60, status: "booked" },
        { id: "s3", start_at: "2026-06-02T05:00:00Z", end_at: "2026-06-02T06:00:00Z", duration_minutes: 60, status: "blocked" },
      ],
      error: null,
    };
    const { GET } = await import("../slots/route");
    const res = await GET(new NextRequest("http://localhost/api/admin/consulting/slots"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(3);
    expect(body.counts).toEqual({ available: 1, booked: 1, blocked: 1 });
    expect(body.slots[0].startAt).toBe("2026-06-02T03:00:00Z");
  });
});

/* ───────────────────────── generate ───────────────────────── */
describe("POST /api/admin/consulting/slots/generate", () => {
  it("비-master → 403", async () => {
    masterFail();
    const { POST } = await import("../slots/generate/route");
    const res = await POST(new NextRequest("http://localhost/x", { method: "POST", body: "{}" }));
    expect(res.status).toBe(403);
  });

  it("신규 생성 — inserted = 하루8×N (기존 없음)", async () => {
    state.selectThen = { data: [], error: null }; // 기존 없음
    const { POST } = await import("../slots/generate/route");
    const res = await POST(new NextRequest("http://localhost/x", {
      method: "POST", body: JSON.stringify({ daysAhead: 2 }),
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.inserted).toBe(2 * 8); // 하루 8슬롯 × 2일
    expect(body.perDay).toBe(8);
    // insert payload 길이 일치
    const insCall = fromCalls.find((c) => c.method === "insert");
    expect((insCall!.payload as unknown[]).length).toBe(16);
  });

  it("멱등 — 생성될 슬롯이 모두 이미 존재하면 inserted=0", async () => {
    const gen = buildSeedSlots(new Date(), 2);
    state.selectThen = { data: gen.map((s) => ({ start_at: s.start_at })), error: null };
    const { POST } = await import("../slots/generate/route");
    const res = await POST(new NextRequest("http://localhost/x", {
      method: "POST", body: JSON.stringify({ daysAhead: 2 }),
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.inserted).toBe(0);
    expect(body.skipped).toBe(gen.length);
    // insert 호출 자체가 없어야 함
    expect(fromCalls.some((c) => c.method === "insert")).toBe(false);
  });
});

/* ───────────────────────── PATCH [id] ───────────────────────── */
describe("PATCH /api/admin/consulting/slots/[id]", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const ctx = { params: Promise.resolve({ id }) };

  it("비-master → 403", async () => {
    masterFail();
    const { PATCH } = await import("../slots/[id]/route");
    const res = await PATCH(new NextRequest("http://localhost/x", { method: "PATCH", body: JSON.stringify({ status: "blocked" }) }), ctx);
    expect(res.status).toBe(403);
  });

  it("잘못된 ID 형식 → 400", async () => {
    const { PATCH } = await import("../slots/[id]/route");
    const res = await PATCH(
      new NextRequest("http://localhost/x", { method: "PATCH", body: JSON.stringify({ status: "blocked" }) }),
      { params: Promise.resolve({ id: "bad" }) },
    );
    expect(res.status).toBe(400);
  });

  it("잘못된 status 값 → 400 (zod)", async () => {
    const { PATCH } = await import("../slots/[id]/route");
    const res = await PATCH(
      new NextRequest("http://localhost/x", { method: "PATCH", body: JSON.stringify({ status: "booked" }) }),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it("available→blocked 토글 성공 — in(available,blocked) 가드 적용", async () => {
    state.maybeSingleQueue = [{ data: { id, status: "blocked", start_at: "2026-06-02T03:00:00Z" }, error: null }];
    const { PATCH } = await import("../slots/[id]/route");
    const res = await PATCH(
      new NextRequest("http://localhost/x", { method: "PATCH", body: JSON.stringify({ status: "blocked" }) }),
      ctx,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.slot.status).toBe("blocked");
    // 예약 보호 가드: in('status', ['available','blocked'])
    const upd = fromCalls.find((c) => c.method === "update");
    expect(upd!.filters.some((f) => f.op === "in" && f.k === "status" && Array.isArray(f.v) && (f.v as string[]).includes("available") && (f.v as string[]).includes("blocked"))).toBe(true);
    expect((upd!.payload as { status: string }).status).toBe("blocked");
  });

  it("booked 슬롯 변경 → 409 (update 매칭 X, 존재확인 결과 booked)", async () => {
    state.maybeSingleQueue = [
      { data: null, error: null }, // update (in-guard) 매칭 X
      { data: { id, status: "booked" }, error: null }, // 존재확인 → booked
    ];
    const { PATCH } = await import("../slots/[id]/route");
    const res = await PATCH(
      new NextRequest("http://localhost/x", { method: "PATCH", body: JSON.stringify({ status: "blocked" }) }),
      ctx,
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("slot_booked");
  });

  it("미존재 슬롯 → 404", async () => {
    state.maybeSingleQueue = [
      { data: null, error: null }, // update 매칭 X
      { data: null, error: null }, // 존재확인도 없음
    ];
    const { PATCH } = await import("../slots/[id]/route");
    const res = await PATCH(
      new NextRequest("http://localhost/x", { method: "PATCH", body: JSON.stringify({ status: "available" }) }),
      ctx,
    );
    expect(res.status).toBe(404);
  });
});

/* ───────────────────────── bulk ───────────────────────── */
describe("POST /api/admin/consulting/slots/bulk", () => {
  it("비-master → 403", async () => {
    masterFail();
    const { POST } = await import("../slots/bulk/route");
    const res = await POST(new NextRequest("http://localhost/x", { method: "POST", body: JSON.stringify({ date: "2026-06-02", action: "open" }) }));
    expect(res.status).toBe(403);
  });

  it("close — available→blocked, fromStatus=available 가드 (booked 제외)", async () => {
    state.updateThen = { data: [{ id: "s1" }, { id: "s2" }], error: null };
    const { POST } = await import("../slots/bulk/route");
    const res = await POST(new NextRequest("http://localhost/x", {
      method: "POST", body: JSON.stringify({ date: "2026-06-02", action: "close" }),
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.changed).toBe(2);
    const upd = fromCalls.find((c) => c.method === "update");
    expect((upd!.payload as { status: string }).status).toBe("blocked");
    // fromStatus 가드: eq('status','available') — booked 자동 제외
    expect(upd!.filters.some((f) => f.op === "eq" && f.k === "status" && f.v === "available")).toBe(true);
  });

  it("open — blocked→available, fromStatus=blocked 가드", async () => {
    state.updateThen = { data: [{ id: "s3" }], error: null };
    const { POST } = await import("../slots/bulk/route");
    const res = await POST(new NextRequest("http://localhost/x", {
      method: "POST", body: JSON.stringify({ date: "2026-06-02", action: "open" }),
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.changed).toBe(1);
    const upd = fromCalls.find((c) => c.method === "update");
    expect((upd!.payload as { status: string }).status).toBe("available");
    expect(upd!.filters.some((f) => f.op === "eq" && f.k === "status" && f.v === "blocked")).toBe(true);
  });

  it("잘못된 date 형식 → 400", async () => {
    const { POST } = await import("../slots/bulk/route");
    const res = await POST(new NextRequest("http://localhost/x", {
      method: "POST", body: JSON.stringify({ date: "06-02", action: "open" }),
    }));
    expect(res.status).toBe(400);
  });
});
