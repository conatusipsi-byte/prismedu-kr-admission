/**
 * createStubRoute 헬퍼 단위 테스트
 *
 * 모든 API 라우트 stub이 본 헬퍼로 만들어지므로 헬퍼의 동작이 정확하면
 * 모든 라우트의 401/400/200 동작이 자동 보장됨.
 *
 * 라우트별 옵션 메타는 별도 (`app/api/__tests__/route-options.test.ts`).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/lib/api-auth", () => ({
  requireAuth: vi.fn(),
  requireMasterAuth: vi.fn(),
  zodErrorResponse: vi.fn((err) =>
    NextResponse.json({ error: "유효하지 않은 입력", details: err.format() }, { status: 400 }),
  ),
}));

import { createStubRoute } from "../createStubRoute";
import { requireAuth, requireMasterAuth } from "@/lib/api-auth";

const mockedRequireAuth = vi.mocked(requireAuth);
const mockedRequireMasterAuth = vi.mocked(requireMasterAuth);

beforeEach(() => {
  vi.clearAllMocks();
});

function makeReq(body?: object, query?: Record<string, string>): NextRequest {
  const url = new URL("http://localhost/test");
  if (query) {
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  }
  return new NextRequest(url, {
    method: body ? "POST" : "GET",
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { "content-type": "application/json" } : undefined,
  });
}

/* ═══════════════════════════════════════════════════════════════════════
   1. 인증 분기
   ═══════════════════════════════════════════════════════════════════════ */

describe("createStubRoute — 인증 분기", () => {
  it("auth='public' 라우트는 인증 호출 없이 200", async () => {
    const handler = createStubRoute({ method: "GET", auth: "public", routeId: "test.public" });
    const res = await handler(makeReq());
    expect(res.status).toBe(200);
    expect(mockedRequireAuth).not.toHaveBeenCalled();
    expect(mockedRequireMasterAuth).not.toHaveBeenCalled();
  });

  it("auth='user' 라우트는 미인증 시 401", async () => {
    mockedRequireAuth.mockResolvedValueOnce({
      ok: false,
      reason: "missing_token",
      response: NextResponse.json({ error: "로그인 필요" }, { status: 401 }),
    });
    const handler = createStubRoute({ method: "GET", auth: "user", routeId: "test.user" });
    const res = await handler(makeReq());
    expect(res.status).toBe(401);
    expect(mockedRequireAuth).toHaveBeenCalledTimes(1);
  });

  it("auth='user' + 인증 통과 시 200 + uid 메타", async () => {
    mockedRequireAuth.mockResolvedValueOnce({ ok: true, uid: "test-uid" });
    const handler = createStubRoute({ method: "GET", auth: "user", routeId: "test.user" });
    const res = await handler(makeReq());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.uid).toBe("test-uid");
    expect(json.todo).toBe("Implementation pending");
  });

  it("auth='master' 라우트는 master 검증 호출", async () => {
    mockedRequireMasterAuth.mockResolvedValueOnce({
      ok: false,
      reason: "not_master",
      response: NextResponse.json({ error: "권한 없음" }, { status: 403 }),
    });
    const handler = createStubRoute({ method: "GET", auth: "master", routeId: "test.admin" });
    const res = await handler(makeReq());
    expect(res.status).toBe(403);
    expect(mockedRequireMasterAuth).toHaveBeenCalledTimes(1);
    expect(mockedRequireAuth).not.toHaveBeenCalled();
  });

  it("auth='master' + isMaster 통과 시 응답 메타에 isMaster=true", async () => {
    mockedRequireMasterAuth.mockResolvedValueOnce({
      ok: true,
      uid: "master-uid",
      isMaster: true,
    });
    const handler = createStubRoute({ method: "GET", auth: "master", routeId: "test.admin" });
    const res = await handler(makeReq());
    const json = await res.json();
    expect(json.isMaster).toBe(true);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   2. 입력 스키마 분기
   ═══════════════════════════════════════════════════════════════════════ */

describe("createStubRoute — 스키마 분기", () => {
  const TestSchema = z.object({ name: z.string().min(2) });

  beforeEach(() => {
    mockedRequireAuth.mockResolvedValue({ ok: true, uid: "test-uid" });
  });

  it("POST + 스키마 정상 입력 → 200", async () => {
    const handler = createStubRoute({
      method: "POST",
      auth: "user",
      schema: TestSchema,
      routeId: "test.post",
    });
    const res = await handler(makeReq({ name: "홍길동" }));
    expect(res.status).toBe(200);
  });

  it("POST + 스키마 위반 → 400", async () => {
    const handler = createStubRoute({
      method: "POST",
      auth: "user",
      schema: TestSchema,
      routeId: "test.post",
    });
    const res = await handler(makeReq({ name: "홍" })); // min(2) 위반
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("유효하지 않은");
  });

  it("POST + 잘못된 JSON → 400", async () => {
    const handler = createStubRoute({
      method: "POST",
      auth: "user",
      schema: TestSchema,
      routeId: "test.post",
    });
    const req = new NextRequest("http://localhost/test", {
      method: "POST",
      body: "not-json",
      headers: { "content-type": "application/json" },
    });
    const res = await handler(req);
    expect(res.status).toBe(400);
  });

  it("GET + querySchema 정상 → 200", async () => {
    const QuerySchema = z.object({ q: z.string().min(1) });
    const handler = createStubRoute({
      method: "GET",
      auth: "public",
      querySchema: QuerySchema,
      routeId: "test.search",
    });
    const res = await handler(makeReq(undefined, { q: "test" }));
    expect(res.status).toBe(200);
  });

  it("GET + querySchema 위반 → 400", async () => {
    const QuerySchema = z.object({ q: z.string().min(1) });
    const handler = createStubRoute({
      method: "GET",
      auth: "public",
      querySchema: QuerySchema,
      routeId: "test.search",
    });
    const res = await handler(makeReq()); // q 누락
    expect(res.status).toBe(400);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   3. TODO 응답 메타
   ═══════════════════════════════════════════════════════════════════════ */

describe("createStubRoute — TODO 응답", () => {
  it("schemaRef + routeId + method + auth 메타 응답에 포함", async () => {
    const handler = createStubRoute({
      method: "POST",
      auth: "public",
      routeId: "test.routeId",
      schemaRef: "docs/test.md §1",
    });
    const res = await handler(makeReq({}));
    const json = await res.json();
    expect(json.todo).toBe("Implementation pending");
    expect(json.schemaRef).toBe("docs/test.md §1");
    expect(json.routeId).toBe("test.routeId");
    expect(json.method).toBe("POST");
    expect(json.auth).toBe("public");
  });

  it("dynamic params 응답에 포함", async () => {
    const handler = createStubRoute({
      method: "GET",
      auth: "public",
      routeId: "test.dynamic",
    });
    const ctx = { params: Promise.resolve({ universityId: "snu", departmentId: "med" }) };
    const res = await handler(makeReq(), ctx);
    const json = await res.json();
    expect(json.dynamicParams).toEqual({ universityId: "snu", departmentId: "med" });
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   4. __opts 메타 노출
   ═══════════════════════════════════════════════════════════════════════ */

describe("createStubRoute — __opts 메타", () => {
  it("핸들러에 __opts 프로퍼티 첨부", () => {
    const handler = createStubRoute({
      method: "POST",
      auth: "user",
      routeId: "test.opts",
      schemaRef: "ref",
    });
    expect(handler.__opts).toEqual({
      method: "POST",
      auth: "user",
      routeId: "test.opts",
      schemaRef: "ref",
    });
  });
});
