/**
 * createStubRoute — Next.js App Router용 라우트 stub 생성기
 *
 * 라우트 stub 패턴이 모두 동일하므로 (인증 → 입력 검증 → TODO 응답)
 * 본 헬퍼로 한 줄 정의한다. 실제 비즈니스 로직 구현은 별도 PR.
 *
 * 사용:
 *   // app/api/match/route.ts
 *   export const POST = createStubRoute({
 *     method: "POST",
 *     auth: "user",
 *     schema: MatchInputSchema,
 *     schemaRef: "docs/sitemap.md §4 — POST /api/match",
 *   });
 *
 * 회귀 테스트 게이트:
 *   본 헬퍼로 만든 라우트는 다음을 자동 보장:
 *     - 인증 미통과 → 401 (auth: "user"|"master")
 *     - 입력 스키마 위반 → 400 (POST/PUT 시)
 *     - 정상 → 200 + { todo: "Implementation pending" }
 */

import "server-only";
import { NextRequest, NextResponse } from "next/server";
import type { ZodTypeAny } from "zod";
import {
  requireAuth,
  requireMasterAuth,
  zodErrorResponse,
  type AuthResult,
} from "../api-auth";

export type StubAuthLevel = "public" | "user" | "master";
export type StubMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

export interface CreateStubOptions {
  method: StubMethod;
  /** 인증 레벨 — public/user/master */
  auth: StubAuthLevel;
  /** body 입력 스키마 (POST/PUT/PATCH 시) */
  schema?: ZodTypeAny;
  /** GET querystring 입력 스키마 */
  querySchema?: ZodTypeAny;
  /** TODO 응답에 포함될 명세 참조 (operations.md / sitemap.md §) */
  schemaRef?: string;
  /** 응답에 추가 메타 (테스트에서 라우트 식별용) */
  routeId?: string;
}

/**
 * Next.js App Router 핸들러 시그니처 — dynamic·non-dynamic 양쪽 호환.
 * 비-dynamic 라우트(예: /api/admin/etl-status)는 ctx 미전달, dynamic 은 { params } 전달.
 *
 * Next.js 가 자동 생성하는 RouteContext 타입과의 호환을 위해 second arg 는 unknown.
 * 핸들러 본문에서 안전하게 narrow.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DynamicHandler = (req: NextRequest, ctx?: any) => Promise<NextResponse>;

/** 테스트에서 라우트 옵션을 직접 검사할 수 있도록 핸들러에 첨부되는 메타 */
export type StubHandler = DynamicHandler & { __opts: CreateStubOptions };

/**
 * stub route 생성. 반환 함수를 `export const GET/POST/...` 로 노출.
 *
 * 반환 핸들러는 `__opts` 프로퍼티로 옵션을 노출 — 테스트(`route-options.test.ts`)가
 * 인증 레벨·schemaRef·routeId 명명 규칙을 직접 검증할 수 있도록.
 */
export function createStubRoute(opts: CreateStubOptions): StubHandler {
  const handler: DynamicHandler = async function handler(req, ctx) {
    /* 1. 인증 ── */
    let auth: AuthResult | null = null;
    if (opts.auth === "user") {
      auth = await requireAuth(req);
      if (!auth.ok) return auth.response;
    } else if (opts.auth === "master") {
      auth = await requireMasterAuth(req);
      if (!auth.ok) return auth.response;
    }

    /* 2. 입력 검증 ── */
    if (opts.schema && (opts.method === "POST" || opts.method === "PUT" || opts.method === "PATCH")) {
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return NextResponse.json(
          { error: "유효하지 않은 JSON 본문" },
          { status: 400 },
        );
      }
      const parsed = opts.schema.safeParse(body);
      if (!parsed.success) return zodErrorResponse(parsed.error);
    }

    if (opts.querySchema && opts.method === "GET") {
      const params: Record<string, string> = {};
      req.nextUrl.searchParams.forEach((v, k) => {
        params[k] = v;
      });
      const parsed = opts.querySchema.safeParse(params);
      if (!parsed.success) return zodErrorResponse(parsed.error);
    }

    /* 3. dynamic params 추출 (테스트 응답 메타) ── */
    let dynamicParams: Record<string, string> | null = null;
    if (ctx?.params) {
      try {
        dynamicParams = await ctx.params;
      } catch {
        dynamicParams = null;
      }
    }

    /* 4. TODO 응답 ── */
    return NextResponse.json({
      todo: "Implementation pending",
      schemaRef: opts.schemaRef ?? "docs/sitemap.md §4",
      routeId: opts.routeId,
      method: opts.method,
      auth: opts.auth,
      // 디버그 메타 — 비즈니스 로직 구현 시 제거 가능
      uid: auth?.ok ? auth.uid : undefined,
      isMaster: auth?.ok ? auth.isMaster ?? false : undefined,
      dynamicParams,
    });
  };

  // 옵션 메타 첨부 — route-options.test.ts 가 직접 검사
  (handler as StubHandler).__opts = opts;
  return handler as StubHandler;
}
