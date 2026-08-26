/**
 * /api/admissions/search 회귀 테스트 — RPC 기반 (BUG-020 round-robin, 2026-05-25).
 *
 * 본 테스트는 search_admissions_v2 RPC 호출 파라미터를 검증.
 * 이전 PostgREST 체인 기반 테스트는 RPC 으로 통합 (단일 호출).
 *
 * 검증 항목:
 *   - 모든 search query 가 search_admissions_v2 RPC 호출 (1회)
 *   - 각 필터 (q / category / track / trackCategory / trackKind / degreeCourse / offset / limit)
 *     가 RPC 매개변수로 정확히 전달
 *   - 매개변수 미전달 시 null (RPC default 사용)
 *   - 응답 shape — universities/department_admissions 임베드 유지
 *   - 멱등 cursor (`o:N`) 인코딩 유지
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { getCurrentAdmissionYear } from "@/lib/admission/current-year";
import { NextRequest } from "next/server";

interface RpcCall {
  name: string;
  args: Record<string, unknown>;
}

const rpcCalls: RpcCall[] = [];
let rpcResultData: unknown[] = [];
const statsBuilder: Record<string, unknown> = {};

vi.mock("@/lib/supabase-server", () => ({
  getAdminSupabase: () => ({
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return Promise.resolve({ data: rpcResultData, error: null });
    },
    from: (table: string) => {
      if (table === "admission_sample_stats") {
        statsBuilder.select = vi.fn(() => statsBuilder);
        statsBuilder.eq = vi.fn(() => statsBuilder);
        statsBuilder.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
        return statsBuilder;
      }
      throw new Error(`unmocked table: ${table}`);
    },
  }),
}));

vi.mock("server-only", () => ({}));

beforeEach(() => {
  rpcCalls.length = 0;
  rpcResultData = [];
});

async function callRoute(qs: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const { GET } = await import("../route");
  const req = new NextRequest(`http://localhost/api/admissions/search?${qs}`);
  const res = await GET(req);
  return { status: res.status, body: await res.json() };
}

function lastRpc(): RpcCall {
  expect(rpcCalls.length, "RPC 호출 0건").toBeGreaterThan(0);
  return rpcCalls[rpcCalls.length - 1];
}

describe("GET /api/admissions/search — BUG-020 RPC 기반", () => {
  it("모든 호출이 search_admissions_v2 RPC 1회 호출", async () => {
    await callRoute("");
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].name).toBe("search_admissions_v2");
  });

  it("필터 미지정 — null 매개변수 + default degree '학사'", async () => {
    await callRoute("");
    const { args } = lastRpc();
    expect(args.p_category).toBeNull();
    expect(args.p_track).toBeNull();
    expect(args.p_track_category).toBeNull();
    expect(args.p_track_kind).toBeNull();
    expect(args.p_keyword).toBeNull();
    expect(args.p_degree_course).toBe("학사");
    expect(args.p_limit).toBe(20);
    expect(args.p_offset).toBe(0);
  });

  it("q 매개변수 → p_keyword 직접 전달 (이스케이프는 RPC 내부)", async () => {
    await callRoute("q=%EA%B0%80%EC%B2%9C"); // 가천
    expect(lastRpc().args.p_keyword).toBe("가천");
  });

  it("category 다중 → p_category 배열", async () => {
    await callRoute("category=seoul%2Cgyeonggi");
    expect(lastRpc().args.p_category).toEqual(["seoul", "gyeonggi"]);
  });

  it("trackKind 다중 → p_track_kind 배열", async () => {
    await callRoute("trackKind=susi_subject%2Csusi_comprehensive");
    expect(lastRpc().args.p_track_kind).toEqual(["susi_subject", "susi_comprehensive"]);
  });

  it("trackCategory 유효값만 → p_track_category. 무효값 (business/language) 제외", async () => {
    await callRoute("trackCategory=humanities%2Cbusiness%2Cmedical");
    expect(lastRpc().args.p_track_category).toEqual(["humanities", "medical"]);
  });

  it("track 단일 → p_track 문자열", async () => {
    await callRoute("track=engineering");
    expect(lastRpc().args.p_track).toBe("engineering");
  });

  it("degreeCourse 'all' → p_degree_course='all' (RPC 가 미적용 처리)", async () => {
    await callRoute("degreeCourse=all");
    expect(lastRpc().args.p_degree_course).toBe("all");
  });

  it("offset cursor (`o:40`) → p_offset=40", async () => {
    await callRoute("cursor=o%3A40&limit=20");
    const { args } = lastRpc();
    expect(args.p_offset).toBe(40);
    expect(args.p_limit).toBe(20);
  });

  it("legacy timestamp cursor → 무시 (offset=0)", async () => {
    await callRoute("cursor=2026-05-20T09:13:57.306251%2B00:00");
    expect(lastRpc().args.p_offset).toBe(0);
  });

  it("limit 만큼 채워졌을 때 nextCursor=`o:N`", async () => {
    rpcResultData = Array.from({ length: 20 }, (_, i) => ({
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
      univ_rank: 1,
    }));
    const { body } = await callRoute("limit=20");
    expect(body.nextCursor).toBe("o:20");
  });

  // 과거엔 여기서 `new Date().getFullYear() + 1` 을 그대로 미러링해, 2027-01-01 롤오버
  // 버그(DB 에 없는 학년도 조회 → 빈 결과)를 테스트가 함께 통과시켰다.
  // 이제 라우트와 동일한 단일 소스를 참조해 "라우트가 그 함수를 쓰는지"만 검증한다.
  // (학년도 계산 로직 자체는 lib/admission/__tests__/current-year.test.ts 가 시각 고정으로 검증)
  it("p_year — getCurrentAdmissionYear() 전달 (trackKind 필터 동작용)", async () => {
    await callRoute("");
    expect(lastRpc().args.p_year).toBe(getCurrentAdmissionYear());
  });

  /* dedup + jaeoegukmin display 회귀 — RPC 외부 (JS) 후처리 보존 검증 */

  it("dedup — 같은 (univ, kediMjrId) legacy 와 KCUE 패턴 둘 다 있으면 legacy 우선", async () => {
    const KEDI = "U04080100063";
    rpcResultData = [
      // legacy
      {
        id: "computer-science",
        university_id: "snu",
        campus_id: "main",
        name: "컴퓨터학과 (legacy)",
        name_en: null,
        unit_type: "department",
        track: "engineering",
        total_quota: 50,
        sub_departments: null,
        is_professional: false,
        professional_type: null,
        active: true,
        updated_at: "2026-05-25T00:00:00Z",
        kedi_mjr_id: KEDI,
        universities: {
          id: "snu", n: "서울대학교", name_en: null, short_name: "서울대",
          d: null, category: "seoul", campuses: [], rank_order: 1,
          admission_guide_url: null, logo_url: null, website_url: null, active: true,
        },
        department_admissions: [],
        univ_rank: 1,
      },
      // KCUE imported — 같은 kedi_mjr_id
      {
        id: "u04080100063-ba-d",
        university_id: "snu",
        campus_id: "main",
        name: "컴퓨터학과 (KCUE)",
        name_en: null,
        unit_type: "department",
        track: "engineering",
        total_quota: 50,
        sub_departments: null,
        is_professional: false,
        professional_type: null,
        active: true,
        updated_at: "2026-05-25T00:00:00Z",
        kedi_mjr_id: KEDI,
        universities: {
          id: "snu", n: "서울대학교", name_en: null, short_name: "서울대",
          d: null, category: "seoul", campuses: [], rank_order: 1,
          admission_guide_url: null, logo_url: null, website_url: null, active: true,
        },
        department_admissions: [],
        univ_rank: 1,
      },
    ];
    const { body } = await callRoute("");
    const results = body.results as Array<{ department: { id: string; name: string } }>;
    expect(results).toHaveLength(1);
    expect(results[0].department.id).toBe("computer-science"); // legacy 우선
  });
});
