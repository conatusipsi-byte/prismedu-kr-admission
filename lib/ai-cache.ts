/**
 * AI 응답 Supabase 캐시.
 *
 * - 키는 입력 데이터를 정렬 직렬화 → md5 해싱 (결정적 캐시 키).
 * - TTL 은 INSERT 시점 트리거가 expires_at 계산.
 * - 만료 항목은 ai_cache_cleanup_expired RPC 또는 read 시 만료 체크로 정리.
 */
import "server-only";
import crypto from "crypto";
import { getAdminSupabase } from "./supabase-server";

const TTL_SECONDS = 30 * 24 * 60 * 60;

export function makeCacheKey(prefix: string, data: object): string {
  const json = JSON.stringify(data, Object.keys(data).sort());
  const hash = crypto.createHash("md5").update(json).digest("hex");
  return `${prefix}_${hash}`;
}

export async function getCachedResponse<T = unknown>(key: string): Promise<T | null> {
  try {
    const sb = getAdminSupabase();
    const { data, error } = await sb
      .from("ai_cache")
      .select("value, expires_at")
      .eq("cache_key", key)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as { value: { response: unknown }; expires_at: string };
    if (new Date(row.expires_at).getTime() < Date.now()) {
      // 만료 — fire-and-forget delete
      sb.from("ai_cache").delete().eq("cache_key", key).then(({ error: delError }) => {
        if (delError) console.warn("[ai-cache] cleanup failed:", delError.message);
      });
      return null;
    }
    return row.value.response as T;
  } catch (err) {
    console.warn("[ai-cache] read failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function setCachedResponse(key: string, response: unknown): Promise<void> {
  try {
    const sb = getAdminSupabase();
    const { error } = await sb.from("ai_cache").upsert({
      cache_key: key,
      value: { response },
      ttl_seconds: TTL_SECONDS,
    });
    if (error) console.warn("[ai-cache] write failed:", error.message);
  } catch (err) {
    console.warn("[ai-cache] write threw:", err instanceof Error ? err.message : err);
  }
}
