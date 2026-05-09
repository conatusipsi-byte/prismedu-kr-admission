import { createStubRoute } from "@/lib/api/createStubRoute";
import { JaeoegukminEligibilitySchema } from "@/lib/schemas/api/admissions";

/**
 * POST /api/admissions/jaeoegukmin/eligibility-check
 *
 * P-013 — 재외국민·외국인 자격 자가진단. 일반 한국 입시 라우트와 분리.
 * 비로그인 접근 가능 (학부모·학생이 자격 검토 후 가입 결정).
 */
export const POST = createStubRoute({
  method: "POST",
  auth: "public",
  schema: JaeoegukminEligibilitySchema,
  schemaRef: "docs/sitemap.md §2.1 — POST /api/admissions/jaeoegukmin/eligibility-check (P-013)",
  routeId: "admissions.jaeoegukmin.eligibilityCheck",
});
