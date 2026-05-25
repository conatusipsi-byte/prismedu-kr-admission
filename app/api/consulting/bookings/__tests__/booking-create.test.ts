/**
 * POST /api/consulting/bookings 회귀 (Day 4, 2026-05-25).
 *
 * 시나리오:
 *   1. 정상 예약 → 201 + bookingId
 *   2. 미인증 → 401
 *   3. zod 위반 (timeSlotId 누락) → 400
 *   4. RPC 'slot_unavailable' → 409
 *   5. RPC 'slot_in_past' → 409
 *   6. RPC 'application_not_owned' → 403
 *   7. RPC 'no_consulting_credit' → 403
 *   8. RPC 'slot_not_found' → 404
 *   9. RPC 에러 (DB 장애) → 500
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const requireAuthMock = vi.fn();
const rpcMock = vi.fn();

vi.mock("@/lib/api-auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-auth")>("@/lib/api-auth");
  return {
    ...actual,
    requireAuth: (req: NextRequest) => requireAuthMock(req),
  };
});

vi.mock("@/lib/supabase-server", () => ({
  getAdminSupabase: () => ({
    rpc: (name: string, args: unknown) => rpcMock(name, args),
  }),
}));

vi.mock("server-only", () => ({}));

const validBody = {
  timeSlotId: "11111111-1111-1111-1111-111111111111",
  applicationId: "22222222-2222-2222-2222-222222222222",
};

function buildReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/consulting/bookings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  requireAuthMock.mockReset();
  rpcMock.mockReset();
  requireAuthMock.mockResolvedValue({ ok: true, uid: "user-uid-1" });
});

describe("POST /api/consulting/bookings", () => {
  it("정상 예약 → 201 + bookingId + consumedTimeSlot", async () => {
    rpcMock.mockResolvedValue({
      data: {
        ok: true,
        bookingId: "b-1",
        slotStartAt: "2026-12-01T10:00:00Z",
        slotEndAt: "2026-12-01T11:00:00Z",
        consumedTimeSlot: null,
      },
      error: null,
    });
    const { POST } = await import("../route");
    const res = await POST(buildReq(validBody));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.bookingId).toBe("b-1");
    expect(body.consumedTimeSlot).toBeNull();
    expect(rpcMock).toHaveBeenCalledWith("create_consulting_booking", {
      p_user_id: "user-uid-1",
      p_time_slot_id: validBody.timeSlotId,
      p_application_id: validBody.applicationId,
    });
  });

  it("season_consult_3 시기 매칭 — consumedTimeSlot 반환", async () => {
    rpcMock.mockResolvedValue({
      data: {
        ok: true,
        bookingId: "b-2",
        slotStartAt: "2026-07-15T10:00:00Z",
        slotEndAt: "2026-07-15T11:00:00Z",
        consumedTimeSlot: "before_june",
      },
      error: null,
    });
    const { POST } = await import("../route");
    const res = await POST(buildReq(validBody));
    const body = await res.json();
    expect(body.consumedTimeSlot).toBe("before_june");
  });

  it("미인증 → 401", async () => {
    requireAuthMock.mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 401 }),
    });
    const { POST } = await import("../route");
    const res = await POST(buildReq(validBody));
    expect(res.status).toBe(401);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("timeSlotId 누락 → 400 zod", async () => {
    const { POST } = await import("../route");
    const res = await POST(buildReq({ applicationId: validBody.applicationId }));
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("RPC slot_unavailable → 409", async () => {
    rpcMock.mockResolvedValue({
      data: { ok: false, code: "slot_unavailable" },
      error: null,
    });
    const { POST } = await import("../route");
    const res = await POST(buildReq(validBody));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("slot_unavailable");
    expect(body.error).toContain("다른 분이 예약");
  });

  it("RPC slot_in_past → 409", async () => {
    rpcMock.mockResolvedValue({
      data: { ok: false, code: "slot_in_past" },
      error: null,
    });
    const { POST } = await import("../route");
    const res = await POST(buildReq(validBody));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("slot_in_past");
  });

  it("RPC application_not_owned → 403", async () => {
    rpcMock.mockResolvedValue({
      data: { ok: false, code: "application_not_owned" },
      error: null,
    });
    const { POST } = await import("../route");
    const res = await POST(buildReq(validBody));
    expect(res.status).toBe(403);
  });

  it("RPC no_consulting_credit → 403", async () => {
    rpcMock.mockResolvedValue({
      data: { ok: false, code: "no_consulting_credit", totalUnexpired: 0 },
      error: null,
    });
    const { POST } = await import("../route");
    const res = await POST(buildReq(validBody));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("no_consulting_credit");
  });

  it("RPC slot_not_found → 404", async () => {
    rpcMock.mockResolvedValue({
      data: { ok: false, code: "slot_not_found" },
      error: null,
    });
    const { POST } = await import("../route");
    const res = await POST(buildReq(validBody));
    expect(res.status).toBe(404);
  });

  it("RPC 에러 (DB 장애) → 500", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "connection lost" } });
    const { POST } = await import("../route");
    const res = await POST(buildReq(validBody));
    expect(res.status).toBe(500);
  });

  it("유효하지 않은 JSON → 400", async () => {
    const { POST } = await import("../route");
    const req = new NextRequest("http://localhost/api/consulting/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{invalid",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
