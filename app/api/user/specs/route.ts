import { createStubRoute } from "@/lib/api/createStubRoute";
import { UserSpecsUpsertSchema } from "@/lib/schemas/api/user";

/** GET /api/user/specs — 본인 스펙 스냅샷 목록 */
export const GET = createStubRoute({
  method: "GET",
  auth: "user",
  schemaRef: "docs/sitemap.md §4 — GET /api/user/specs",
  routeId: "user.specs.list",
});

/**
 * POST /api/user/specs — 신규 스냅샷 추가
 *
 * 사용자 의향(intent)이 포함될 경우 별도 라우트(/api/intent/validate)로
 * 가/나/다군 검증 (P-003) 통과 후 저장 권장.
 */
export const POST = createStubRoute({
  method: "POST",
  auth: "user",
  schema: UserSpecsUpsertSchema,
  schemaRef: "docs/sitemap.md §4 — POST /api/user/specs",
  routeId: "user.specs.create",
});
