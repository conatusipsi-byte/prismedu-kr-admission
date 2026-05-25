/**
 * /api/admin/consulting/bookings GET + PATCH 회귀 (Day 6, 2026-05-25).
 *
 * 시나리오:
 *   1. requireMasterAuth 미통과 → 403 (non-master)
 *   2. GET — status=upcoming 필터 정상
 *   3. GET — q (검색) 메모리 필터
 *   4. PATCH adminNotes — 빈 본문 위반 → 400 (refine)
 *   5. PATCH adminNotes 정상 — admin_notes_updated_at + admin_notes_updated_by audit
 *   6. PATCH setStatus completed — confirmed 만 통과
 *   7. PATCH forceCancel → RPC 호출 (p_force=true)
 *   8. forceCancel + 잘못된 ID 형식 → 400
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const requireMasterAuthMock = vi.fn();
const rpcMock = vi.fn();
const fromCalls: Array<{ table: string; method: string; payload?: unknown; filters: Array<{ k: string; v: unknown[] }> }> = [];

function makeBuilder(table: string): unknown {
  const filters: Array<{ k: string; v: unknown[] }> = [];
  const call: { table: string; method: string; payload?: unknown; filters: typeof filters } = {
    table,
    method: "",
    payload: undefined,
    filters,
  };
  fromCalls.push(call);
  const b: Record<string, unknown> = {};
  // method 은 최초 select/update/upsert/insert 1회만 기록 (중복 chain 에서 덮어쓰지 않음)
  const setMethodOnce = (m: string): void => {
    if (call.method === "") call.method = m;
  };
  b.select = vi.fn(() => {
    setMethodOnce("select");
    return b;
  });
  b.update = vi.fn((p: unknown) => {
    setMethodOnce("update");
    call.payload = p;
    return b;
  });
  b.eq = vi.fn((k: string, v: unknown) => {
    filters.push({ k, v: ["eq", v] });
    return b;
  });
  b.gt = vi.fn((k: string, v: unknown) => {
    filters.push({ k, v: ["gt", v] });
    return b;
  });
  b.gte = vi.fn((k: string, v: unknown) => {
    filters.push({ k, v: ["gte", v] });
    return b;
  });
  b.lte = vi.fn((k: string, v: unknown) => {
    filters.push({ k, v: ["lte", v] });
    return b;
  });
  b.in = vi.fn((k: string, v: unknown[]) => {
    filters.push({ k, v: ["in", v] });
    return b;
  });
  b.order = vi.fn(() => b);
  b.range = vi.fn(() => b);
  b.maybeSingle = vi.fn(() => Promise.resolve({ data: { id: "b-1" }, error: null }));
  b.then = (onF: (v: { data: unknown; error: null; count?: number }) => unknown): Promise<unknown> => {
    // GET path returns rows + count. update 의 trailing select/maybeSingle 은 별도 처리됨.
    if (call.method === "select" && table === "consulting_bookings") {
      return Promise.resolve({
        data: [
          {
            id: "b-1",
            user_id: "u-1",
            time_slot_id: "ts-1",
            application_id: "a-1",
            status: "confirmed",
            cancelled_at: null,
            cancellation_reason: null,
            admin_notes: null,
            admin_notes_updated_at: null,
            created_at: "2026-05-25T00:00:00Z",
            consulting_time_slots: {
              id: "ts-1",
              start_at: "2099-12-01T10:00:00Z",
              end_at: "2099-12-01T11:00:00Z",
              duration_minutes: 60,
            },
            consulting_applications: {
              id: "a-1",
              student_name: "홍길동",
              student_grade: 3,
              high_school: "한국고",
              consultation_topics: ["정시 전략"],
              current_grades: null,
              target_universities: null,
              questions: "test",
            },
          },
        ],
        error: null,
        count: 1,
      }).then(onF);
    }
    return Promise.resolve({ data: null, error: null }).then(onF);
  };
  return b;
}

vi.mock("@/lib/api-auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-auth")>("@/lib/api-auth");
  return {
    ...actual,
    requireMasterAuth: (req: NextRequest) => requireMasterAuthMock(req),
  };
});
vi.mock("@/lib/supabase-server", () => ({
  getAdminSupabase: () => ({
    from: (table: string) => makeBuilder(table),
    rpc: (name: string, args: unknown) => rpcMock(name, args),
    auth: {
      admin: {
        getUserById: () =>
          Promise.resolve({
            data: { user: { id: "u-1", email: "user@example.com", user_metadata: { name: "홍길동" } } },
            error: null,
          }),
      },
    },
  }),
}));
vi.mock("server-only", () => ({}));

beforeEach(() => {
  requireMasterAuthMock.mockReset();
  rpcMock.mockReset();
  fromCalls.length = 0;
  requireMasterAuthMock.mockResolvedValue({ ok: true, uid: "admin-uid", isMaster: true, email: "admin@example.com" });
});

describe("GET /api/admin/consulting/bookings", () => {
  it("requireMasterAuth 실패 → 403", async () => {
    requireMasterAuthMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "마스터 권한 필요" }), { status: 403 }),
    });
    const { GET } = await import("../bookings/route");
    const req = new NextRequest("http://localhost/api/admin/consulting/bookings");
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it("status=upcoming → status=confirmed + start_at > now 필터 적용", async () => {
    const { GET } = await import("../bookings/route");
    const req = new NextRequest("http://localhost/api/admin/consulting/bookings?status=upcoming");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].user.email).toBe("user@example.com");
    // 필터 확인 — eq status=confirmed + gt start_at
    const bookingsCall = fromCalls.find((c) => c.table === "consulting_bookings");
    expect(bookingsCall?.filters.some((f) => f.k === "status" && f.v[1] === "confirmed")).toBe(true);
    expect(bookingsCall?.filters.some((f) => f.k === "consulting_time_slots.start_at" && f.v[0] === "gt")).toBe(true);
  });

  it("q (검색) — 매칭 안 되는 이메일 → 빈 결과", async () => {
    const { GET } = await import("../bookings/route");
    const req = new NextRequest("http://localhost/api/admin/consulting/bookings?status=upcoming&q=nomatch");
    const res = await GET(req);
    const body = await res.json();
    expect(body.items).toHaveLength(0);
  });

  it("q (검색) — 학생 이름 매칭", async () => {
    const { GET } = await import("../bookings/route");
    const req = new NextRequest("http://localhost/api/admin/consulting/bookings?status=upcoming&q=홍길동");
    const res = await GET(req);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
  });
});

describe("PATCH /api/admin/consulting/bookings/[id]", () => {
  const validId = "11111111-1111-4111-8111-111111111111";
  const ctx = { params: Promise.resolve({ id: validId }) };

  it("requireMasterAuth 실패 → 403", async () => {
    requireMasterAuthMock.mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 403 }),
    });
    const { PATCH } = await import("../bookings/[id]/route");
    const req = new NextRequest(`http://localhost/api/admin/consulting/bookings/${validId}`, {
      method: "PATCH",
      body: JSON.stringify({ adminNotes: "test" }),
    });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(403);
  });

  it("빈 본문 (refine 위반) → 400", async () => {
    const { PATCH } = await import("../bookings/[id]/route");
    const req = new NextRequest(`http://localhost/api/admin/consulting/bookings/${validId}`, {
      method: "PATCH",
      body: JSON.stringify({}),
    });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(400);
  });

  it("잘못된 ID 형식 → 400", async () => {
    const { PATCH } = await import("../bookings/[id]/route");
    const req = new NextRequest("http://localhost/api/admin/consulting/bookings/bad", {
      method: "PATCH",
      body: JSON.stringify({ adminNotes: "x" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "bad" }) });
    expect(res.status).toBe(400);
  });

  it("adminNotes 갱신 — admin_notes + audit 컬럼 payload 확인", async () => {
    const { PATCH } = await import("../bookings/[id]/route");
    const req = new NextRequest(`http://localhost/api/admin/consulting/bookings/${validId}`, {
      method: "PATCH",
      body: JSON.stringify({ adminNotes: "관찰 메모" }),
    });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);
    const updateCall = fromCalls.find((c) => c.table === "consulting_bookings" && c.method === "update");
    const payload = updateCall!.payload as { admin_notes: string; admin_notes_updated_by: string; admin_notes_updated_at: string };
    expect(payload.admin_notes).toBe("관찰 메모");
    expect(payload.admin_notes_updated_by).toBe("admin-uid");
    expect(payload.admin_notes_updated_at).toBeTruthy();
  });

  it("adminNotes 빈 문자열 → null 저장 (audit 컬럼도 null)", async () => {
    const { PATCH } = await import("../bookings/[id]/route");
    const req = new NextRequest(`http://localhost/api/admin/consulting/bookings/${validId}`, {
      method: "PATCH",
      body: JSON.stringify({ adminNotes: "   " }),
    });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);
    const updateCall = fromCalls.find((c) => c.table === "consulting_bookings" && c.method === "update");
    const payload = updateCall!.payload as { admin_notes: string | null };
    expect(payload.admin_notes).toBeNull();
  });

  it("setStatus=completed → status='confirmed' eq + update 호출", async () => {
    const { PATCH } = await import("../bookings/[id]/route");
    const req = new NextRequest(`http://localhost/api/admin/consulting/bookings/${validId}`, {
      method: "PATCH",
      body: JSON.stringify({ setStatus: "completed" }),
    });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);
    const updateCall = fromCalls.find((c) => c.table === "consulting_bookings" && c.method === "update");
    expect(updateCall).toBeDefined();
    expect((updateCall!.payload as { status: string }).status).toBe("completed");
    // confirmed eq 추가 확인 — id eq + status eq confirmed 둘 다 있어야 함
    expect(updateCall!.filters.some((f) => f.k === "status" && f.v[1] === "confirmed")).toBe(true);
  });

  it("forceCancel → cancel_consulting_booking RPC (p_force=true)", async () => {
    rpcMock.mockResolvedValue({
      data: { ok: true, bookingId: validId, status: "cancelled", refundedTimeSlot: null, forced: true },
      error: null,
    });
    const { PATCH } = await import("../bookings/[id]/route");
    const req = new NextRequest(`http://localhost/api/admin/consulting/bookings/${validId}`, {
      method: "PATCH",
      body: JSON.stringify({ forceCancel: true, cancellationReason: "운영자 판단" }),
    });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith("cancel_consulting_booking", {
      p_user_id: "admin-uid",
      p_booking_id: validId,
      p_reason: "운영자 판단",
      p_force: true,
    });
  });

  it("forceCancel RPC 실패 (booking_not_found) → 404", async () => {
    rpcMock.mockResolvedValue({
      data: { ok: false, code: "booking_not_found" },
      error: null,
    });
    const { PATCH } = await import("../bookings/[id]/route");
    const req = new NextRequest(`http://localhost/api/admin/consulting/bookings/${validId}`, {
      method: "PATCH",
      body: JSON.stringify({ forceCancel: true }),
    });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(404);
  });
});
