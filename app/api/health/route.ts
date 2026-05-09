/**
 * GET /api/health — 환경 진단 엔드포인트
 *
 * 운영자가 staging/production 환경의 외부 의존성 설정 상태를 한 번에 확인.
 * 민감 정보 노출 없이 "설정됨/누락" 만 표시.
 *
 * 인증 없이 접근 가능 — 다만 키 값 자체는 절대 응답에 포함하지 않음.
 * 첫 응답까지 약 2~3초 (Firebase Admin SDK ping 포함).
 *
 * 사용 예:
 *   curl https://conatusipsi.com/api/health
 *   → { ok: true, env: {...}, services: {...} }
 */

import { NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const env = checkEnv();
  const services = await checkServices();

  const ok = env.firebase.complete && services.firebase.ok;

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
        !env.kakao.set ? "카카오 로그인 비활성 (Google + 이메일만)" : undefined,
    },
  });
}

function checkEnv(): EnvStatus {
  const firebase = {
    apiKey: !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    projectId: !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    adminProjectId: !!process.env.FIREBASE_ADMIN_PROJECT_ID,
    adminClientEmail: !!process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    adminPrivateKey: !!process.env.FIREBASE_ADMIN_PRIVATE_KEY,
  };
  const firebaseComplete = Object.values(firebase).every(Boolean);

  return {
    firebase: { ...firebase, complete: firebaseComplete },
    anthropic: { set: hasMeaningfulKey(process.env.ANTHROPIC_API_KEY) },
    toss: {
      set:
        hasMeaningfulKey(process.env.TOSS_SECRET_KEY) &&
        hasMeaningfulKey(process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY),
    },
    kakao: {
      set:
        hasMeaningfulKey(process.env.NEXT_PUBLIC_KAKAO_CLIENT_ID) &&
        hasMeaningfulKey(process.env.KAKAO_CLIENT_SECRET),
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
  const firebase = await pingFirebase();
  return { firebase };
}

async function pingFirebase(): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
  const start = Date.now();
  try {
    // Admin SDK ping — listUsers(1)이 가장 가벼움.
    await getAdminAuth().listUsers(1);
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
  firebase: {
    apiKey: boolean;
    projectId: boolean;
    adminProjectId: boolean;
    adminClientEmail: boolean;
    adminPrivateKey: boolean;
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
  firebase: { ok: boolean; latencyMs?: number; error?: string };
}
