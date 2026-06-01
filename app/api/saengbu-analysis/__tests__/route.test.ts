/**
 * POST /api/saengbu-analysis 회귀 (2026-06-01).
 *
 * ⚠️ 비용: getAnthropicClient 를 null 로 모킹 → 실제 Anthropic 호출 0건(mock 분기만).
 *   테스트는 절대 실 API 를 호출하지 않는다 (운영 계정 비용 보호).
 *
 * 시나리오:
 *   - 비로그인 → 401/403 (requireAuth)
 *   - consent 누락/false → 400 (schema literal, 동의 게이트 서버 방어)
 *   - text < 50자 → 400
 *   - free plan → 403 (Pro 게이트)
 *   - pro + consent + 충분한 text → 200, source=mock, 5축, 점수 전부 null(추측 X), caveat 존재
 *   - rate limit 초과 → 429
 *   - 캐시 히트 → cached=true, usage 0
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const requireAuthMock = vi.fn();
const enforceRateLimitMock = vi.fn();
const getCachedResponseMock = vi.fn();
const setCachedResponseMock = vi.fn();
let planValue = "pro";

vi.mock("@/lib/api-auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-auth")>("@/lib/api-auth");
  return { ...actual, requireAuth: (req: NextRequest) => requireAuthMock(req) };
});
vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: (opts: unknown) => enforceRateLimitMock(opts),
}));
// getAnthropicClient=null → 라우트가 mock 분기 → 실 API 호출 없음 (비용 0).
vi.mock("@/lib/anthropic", () => ({
  getAnthropicClient: () => null,
  createMessageWithTimeout: () => {
    throw new Error("createMessageWithTimeout MUST NOT be called in tests (cost guard)");
  },
}));
vi.mock("@/lib/ai-cache", () => ({
  makeCacheKey: (prefix: string, data: object) => `${prefix}_${JSON.stringify(data).length}`,
  getCachedResponse: (k: string) => getCachedResponseMock(k),
  setCachedResponse: (k: string, v: unknown) => setCachedResponseMock(k, v),
}));
vi.mock("@/lib/supabase-server", () => ({
  getAdminSupabase: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: { current_plan: planValue }, error: null }),
        }),
      }),
    }),
  }),
}));
vi.mock("@/lib/sentry-report", () => ({ reportRouteError: vi.fn() }));
vi.mock("server-only", () => ({}));

const LONG_TEXT = "창의적 체험활동: 코딩 동아리에서 3년간 활동하며 알고리즘 대회를 준비했다. ".repeat(6); // > 50자

function post(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/saengbu-analysis", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  requireAuthMock.mockReset();
  enforceRateLimitMock.mockReset();
  getCachedResponseMock.mockReset();
  setCachedResponseMock.mockReset();
  planValue = "pro";
  requireAuthMock.mockResolvedValue({ ok: true, uid: "u-1", email: "s@e.c" });
  enforceRateLimitMock.mockResolvedValue(null); // allow
  getCachedResponseMock.mockResolvedValue(null); // miss
  setCachedResponseMock.mockResolvedValue(undefined);
});

describe("POST /api/saengbu-analysis", () => {
  it("비로그인 → 403", async () => {
    requireAuthMock.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) });
    const { POST } = await import("../route");
    const res = await POST(post({ text: LONG_TEXT, consent: true }));
    expect(res.status).toBe(403);
  });

  it("consent 누락 → 400 (동의 게이트)", async () => {
    const { POST } = await import("../route");
    const res = await POST(post({ text: LONG_TEXT }));
    expect(res.status).toBe(400);
  });

  it("consent=false → 400", async () => {
    const { POST } = await import("../route");
    const res = await POST(post({ text: LONG_TEXT, consent: false }));
    expect(res.status).toBe(400);
  });

  it("text 50자 미만 → 400", async () => {
    const { POST } = await import("../route");
    const res = await POST(post({ text: "짧음", consent: true }));
    expect(res.status).toBe(400);
  });

  it("free plan → 403 (Pro 게이트)", async () => {
    planValue = "free";
    const { POST } = await import("../route");
    const res = await POST(post({ text: LONG_TEXT, consent: true }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.upgradeUrl).toBe("/pricing");
  });

  it("pro + consent + 충분한 text → 200, mock 5축, 점수 전부 null(P-002), caveat 존재", async () => {
    const { POST } = await import("../route");
    const res = await POST(post({ text: LONG_TEXT, focusMajor: "컴퓨터공학", consent: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source).toBe("mock");
    expect(body.axes).toHaveLength(5);
    expect(body.axes.map((a: { axis: string }) => a.axis)).toEqual([
      "academic", "majorFit", "activity", "community", "growth",
    ]);
    // mock 은 점수를 지어내지 않음 — 전부 null
    expect(body.axes.every((a: { score: number | null }) => a.score === null)).toBe(true);
    expect(body.caveats.length).toBeGreaterThan(0);
    // 참고용/합격보장X 취지 caveat 포함
    expect(body.caveats.some((c: string) => c.includes("보장하지 않"))).toBe(true);
    // mock 은 캐시에 쓰지 않음 (실 분석으로 대체되게)
    expect(setCachedResponseMock).not.toHaveBeenCalled();
  });

  it("rate limit 초과 → 429", async () => {
    enforceRateLimitMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "too many" }), { status: 429 }),
    );
    const { POST } = await import("../route");
    const res = await POST(post({ text: LONG_TEXT, consent: true }));
    expect(res.status).toBe(429);
  });

  it("캐시 히트 → cached=true, 신규 토큰 0", async () => {
    getCachedResponseMock.mockResolvedValue({
      axes: [
        { axis: "academic", score: 80, comment: "x" },
        { axis: "majorFit", score: 70, comment: "x" },
        { axis: "activity", score: 75, comment: "x" },
        { axis: "community", score: 60, comment: "x" },
        { axis: "growth", score: 65, comment: "x" },
      ],
      strengths: ["탐구 지속성"],
      weaknesses: [],
      recommendations: [],
      majorFit: null,
      caveats: ["참고용 분석입니다."],
    });
    const { POST } = await import("../route");
    const res = await POST(post({ text: LONG_TEXT, consent: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cached).toBe(true);
    expect(body.source).toBe("anthropic");
    expect(body.usage.inputTokens).toBe(0);
    expect(body.usage.outputTokens).toBe(0);
  });
});
