import { createStubRoute } from "@/lib/api/createStubRoute";
import { UserProfileUpdateSchema } from "@/lib/schemas/api/user";

/** GET /api/user/profile — 본인 프로필 조회 */
export const GET = createStubRoute({
  method: "GET",
  auth: "user",
  schemaRef: "docs/sitemap.md §4 — GET /api/user/profile",
  routeId: "user.profile.get",
});

/** POST /api/user/profile — 프로필 갱신 */
export const POST = createStubRoute({
  method: "POST",
  auth: "user",
  schema: UserProfileUpdateSchema,
  schemaRef: "docs/sitemap.md §4 — POST /api/user/profile",
  routeId: "user.profile.update",
});
