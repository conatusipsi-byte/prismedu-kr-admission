/**
 * 서버 부팅 시 환경변수 검증.
 *
 * 목적:
 *   - production 배포에서 치명적 env 누락(예: ANTHROPIC_API_KEY)을 로그로 즉시 드러냄
 *   - 형식 오류(숫자여야 하는데 문자열 등)를 런타임 중 503이 아니라 부팅 시 포착
 *
 * 설계:
 *   - hard-fail(throw) X — 로컬 dev에서 env 일부 누락해도 앱은 뜨고 해당 기능만 503
 *   - missing/invalid 모두 console 경고
 */
import { z } from "zod";

const ServerEnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(10).optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  TOSS_SECRET_KEY: z.string().min(10).optional(),
  KAKAO_CLIENT_SECRET: z.string().min(10).optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).optional(),
});

const PRODUCTION_REQUIRED: (keyof z.infer<typeof ServerEnvSchema>)[] = [
  "ANTHROPIC_API_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "TOSS_SECRET_KEY",
];

let validated = false;

export function validateServerEnv(): void {
  if (validated) return;
  validated = true;

  const parsed = ServerEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error(
      "[env] server env schema invalid:",
      JSON.stringify(parsed.error.flatten().fieldErrors),
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
      `[env] production missing required keys: ${missing.join(", ")}. 해당 기능은 503을 반환합니다.`,
    );
  }
}
