import { createStubRoute } from "@/lib/api/createStubRoute";
import { IntentValidateSchema } from "@/lib/schemas/api/match";

/**
 * POST /api/intent/validate — 가/나/다군 중복지원 검증 (P-003)
 *
 * 응답: AdmissionIntentValidation { valid, errors[] }
 *   - susi.length > 6
 *   - 같은 군 두 슬롯 (구조상 차단되지만 마이그레이션 시 검출)
 *   - 같은 학과 + 같은 kind 중복
 *   - kind 와 슬롯 위치 불일치
 *   - 일부 대학의 cross-group 금지 정책
 */
export const POST = createStubRoute({
  method: "POST",
  auth: "user",
  schema: IntentValidateSchema,
  schemaRef: "docs/policy.md P-003 — POST /api/intent/validate",
  routeId: "intent.validate",
});
