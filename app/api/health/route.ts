/**
 * GET /api/health — 환경 진단 엔드포인트 (Supabase 버전).
 *
 * 운영자가 staging/production 환경의 외부 의존성 설정 상태를 한 번에 확인.
 * 민감 정보 노출 없이 "설정됨/누락" 만 표시.
 *
 *   curl https://conatusipsi.com/api/health
 *   → { ok: true, env: {...}, services: {...} }
 */

import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const env = checkEnv();
  const services = await checkServices();

  const ok = env.supabase.complete && services.supabase.ok;

  return NextResponse.json({
    ok,
    timestamp: new Date().toISOString(),
    env,
    services,
    notes: {
      anthropicMissing:
        !env.anthropic.set
          ? "AI 카운슬러는 mock 응답으로 fallback 동작"
          : undefined,
      tossMissing:
        !env.toss.set ? "결제 페이지는 503 (출시 직전 등록)" : undefined,
      kakaoMissing:
        !env.kakao.set ? "카카오 로그인 Provider 별도 활성 필요 (Supabase Console)" : undefined,
      sentryMissing:
        !env.sentry.set
          ? "Sentry DSN 미설정 — 에러 보고 비활성"
          : undefined,
    },
  });
}

function checkEnv(): EnvStatus {
  const supabase = {
    url: hasMeaningfulKey(process.env.NEXT_PUBLIC_SUPABASE_URL),
    anonKey: hasMeaningfulKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    serviceRoleKey: hasMeaningfulKey(process.env.SUPABASE_SERVICE_ROLE_KEY),
  };
  const supabaseComplete = Object.values(supabase).every(Boolean);

  return {
    supabase: { ...supabase, complete: supabaseComplete },
    anthropic: { set: hasMeaningfulKey(process.env.ANTHROPIC_API_KEY) },
    toss: {
      set:
        hasMeaningfulKey(process.env.TOSS_SECRET_KEY) &&
        hasMeaningfulKey(process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY),
    },
    kakao: {
      set: hasMeaningfulKey(process.env.NEXT_PUBLIC_KAKAO_CLIENT_ID),
    },
    sentry: { set: hasMeaningfulKey(process.env.NEXT_PUBLIC_SENTRY_DSN) },
    masterEmails: {
      set: !!process.env.MASTER_EMAILS,
      count:
        process.env.MASTER_EMAILS?.split(",").filter((s) => s.trim()).length ??
        0,
    },
    business: {
      complete: !!(
        process.env.NEXT_PUBLIC_BIZ_NAME &&
        process.env.NEXT_PUBLIC_BIZ_REPRESENTATIVE &&
        process.env.NEXT_PUBLIC_BIZ_REGISTRATION_NUMBER &&
        process.env.NEXT_PUBLIC_BIZ_TELECOM_NUMBER
      ),
    },
  };
}

async function checkServices(): Promise<ServicesStatus> {
  const supabase = await pingSupabase();
  return { supabase };
}

async function pingSupabase(): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
  const start = Date.now();
  try {
    const sb = getAdminSupabase();
    // 가벼운 헬스 체크 — count head (실 데이터 fetch 없음)
    const { error } = await sb
      .from("universities")
      .select("id", { count: "exact", head: true });
    if (error) return { ok: false, error: error.message };
    return { ok: true, latencyMs: Date.now() - start };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

function hasMeaningfulKey(v: string | undefined): boolean {
  if (!v) return false;
  if (v.length < 10) return false;
  if (v.startsWith("placeholder")) return false;
  if (v === "your_anthropic_api_key_here") return false;
  return true;
}

interface EnvStatus {
  supabase: {
    url: boolean;
    anonKey: boolean;
    serviceRoleKey: boolean;
    complete: boolean;
  };
  anthropic: { set: boolean };
  toss: { set: boolean };
  kakao: { set: boolean };
  sentry: { set: boolean };
  masterEmails: { set: boolean; count: number };
  business: { complete: boolean };
}

interface ServicesStatus {
  supabase: { ok: boolean; latencyMs?: number; error?: string };
}
