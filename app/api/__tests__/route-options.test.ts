/**
 * API 라우트 옵션 메타 회귀 테스트
 *
 * 모든 라우트가 createStubRoute 로 만들어졌고 핸들러에 `__opts` 가 첨부되므로,
 * 본 테스트는 **각 라우트의 인증 레벨·스키마 참조·routeId 명명 규칙**을 직접 검증.
 *
 * 라우트 동작 자체(401/400/200)는 createStubRoute.test.ts 가 보장.
 * 본 파일은 "라우트가 올바른 옵션을 createStubRoute 에 전달했는가"를 검증.
 *
 * 사용자 요청: "각 라우트마다 최소 3개 테스트"
 *   1. 올바른 auth 레벨
 *   2. schemaRef 가 docs 참조
 *   3. routeId 명명 규칙 준수
 */

import { describe, it, expect } from "vitest";

// 라우트 핸들러 import — server-only 의존이라 vitest.config.ts 의 alias 가
// "server-only" → vitest.server-only-stub.ts 로 매핑되어야 동작.
//
// 주의: 실 구현으로 교체된 라우트는 본 카탈로그에서 제외:
//   - admissions.search (Task #23)
//   - admin.sanitizeMonitor (Launch Blocker #3)
//   - match.post, match.byId (Day 2 — POST/GET /api/match[/id])
//   - payment.request, payment.confirm, payment.cancel, orders.list (Day 5)
//   - admin.etlStatus (Day 10 — 실 구현 + admin.etlUpload·admin.etlPromote 신규 실 구현)
//   - admin.sampleStats (Day 11 — 실 구현)
// 실 구현 라우트의 회귀 검증은 자체 통합 테스트로 분리.
import { GET as detailGet } from "@/app/api/admissions/[universityId]/[departmentId]/route";
import { POST as jaeoegukminPost } from "@/app/api/admissions/jaeoegukmin/eligibility-check/route";
import { POST as analyzePost } from "@/app/api/admissions/analyze/route";
import { POST as similarPost } from "@/app/api/admissions/similar/route";

import { GET as profileGet, POST as profilePost } from "@/app/api/user/profile/route";
import { GET as specsGet, POST as specsPost } from "@/app/api/user/specs/route";
import { GET as dashboardGet } from "@/app/api/user/dashboard/route";

import { POST as simulatePost } from "@/app/api/match/simulate/route";
import { POST as intentValidatePost } from "@/app/api/intent/validate/route";

// sanitize-monitor·etl-status·sample-stats 모두 실 구현 — 카탈로그 제외

import type { StubHandler } from "@/lib/api/createStubRoute";

/* ═══════════════════════════════════════════════════════════════════════
   라우트 카탈로그
   ═══════════════════════════════════════════════════════════════════════ */

interface RouteCase {
  name: string;
  handler: StubHandler;
  expectedAuth: "public" | "user" | "master";
  /** schemaRef 에 포함되어야 할 docs 키워드 */
  schemaRefMustInclude: string;
  /** 입력 스키마(body) 또는 querySchema 가 정의되어야 하는지 */
  hasSchema: boolean;
}

const ROUTES: RouteCase[] = [
  // ── 학과·대학 (공개) ──────────────────────────────────────
  // (admissions.search 는 실 구현으로 교체됨 — 카탈로그 제외)
  { name: "GET  /api/admissions/[uid]/[did]",                     handler: detailGet,           expectedAuth: "public", schemaRefMustInclude: "P-001",   hasSchema: false },
  { name: "POST /api/admissions/jaeoegukmin/eligibility-check",   handler: jaeoegukminPost,     expectedAuth: "public", schemaRefMustInclude: "P-013",   hasSchema: true },

  // ── 분석 (인증) ──────────────────────────────────────────
  // (match.post, match.byId 는 실 구현으로 교체됨 — 카탈로그 제외)
  { name: "POST /api/admissions/analyze",                         handler: analyzePost,         expectedAuth: "user",   schemaRefMustInclude: "sitemap", hasSchema: true },
  { name: "POST /api/admissions/similar",                         handler: similarPost,         expectedAuth: "user",   schemaRefMustInclude: "sitemap", hasSchema: true },
  { name: "POST /api/match/simulate",                             handler: simulatePost,        expectedAuth: "user",   schemaRefMustInclude: "sitemap", hasSchema: true },
  { name: "POST /api/intent/validate",                            handler: intentValidatePost,  expectedAuth: "user",   schemaRefMustInclude: "P-003",   hasSchema: true },

  // ── 사용자 (인증) ────────────────────────────────────────
  { name: "GET  /api/user/profile",                               handler: profileGet,          expectedAuth: "user",   schemaRefMustInclude: "sitemap", hasSchema: false },
  { name: "POST /api/user/profile",                               handler: profilePost,         expectedAuth: "user",   schemaRefMustInclude: "sitemap", hasSchema: true },
  { name: "GET  /api/user/specs",                                 handler: specsGet,            expectedAuth: "user",   schemaRefMustInclude: "sitemap", hasSchema: false },
  { name: "POST /api/user/specs",                                 handler: specsPost,           expectedAuth: "user",   schemaRefMustInclude: "sitemap", hasSchema: true },
  { name: "GET  /api/user/dashboard",                             handler: dashboardGet,        expectedAuth: "user",   schemaRefMustInclude: "sitemap", hasSchema: false },

  // ── 결제 (인증) ──────────────────────────────────────────
  // (payment.request, payment.confirm, payment.cancel, orders.list 는 실 구현으로 교체됨 — 카탈로그 제외)

  // ── 관리자 ────────────────────────────────────────────────
  // (admin.sanitizeMonitor·admin.etlStatus·admin.sampleStats 모두 실 구현 — 카탈로그 제외)
];

/* ═══════════════════════════════════════════════════════════════════════
   테스트 1 — 인증 레벨
   ═══════════════════════════════════════════════════════════════════════ */

describe("API 라우트 옵션 — 인증 레벨", () => {
  it.each(ROUTES)("$name 는 auth=$expectedAuth", ({ handler, expectedAuth }) => {
    expect(handler.__opts.auth).toBe(expectedAuth);
  });

  // 모든 admin 라우트가 실 구현으로 교체됨 (Day 11 sample-stats 마지막) — stub 카탈로그에서 admin 라우트 0건.
  // master 인증 보장은 각 실 구현 라우트의 자체 회귀가 담당.

  it("공개 stub 라우트는 정확히 2개 (search 는 실 구현으로 별도 테스트)", () => {
    const publicRoutes = ROUTES.filter((r) => r.expectedAuth === "public");
    expect(publicRoutes).toHaveLength(2);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   테스트 2 — schemaRef 가 docs 참조
   ═══════════════════════════════════════════════════════════════════════ */

describe("API 라우트 옵션 — schemaRef 명세 참조", () => {
  it.each(ROUTES)(
    "$name 의 schemaRef 는 '$schemaRefMustInclude' 키워드 포함",
    ({ handler, schemaRefMustInclude }) => {
      expect(handler.__opts.schemaRef).toBeDefined();
      expect(handler.__opts.schemaRef).toContain(schemaRefMustInclude);
    },
  );

  it("schemaRef 는 모든 라우트에서 정의됨 (구현 PR 추적용)", () => {
    for (const r of ROUTES) {
      expect(r.handler.__opts.schemaRef, `${r.name} schemaRef 누락`).toBeDefined();
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   테스트 3 — routeId 명명 규칙 + 스키마 정의 여부
   ═══════════════════════════════════════════════════════════════════════ */

describe("API 라우트 옵션 — routeId 명명 + 스키마 정의", () => {
  it.each(ROUTES)("$name 의 routeId 는 점 표기 + 알파벳 (e.g., 'admissions.search')", ({ handler }) => {
    expect(handler.__opts.routeId).toBeDefined();
    expect(handler.__opts.routeId!).toMatch(/^[a-z][a-zA-Z]*(\.[a-zA-Z]+)*$/);
  });

  it.each(ROUTES)(
    "$name — 입력 스키마 정의 일관성 (POST/PUT/PATCH 또는 GET querySchema)",
    ({ handler, hasSchema }) => {
      const opts = handler.__opts;
      const hasBodySchema = opts.schema !== undefined;
      const hasQuerySchema = opts.querySchema !== undefined;
      const hasAny = hasBodySchema || hasQuerySchema;

      if (hasSchema) {
        expect(hasAny, `${opts.routeId} — body/query 스키마 둘 다 누락`).toBe(true);
      }
    },
  );

  it("routeId 중복 없음 (라우트 식별자 unique)", () => {
    const ids = ROUTES.map((r) => r.handler.__opts.routeId);
    const uniq = new Set(ids);
    expect(uniq.size).toBe(ids.length);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   테스트 4 — 카운트
   ═══════════════════════════════════════════════════════════════════════ */

describe("API 라우트 카탈로그 카운트", () => {
  it("총 stub 라우트 핸들러 11개 (실 구현 9건 제외 — search·sanitize-monitor·match×2·payment×3·orders·etl-status·sample-stats)", () => {
    expect(ROUTES).toHaveLength(11);
  });
});
