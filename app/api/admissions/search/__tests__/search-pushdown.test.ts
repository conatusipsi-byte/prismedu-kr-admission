/**
 * /api/admissions/search 회귀 테스트 — QA round 2 P0 (2026-05-25).
 *
 * 결함 4종 (이전 turn 진단) 회귀 방지:
 *   #1 키워드 매칭이 JS-side 후처리 → DB ILIKE pushdown
 *   #2 cursor strict-less-than → offset 인코딩
 *   #3 ORDER BY tiebreak 부재 → (updated_at, university_id, id)
 *   #4 universities-only 키워드 매칭 누락 → 학교명 사전 풀링 후 OR
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/* ─────────────────────────────────────────────────────────────────────
   supabase mock — chainable query builder with call recording
   ───────────────────────────────────────────────────────────────────── */

interface CapturedCall {
  table: string;
  filters: Array<{ kind: string; args: unknown[] }>;
}

const capturedCalls: CapturedCall[] = [];
const mockUnivKeywordResults: Array<{ id: string }> = [];
const mockDeptResults: unknown[] = [];

/**
 * Thenable chainable mock — supabase-js 와 같은 패턴.
 * 모든 빌더 메서드는 builder 자기 자신을 반환. `await builder` 시
 * `.then()` 가 resolve(data) 콜백 호출.
 */
function makeChainableBuilder(table: string, resolveFn: () => unknown): unknown {
  const call: CapturedCall = { table, filters: [] };
  capturedCalls.push(call);
  const builder: Record<string, unknown> = {};
  const passthrough = (kind: string) =>
    vi.fn((...args: unknown[]) => {
      call.filters.push({ kind, args });
      return builder;
    });
  builder.select = passthrough("select");
  builder.eq = passthrough("eq");
  builder.or = passthrough("or");
  builder.in = passthrough("in");
  builder.order = passthrough("order");
  builder.range = passthrough("range");
  builder.limit = passthrough("limit");
  builder.lt = passthrough("lt");
  builder.then = (
    onFulfilled: (v: { data: unknown; error: null }) => unknown,
  ): Promise<unknown> => {
    return Promise.resolve({ data: resolveFn(), error: null }).then(onFulfilled);
  };
  return builder;
}

function makeUniversityBuilder(): unknown {
  return makeChainableBuilder("universities", () => mockUnivKeywordResults);
}

function makeDepartmentsBuilder(): unknown {
  return makeChainableBuilder("departments", () => mockDeptResults);
}

function makeStatsBuilder(): unknown {
  // admission_sample_stats — select().eq().maybeSingle() — 빈 결과
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
  return builder;
}

vi.mock("@/lib/supabase-server", () => ({
  getAdminSupabase: () => ({
    from: (table: string) => {
      if (table === "universities") return makeUniversityBuilder();
      if (table === "departments") return makeDepartmentsBuilder();
      if (table === "admission_sample_stats") return makeStatsBuilder();
      throw new Error(`unmocked table: ${table}`);
    },
  }),
}));

vi.mock("server-only", () => ({}));

beforeEach(() => {
  capturedCalls.length = 0;
  mockUnivKeywordResults.length = 0;
  mockDeptResults.length = 0;
});

async function callRoute(qs: string): Promise<{ status: number; body: Record<string, unknown> }> {
  // 매 테스트마다 새로 import — capturedCalls 가 reset 된 후 route 가 mock 을 다시 호출.
  const { GET } = await import("../route");
  const req = new NextRequest(`http://localhost/api/admissions/search?${qs}`);
  const res = await GET(req);
  return { status: res.status, body: await res.json() };
}

function deptCall(): CapturedCall {
  const c = capturedCalls.find((c) => c.table === "departments");
  if (!c) throw new Error("departments query not made");
  return c;
}

function univCall(): CapturedCall | undefined {
  return capturedCalls.find((c) => c.table === "universities");
}

/* ─────────────────────────────────────────────────────────────────────
   테스트
   ───────────────────────────────────────────────────────────────────── */

describe("GET /api/admissions/search — P0 redesign (QA round 2)", () => {
  it("BUG #1: q 가 있으면 universities 키워드 lookup 을 먼저 수행", async () => {
    mockUnivKeywordResults.push({ id: "kcue_0000063" }, { id: "kcue_0000147" });
    await callRoute("q=%EA%B0%80%EC%B2%9C"); // "가천"

    const uc = univCall();
    expect(uc, "universities 키워드 lookup 누락").toBeDefined();
    const orCall = uc!.filters.find((f) => f.kind === "or");
    expect(orCall, "universities OR ILIKE 미적용").toBeDefined();
    const orExpr = orCall!.args[0] as string;
    expect(orExpr).toContain("n.ilike.%가천%");
    expect(orExpr).toContain("short_name.ilike.%가천%");
    expect(orExpr).toContain("name_en.ilike.%가천%");
  });

  it("BUG #1+#4: departments OR 가 universities 매칭 ID 와 departments.name 매칭을 결합", async () => {
    mockUnivKeywordResults.push({ id: "kcue_0000063" }, { id: "kcue_0000147" });
    await callRoute("q=%EA%B0%80%EC%B2%9C"); // "가천"

    const dc = deptCall();
    // degree_course / daytime OR 가 먼저 등록되므로 keyword OR 는 name.ilike 포함 OR 로 식별.
    const orCalls = dc.filters.filter((f) => f.kind === "or");
    const kwOr = orCalls.find((f) => (f.args[0] as string).includes("name.ilike"));
    expect(kwOr, "departments 키워드 OR 누락").toBeDefined();
    const expr = kwOr!.args[0] as string;
    expect(expr).toContain("name.ilike.%가천%");
    expect(expr).toContain("university_id.in.(kcue_0000063,kcue_0000147)");
  });

  it("BUG #1: 매칭 학교가 없어도 departments.name 매칭만으로 OR 구성", async () => {
    // universities 0건 — 학과명에만 키워드가 있을 수도 있음 (예: "AI" 학과)
    await callRoute("q=AI");
    const dc = deptCall();
    const orCalls = dc.filters.filter((f) => f.kind === "or");
    const kwOr = orCalls.find((f) => (f.args[0] as string).includes("name.ilike"));
    expect(kwOr).toBeDefined();
    const expr = kwOr!.args[0] as string;
    expect(expr).toContain("name.ilike.%AI%");
    expect(expr).not.toContain("university_id.in"); // 빈 ID list 는 누락
  });

  it("BUG #3: ORDER BY 가 (updated_at, university_id, id) 3단 tiebreak", async () => {
    await callRoute("");
    const dc = deptCall();
    const orderCalls = dc.filters.filter((f) => f.kind === "order");
    expect(orderCalls).toHaveLength(3);
    expect(orderCalls[0].args[0]).toBe("updated_at");
    expect((orderCalls[0].args[1] as { ascending: boolean }).ascending).toBe(false);
    expect(orderCalls[1].args[0]).toBe("university_id");
    expect(orderCalls[2].args[0]).toBe("id");
  });

  it("BUG #2: cursor 가 offset 인코딩 (`o:N`) — range() 호출에 반영", async () => {
    await callRoute("cursor=o%3A40&limit=20"); // cursor=o:40
    const dc = deptCall();
    const rangeCall = dc.filters.find((f) => f.kind === "range");
    expect(rangeCall, "range() 미호출 — offset pagination 안 됨").toBeDefined();
    expect(rangeCall!.args[0]).toBe(40); // offset
    expect(rangeCall!.args[1]).toBe(59); // offset + limit - 1
  });

  it("BUG #2: legacy timestamp cursor 는 무시 (offset 0) — 백워드 호환", async () => {
    await callRoute("cursor=2026-05-20T09:13:57.306251%2B00:00&limit=20");
    const dc = deptCall();
    const rangeCall = dc.filters.find((f) => f.kind === "range");
    expect(rangeCall!.args[0]).toBe(0);
    expect(rangeCall!.args[1]).toBe(19);
  });

  it("BUG #2: nextCursor 가 `o:N` 형식으로 발급 (limit 만큼 채워졌을 때)", async () => {
    // 20개 가짜 row → limit=20 이면 더 있음 가정.
    for (let i = 0; i < 20; i += 1) {
      mockDeptResults.push({
        id: `dept-${i}`,
        university_id: `univ-${i}`,
        campus_id: "main",
        name: `학과${i}`,
        name_en: null,
        unit_type: "department",
        track: "engineering",
        total_quota: 10,
        sub_departments: null,
        is_professional: false,
        professional_type: null,
        active: true,
        updated_at: "2026-05-25T00:00:00Z",
        kedi_mjr_id: null,
        universities: {
          id: `univ-${i}`,
          n: `대학${i}`,
          name_en: null,
          short_name: null,
          d: null,
          category: "seoul",
          campuses: [],
          rank_order: null,
          admission_guide_url: null,
          logo_url: null,
          website_url: null,
          active: true,
        },
        department_admissions: [],
      });
    }
    const { body } = await callRoute("limit=20");
    expect(body.nextCursor).toBe("o:20");
  });

  it("category 필터는 universities.category IN — 단일+다중 모두", async () => {
    await callRoute("category=gyeonggi%2Cseoul");
    const dc = deptCall();
    const inCalls = dc.filters.filter((f) => f.kind === "in");
    const categoryIn = inCalls.find((f) => f.args[0] === "universities.category");
    expect(categoryIn, "category IN 미적용").toBeDefined();
    expect(categoryIn!.args[1]).toEqual(["gyeonggi", "seoul"]);
  });

  it("키워드 ILIKE 이스케이프 — %·_·\\ 가 리터럴로 처리", async () => {
    await callRoute("q=100%25");  // "100%"
    const uc = univCall();
    const orCall = uc!.filters.find((f) => f.kind === "or");
    const expr = orCall!.args[0] as string;
    // % 가 \% 로 escape — pattern 내부 wildcard 와 충돌 차단
    expect(expr).toContain("n.ilike.%100\\%%");
  });

  it("키워드에 콤마/괄호 — PostgREST OR 구분자 충돌 차단 (공백 치환)", async () => {
    await callRoute("q=A%2CB"); // "A,B"
    const uc = univCall();
    const orCall = uc!.filters.find((f) => f.kind === "or");
    const expr = orCall!.args[0] as string;
    expect(expr).toContain("n.ilike.%A B%");
  });
});
