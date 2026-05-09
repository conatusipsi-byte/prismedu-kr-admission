import { createStubRoute } from "@/lib/api/createStubRoute";

/**
 * GET /api/user/dashboard — 대시보드 단일 조회
 *
 * 응답: D-Day, intent 진행도(수시 6장 + 정시 가/나/다), 최근 활동, 추천 학과 N개.
 * 페이지에서 `users/me`, `users/me/specs/latest`, `users/me/intent` 를 따로 호출하지 않고
 * 본 라우트가 한 번에 묶어 응답.
 */
export const GET = createStubRoute({
  method: "GET",
  auth: "user",
  schemaRef: "docs/sitemap.md §2.3 — GET /api/user/dashboard",
  routeId: "user.dashboard",
});
