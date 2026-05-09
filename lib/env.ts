/**
 * 서버 부팅 시 환경변수 검증.
 *
 * 목적:
 *   - production 배포에서 치명적 env 누락(예: ANTHROPIC_API_KEY)을 로그로 즉시 드러냄
 *   - 형식 오류(숫자여야 하는데 문자열 등)를 런타임 중 503이 아니라 부팅 시 포착
 *
 * 설계 선택:
 *   - hard-fail(throw)은 하지 않음 — 로컬 dev에서 env 일부 누락해도 앱은 뜨고
 *     해당 기능만 503으로 우아하게 죽는 편이 DX/운영 양쪽에 유리
 *   - 대신 missing/invalid 모두 console로 명확히 알린다.
 *   - 라우트 쪽은 여전히 `process.env.X` 개별 체크를 유지 (이 파일이 없어도 안전)
 *
 * 호출:
 *   - `getAdminDb()` 최초 호출 시 함께 1회 실행되도록 firebase-admin.ts에서 import
 *   - Next.js instrumentation.ts로 옮길 수도 있지만 현재는 불필요
 */
import { z } from "zod";

// 서버 전용 env. 누락 시 해당 기능 503으로 우아하게 죽지만, 배포 환경에선 경고 로그 남김.
const ServerEnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(10).optional(),
  FIREBASE_ADMIN_PROJECT_ID: z.string().min(1).optional(),
  FIREBASE_ADMIN_CLIENT_EMAIL: z.string().email().optional(),
  FIREBASE_ADMIN_PRIVATE_KEY: z.string().min(50).optional(),
  TOSS_SECRET_KEY: z.string().min(10).optional(),
  KAKAO_CLIENT_SECRET: z.string().min(10).optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).optional(),
});

// production에서 반드시 있어야 핵심 기능이 동작하는 키 목록.
// (없으면 기능별 503 처리되지만, 배포 시엔 의도된 누락이 아닌 한 경고)
const PRODUCTION_REQUIRED: (keyof z.infer<typeof ServerEnvSchema>)[] = [
  "ANTHROPIC_API_KEY",
  "FIREBASE_ADMIN_PROJECT_ID",
  "FIREBASE_ADMIN_CLIENT_EMAIL",
  "FIREBASE_ADMIN_PRIVATE_KEY",
  "TOSS_SECRET_KEY",
];

let validated = false;

export function validateServerEnv(): void {
  if (validated) return;
  validated = true;

  const parsed = ServerEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    // 형식 오류(email이 아니거나 너무 짧은 경우 등) — 의도한 placeholder가 아닐 가능성 높음
    console.error(
      "[env] server env schema invalid:",
      JSON.stringify(parsed.error.flatten().fieldErrors)
    );
    return;
  }

  if (process.env.NODE_ENV !== "production") return;

  const missing = PRODUCTION_REQUIRED.filter((k) => {
    const v = parsed.data[k];
    return !v || v === "your_anthropic_api_key_here";
  });
  if (missing.length > 0) {
    console.warn(
      `[env] production missing required keys: ${missing.join(", ")}. 해당 기능은 503을 반환합니다.`
    );
  }
}
