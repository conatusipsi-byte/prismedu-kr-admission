/**
 * POST /api/payment/confirm — Day 5 신규 상품 분기 + 영수증 (2026-05-25).
 *
 * 시나리오:
 *   1. consult_one 결제 → entitlement.active 에 bundleContents 없는 엔트리
 *   2. season_consult_1 결제 → bundleContents.consulting (timeSlots 없음)
 *   3. season_consult_3 결제 → bundleContents.consulting.timeSlots 3종 초기화
 *   4. 가격 mismatch (클라 amount != effective) → 400 (Toss 호출 X)
 *   5. 멱등 — orders.status='approved' 이미 있으면 즉시 idempotent 반환
 *   6. 영수증 메일 발송 실패 → 결제 성공 응답 유지 (격리)
 *   7. 토스 status != 'DONE' → 400
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const requireAuthMock = vi.fn();
const rateLimitMock = vi.fn();
const sendEmailMock = vi.fn();
const fetchMock = vi.fn();

// orderId 형식 — kr_{kind}_once_{uid36}_{ts13}_{nonce6}
const VALID_UUID = "11111111-1111-4111-8111-111111111111";
function makeOrderId(kind: string): string {
  const ts = Date.now();
  return `kr_${kind}_once_${VALID_UUID}_${ts}_abc123`;
}

/* ─────────────────────────────────────────────────────────────────────
   Supabase mock — orders + user_entitlements + auth.admin
   ───────────────────────────────────────────────────────────────────── */

interface MockState {
  orderStatus: string | null;
  entitlementRow: { active: unknown[]; current_plan: string } | null;
  upsertCalls: Array<{ table: string; payload: Record<string, unknown> }>;
  updateCalls: Array<{ table: string; payload: Record<string, unknown> }>;
  userEmail: string | null;
}
const mockState: MockState = {
  orderStatus: null,
  entitlementRow: null,
  upsertCalls: [],
  updateCalls: [],
  userEmail: "test@example.com",
};

function makeQueryBuilder(table: string): unknown {
  const b: Record<string, unknown> = {};
  let mode: "select" | "update" | "upsert" | "insert" | null = null;
  let updatePayload: Record<string, unknown> = {};
  let upsertPayload: Record<string, unknown> = {};

  b.select = vi.fn(() => {
    mode = "select";
    return b;
  });
  b.update = vi.fn((payload: Record<string, unknown>) => {
    mode = "update";
    updatePayload = payload;
    return b;
  });
  b.upsert = vi.fn((payload: Record<string, unknown>) => {
    mockState.upsertCalls.push({ table, payload });
    return Promise.resolve({ data: null, error: null });
  });
  b.insert = vi.fn(() => Promise.resolve({ data: null, error: null }));
  b.eq = vi.fn(() => b);
  b.maybeSingle = vi.fn(() => {
    if (mode === "select" && table === "orders") {
      return Promise.resolve({
        data: mockState.orderStatus ? { status: mockState.orderStatus } : null,
        error: null,
      });
    }
    if (mode === "select" && table === "user_entitlements") {
      return Promise.resolve({ data: mockState.entitlementRow, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  });
  // .from(table).update(...).eq() 끝에 await 시 promise 반환
  b.then = (onF: (v: { data: null; error: null }) => unknown): Promise<unknown> => {
    if (mode === "update") {
      mockState.updateCalls.push({ table, payload: updatePayload });
    }
    if (mode === "upsert") {
      mockState.upsertCalls.push({ table, payload: upsertPayload });
    }
    return Promise.resolve({ data: null, error: null }).then(onF);
  };
  return b;
}

vi.mock("@/lib/api-auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-auth")>("@/lib/api-auth");
  return {
    ...actual,
    requireAuth: (req: NextRequest) => requireAuthMock(req),
  };
});
vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: () => rateLimitMock(),
}));
vi.mock("@/lib/email/resend", () => ({
  sendEmail: (opts: unknown) => sendEmailMock(opts),
}));
vi.mock("@/lib/supabase-server", () => ({
  getAdminSupabase: () => ({
    from: (table: string) => makeQueryBuilder(table),
    auth: {
      admin: {
        getUserById: () =>
          Promise.resolve({
            data: mockState.userEmail
              ? { user: { id: VALID_UUID, email: mockState.userEmail } }
              : { user: null },
            error: null,
          }),
      },
    },
  }),
}));
vi.mock("@/lib/sentry-report", () => ({
  reportRouteError: vi.fn(),
}));
vi.mock("server-only", () => ({}));

const tossOk = (orderId: string, totalAmount: number): Response =>
  new Response(
    JSON.stringify({ orderId, totalAmount, status: "DONE", method: "신용카드", approvedAt: "2026-05-25T00:00:00Z", paymentKey: "pk_test" }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );

beforeEach(() => {
  requireAuthMock.mockReset();
  rateLimitMock.mockReset();
  sendEmailMock.mockReset();
  fetchMock.mockReset();
  mockState.orderStatus = null;
  mockState.entitlementRow = null;
  mockState.upsertCalls = [];
  mockState.updateCalls = [];
  mockState.userEmail = "test@example.com";
  requireAuthMock.mockResolvedValue({ ok: true, uid: VALID_UUID });
  rateLimitMock.mockResolvedValue(null);
  sendEmailMock.mockResolvedValue({ ok: true, id: "em_1" });
  process.env.TOSS_SECRET_KEY = "test_secret";
  (globalThis as unknown as { fetch: typeof fetchMock }).fetch = fetchMock;
});

function buildReq(orderId: string, amount: number): NextRequest {
  return new NextRequest("http://localhost/api/payment/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paymentKey: "pk_test", orderId, amount }),
  });
}

describe("POST /api/payment/confirm — Day 5 신규 상품", () => {
  it("consult_one — entitlement.active 에 bundleContents 없는 엔트리", async () => {
    const orderId = makeOrderId("consult_one");
    fetchMock.mockResolvedValueOnce(tossOk(orderId, 300000));
    const { POST } = await import("../confirm/route");
    const res = await POST(buildReq(orderId, 300000));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    const entUpsert = mockState.upsertCalls.find((c) => c.table === "user_entitlements");
    expect(entUpsert).toBeDefined();
    const active = (entUpsert!.payload.active as Array<{ productKind: string; bundleContents?: unknown }>);
    expect(active[0].productKind).toBe("consult_one");
    expect(active[0].bundleContents).toBeUndefined();
  });

  it("season_consult_1 — bundleContents.consulting (시기 미지정)", async () => {
    const orderId = makeOrderId("season_consult_1");
    fetchMock.mockResolvedValueOnce(tossOk(orderId, 190000));
    const { POST } = await import("../confirm/route");
    const res = await POST(buildReq(orderId, 190000));
    expect(res.status).toBe(200);
    const ent = mockState.upsertCalls.find((c) => c.table === "user_entitlements");
    const active = ent!.payload.active as Array<{
      productKind: string;
      bundleContents: { subscription?: unknown; consulting?: { totalSlots: number; timeSlots?: unknown } };
    }>;
    expect(active[0].productKind).toBe("season_consult_1");
    expect(active[0].bundleContents.subscription).toEqual({ active: true });
    expect(active[0].bundleContents.consulting?.totalSlots).toBe(1);
    expect(active[0].bundleContents.consulting?.timeSlots).toBeUndefined();
  });

  it("season_consult_3 — bundleContents.consulting.timeSlots 3종 초기화", async () => {
    const orderId = makeOrderId("season_consult_3");
    fetchMock.mockResolvedValueOnce(tossOk(orderId, 490000));
    const { POST } = await import("../confirm/route");
    const res = await POST(buildReq(orderId, 490000));
    expect(res.status).toBe(200);
    const ent = mockState.upsertCalls.find((c) => c.table === "user_entitlements");
    const active = ent!.payload.active as Array<{
      bundleContents: {
        consulting: {
          totalSlots: number;
          timeSlots: Record<string, { remaining: number; validFrom: string }>;
        };
      };
    }>;
    const consulting = active[0].bundleContents.consulting;
    expect(consulting.totalSlots).toBe(3);
    expect(Object.keys(consulting.timeSlots).sort()).toEqual([
      "after_csat",
      "before_june",
      "before_sept",
    ]);
    expect(consulting.timeSlots.before_june).toEqual({
      remaining: 1,
      validFrom: "2026-06-01T00:00:00+09:00",
    });
  });

  it("가격 mismatch (클라 amount != effective) → 400 (Toss 호출 X)", async () => {
    const orderId = makeOrderId("season_pass"); // earlybird = 29000
    const { POST } = await import("../confirm/route");
    const res = await POST(buildReq(orderId, 99000)); // 잘못된 amount
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("멱등 — orders.status='approved' 이미 있으면 즉시 idempotent", async () => {
    const orderId = makeOrderId("consult_one");
    mockState.orderStatus = "approved";
    const { POST } = await import("../confirm/route");
    const res = await POST(buildReq(orderId, 300000));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.idempotent).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("영수증 메일 발송 실패 → 결제 성공 응답 유지 (격리)", async () => {
    const orderId = makeOrderId("consult_one");
    fetchMock.mockResolvedValueOnce(tossOk(orderId, 300000));
    sendEmailMock.mockResolvedValueOnce({ ok: false, reason: "send_failed", error: "smtp down" });
    const { POST } = await import("../confirm/route");
    const res = await POST(buildReq(orderId, 300000));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // void sendPaymentReceipt 패턴이라 await 안 됐을 수 있음 — microtask drain
    await new Promise((r) => setImmediate(r));
    expect(sendEmailMock).toHaveBeenCalled();
  });

  it("토스 status != DONE → 400", async () => {
    const orderId = makeOrderId("consult_one");
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ orderId, totalAmount: 300000, status: "IN_PROGRESS" }), {
        status: 200,
      }),
    );
    const { POST } = await import("../confirm/route");
    const res = await POST(buildReq(orderId, 300000));
    expect(res.status).toBe(400);
  });
});
