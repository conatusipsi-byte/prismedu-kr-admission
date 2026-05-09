import { createStubRoute } from "@/lib/api/createStubRoute";
import { AdmissionsSimilarSchema } from "@/lib/schemas/api/admissions";

/** POST /api/admissions/similar — 코사인 유사도 합격사례 매칭 */
export const POST = createStubRoute({
  method: "POST",
  auth: "user",
  schema: AdmissionsSimilarSchema,
  schemaRef: "docs/sitemap.md §4 — POST /api/admissions/similar",
  routeId: "admissions.similar",
});
