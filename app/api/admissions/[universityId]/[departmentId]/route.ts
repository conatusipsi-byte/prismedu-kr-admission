import { createStubRoute } from "@/lib/api/createStubRoute";

/**
 * GET /api/admissions/[universityId]/[departmentId] — 학과 상세 (공개)
 *
 * P-001 핵심 무대 — 모집요강·일정·반영비·응시영역기준 무료 공개.
 * 합격률 분석 카드만 별도 API(`/api/match`)로 호출.
 */
export const GET = createStubRoute({
  method: "GET",
  auth: "public",
  schemaRef: "docs/sitemap.md §2.1 — GET /api/admissions/[uid]/[did] (P-001)",
  routeId: "admissions.detail",
});
