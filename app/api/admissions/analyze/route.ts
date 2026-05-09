import { createStubRoute } from "@/lib/api/createStubRoute";
import { AdmissionsAnalyzeSchema } from "@/lib/schemas/api/admissions";

/** POST /api/admissions/analyze — 학과 단일 분석 */
export const POST = createStubRoute({
  method: "POST",
  auth: "user",
  schema: AdmissionsAnalyzeSchema,
  schemaRef: "docs/sitemap.md §4 — POST /api/admissions/analyze",
  routeId: "admissions.analyze",
});
