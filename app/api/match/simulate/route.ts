import { createStubRoute } from "@/lib/api/createStubRoute";
import { MatchSimulateSchema } from "@/lib/schemas/api/match";

/**
 * POST /api/match/simulate — what-if 시뮬레이터 (Pro 전용)
 *
 * baseSpecId 의 스냅샷 위에 override 적용 후 매칭 실행.
 */
export const POST = createStubRoute({
  method: "POST",
  auth: "user",
  schema: MatchSimulateSchema,
  schemaRef: "docs/sitemap.md §4 — POST /api/match/simulate",
  routeId: "match.simulate",
});
