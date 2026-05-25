/**
 * PATCH /api/consulting/bookings/[id] 회귀 (Day 4, 2026-05-25).
 *
 * 시나리오:
 *   1. 정상 취소 → 200 + refundedTimeSlot
 *   2. 미인증 → 401
 *   3. 잘못된 ID 형식 → 400
 *   4. RPC not_owner → 403
 *   5. RPC cancellation_window_expired (24시간 이내) → 409
 *   6. RPC booking_not_found → 404
 *   7. RPC invalid_status (이미 취소) → 409
 *   8. RPC 에러 → 500
 *   9. 빈 본문 (reason 없음) → 200 정상
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

const validId = "33333333-3333-3333-3333-333333333333";

function buildReq(body: unknown = {}): NextRequest {
  return new NextRequest(`http://localhost/api/consulting/bookings/${validId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
const ctx = { params: Promise.resolve({ id: validId }) };

beforeEach(() => {
  requireAuthMock.mockReset();
  rpcMock.mockReset();
  requireAuthMock.mockResolvedValue({ ok: true, uid: "user-uid-1" });
});

describe("PATCH /api/consulting/bookings/[id]", () => {
  it("정상 취소 → 200 + refundedTimeSlot", async () => {
    rpcMock.mockResolvedValue({
      data: { ok: true, bookingId: validId, status: "cancelled", refundedTimeSlot: "before_june" },
      error: null,
    });
    const { PATCH } = await import("../[id]/route");
    const res = await PATCH(buildReq({ reason: "일정 변경" }), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("cancelled");
    expect(body.refundedTimeSlot).toBe("before_june");
    expect(rpcMock).toHaveBeenCalledWith("cancel_consulting_booking", {
      p_user_id: "user-uid-1",
      p_booking_id: validId,
      p_reason: "일정 변경",
    });
  });

  it("미인증 → 401", async () => {
    requireAuthMock.mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 401 }),
    });
    const { PATCH } = await import("../[id]/route");
    const res = await PATCH(buildReq(), ctx);
    expect(res.status).toBe(401);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("잘못된 ID 형식 → 400", async () => {
    const { PATCH } = await import("../[id]/route");
    const res = await PATCH(
      new NextRequest("http://localhost/api/consulting/bookings/bad-id", {
        method: "PATCH",
        body: "{}",
      }),
      { params: Promise.resolve({ id: "bad-id" }) },
    );
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("RPC not_owner → 403", async () => {
    rpcMock.mockResolvedValue({
      data: { ok: false, code: "not_owner" },
      error: null,
    });
    const { PATCH } = await import("../[id]/route");
    const res = await PATCH(buildReq(), ctx);
    expect(res.status).toBe(403);
  });

  it("RPC cancellation_window_expired → 409", async () => {
    rpcMock.mockResolvedValue({
      data: {
        ok: false,
        code: "cancellation_window_expired",
        minCancelAt: "2026-05-26T00:00:00Z",
        slotStartAt: "2026-05-27T00:00:00Z",
      },
      error: null,
    });
    const { PATCH } = await import("../[id]/route");
    const res = await PATCH(buildReq(), ctx);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("cancellation_window_expired");
    expect(body.error).toContain("24시간");
  });

  it("RPC booking_not_found → 404", async () => {
    rpcMock.mockResolvedValue({
      data: { ok: false, code: "booking_not_found" },
      error: null,
    });
    const { PATCH } = await import("../[id]/route");
    const res = await PATCH(buildReq(), ctx);
    expect(res.status).toBe(404);
  });

  it("RPC invalid_status (이미 취소) → 409", async () => {
    rpcMock.mockResolvedValue({
      data: { ok: false, code: "invalid_status", currentStatus: "cancelled" },
      error: null,
    });
    const { PATCH } = await import("../[id]/route");
    const res = await PATCH(buildReq(), ctx);
    expect(res.status).toBe(409);
  });

  it("RPC 에러 → 500", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "db error" } });
    const { PATCH } = await import("../[id]/route");
    const res = await PATCH(buildReq(), ctx);
    expect(res.status).toBe(500);
  });

  it("빈 본문 (reason 없음) → 200 정상", async () => {
    rpcMock.mockResolvedValue({
      data: { ok: true, bookingId: validId, status: "cancelled", refundedTimeSlot: null },
      error: null,
    });
    const { PATCH } = await import("../[id]/route");
    const res = await PATCH(
      new NextRequest(`http://localhost/api/consulting/bookings/${validId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
      }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith("cancel_consulting_booking", {
      p_user_id: "user-uid-1",
      p_booking_id: validId,
      p_reason: null,
    });
  });
});
