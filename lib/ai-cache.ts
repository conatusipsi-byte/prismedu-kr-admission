import crypto from "crypto";
import { getAdminDb } from "./firebase-admin";

/**
 * AI 응답 Firestore 캐시.
 *
 * - 키는 입력 데이터를 정렬 직렬화 → md5 해싱 (결정적 캐시 키).
 * - 30일 TTL로 읽기 시점에 만료 확인. 만료된 항목은 다음 write로 덮어쓰기.
 * - 캐시는 optional: 실패는 치명적이지 않으므로 에러를 삼키되, 운영자가 원인 파악하도록 로그는 남긴다.
 *   (예전엔 `catch {}` 로 모두 무시 → Firestore 장애 vs 캐시 miss 구분 불가능 문제).
 */

const TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function makeCacheKey(prefix: string, data: object): string {
  const json = JSON.stringify(data, Object.keys(data).sort());
  const hash = crypto.createHash("md5").update(json).digest("hex");
  return `${prefix}_${hash}`;
}

export async function getCachedResponse<T = unknown>(key: string): Promise<T | null> {
  try {
    const db = getAdminDb();
    const snap = await db.collection("ai_cache").doc(key).get();
    if (!snap.exists) return null;

    const data = snap.data();
    if (!data) return null;

    const createdAt = typeof data.createdAt === "number" ? data.createdAt : 0;
    if (Date.now() - createdAt > TTL_MS) {
      // 만료 — fire-and-forget으로 정리. 연속 호출이 같은 키를 두 번 지우더라도 idempotent.
      db.collection("ai_cache").doc(key).delete().catch(() => {});
      return null;
    }

    return data.response as T;
  } catch (err) {
    // Firestore 자체 장애. cache hit/miss와 구분 가능하도록 로그.
    console.warn("[ai-cache] read failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function setCachedResponse(key: string, response: unknown): Promise<void> {
  try {
    const db = getAdminDb();
    await db.collection("ai_cache").doc(key).set({
      response,
      createdAt: Date.now(),
    });
  } catch (err) {
    console.warn("[ai-cache] write failed:", err instanceof Error ? err.message : err);
  }
}
