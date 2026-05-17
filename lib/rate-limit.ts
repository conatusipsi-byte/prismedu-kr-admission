/**
 * per-user rate limit — Supabase rate_limits 테이블 + RPC 원자적 증가.
 *
 * 사용처: 결제 승인·AI 챗 등 브루트포스/중복호출 위험이 큰 엔드포인트.
 *
 * Firestore 의 sliding-window(타임스탬프 배열) → Postgres 의 fixed-window(windowStart 별 카운터)
 * 로 단순화. 정확도는 살짝 떨어지지만(윈도우 경계에서 2배 가능) 운영상 동등.
 *
 * 거부 시 NextResponse(429) 반환, 통과 시 null.
 */
import "server-only";
import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase-server";

export interface RateLimitOptions {
  bucket: string;
  uid: string;
  windowMs: number;
  limit: number;
}

export async function enforceRateLimit(
  opts: RateLimitOptions,
): Promise<NextResponse | null> {
  const { bucket, uid, windowMs, limit } = opts;
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  // 윈도우별 키 — 윈도우가 끝나면 자연 리셋 (다음 윈도우는 다른 키)
  const rateKey = `rate_${bucket}_${uid}_${windowStart}`;
  const expiresAt = new Date(windowStart + windowMs * 2);

  try {
    const sb = getAdminSupabase();
    const { data, error } = await sb.rpc("rate_limit_check_and_increment", {
      p_rate_key: rateKey,
      p_window_start: new Date(windowStart).toISOString(),
      p_expires_at: expiresAt.toISOString(),
      p_limit: limit,
    });
    if (error) {
      // RPC 실패 — fail open (운영 신뢰성 우선)
      console.warn(`[rate-limit] ${rateKey} RPC failed:`, error.message);
      return null;
    }
    const row = Array.isArray(data) ? data[0] : data;
    const allowed: boolean = row?.allowed ?? true;
    if (allowed) return null;

    const retryAfterMs = Math.max(0, windowStart + windowMs - now);
    const retrySec = Math.ceil(retryAfterMs / 1000);
    console.warn(
      JSON.stringify({
        type: "rate_limit_exceeded",
        bucket,
        uid,
        limit,
        windowMs,
        retryAfterMs,
        at: new Date(now).toISOString(),
      }),
    );
    return NextResponse.json(
      { error: `요청이 너무 잦아요. ${retrySec}초 후 다시 시도해주세요.` },
      { status: 429, headers: { "Retry-After": String(retrySec) } },
    );
  } catch (e) {
    console.error(`[rate-limit] ${bucket}_${uid} check failed:`, e);
    return null;
  }
}
