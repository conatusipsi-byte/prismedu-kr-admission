/**
 * /api/match 응답 클라이언트 캐시.
 *
 * matchSchools는 specs(+plan)에 대해 결정적이므로 같은 입력에 대한 재호출은
 * 서버 CPU(200개 학교 스코어링) + Firestore plan 조회를 낭비함.
 *
 * 전략:
 *  - module-level Map(uid → key → response)으로 메모리 캐시.
 *  - key는 specs를 정렬된 JSON으로 직렬화한 hash.
 *  - sessionStorage에도 저장해 페이지 새로고침 시 즉시 복원.
 *  - TTL 10분 — plan 변경/스펙 입력 변동에 대해 약간 보수적.
 *
 * uid 차원으로 분리해 다중 계정 로그인 시 교차 노출을 방지.
 */
import type { School } from "@/lib/matching";

export interface MatchResponse {
  results: School[];
  plan?: string;
  totalAvailable?: number;
  lockedCount?: number;
}

interface CacheEntry {
  ts: number;
  data: MatchResponse;
}

const TTL_MS = 10 * 60 * 1000;
const memCache = new Map<string, CacheEntry>();

function buildKey(uid: string, specs: unknown): string {
  // JSON.stringify with sorted keys → 같은 입력이면 같은 문자열.
  const canonical = JSON.stringify(specs, Object.keys(specs as object).sort());
  return `${uid}::${canonical}`;
}

const SS_PREFIX = "prism_match_v1::";

function readSession(key: string): CacheEntry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SS_PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry;
    if (!entry || typeof entry.ts !== "number") return null;
    return entry;
  } catch {
    return null;
  }
}

function writeSession(key: string, entry: CacheEntry): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SS_PREFIX + key, JSON.stringify(entry));
  } catch {
    /* quota / private mode */
  }
}

export function getCachedMatch(uid: string, specs: unknown): MatchResponse | null {
  const key = buildKey(uid, specs);
  const now = Date.now();
  const mem = memCache.get(key);
  if (mem && now - mem.ts < TTL_MS) return mem.data;
  const ss = readSession(key);
  if (ss && now - ss.ts < TTL_MS) {
    memCache.set(key, ss);
    return ss.data;
  }
  return null;
}

export function setCachedMatch(uid: string, specs: unknown, data: MatchResponse): void {
  const key = buildKey(uid, specs);
  const entry: CacheEntry = { ts: Date.now(), data };
  memCache.set(key, entry);
  writeSession(key, entry);
}

/** plan 변경/로그아웃 등 캐시 무효화가 필요할 때 호출. */
export function clearMatchCache(uid?: string): void {
  if (!uid) {
    memCache.clear();
    if (typeof window !== "undefined") {
      try {
        const ss = window.sessionStorage;
        const keys: string[] = [];
        for (let i = 0; i < ss.length; i++) {
          const k = ss.key(i);
          if (k && k.startsWith(SS_PREFIX)) keys.push(k);
        }
        keys.forEach((k) => ss.removeItem(k));
      } catch { /* ignore */ }
    }
    return;
  }
  const prefix = `${uid}::`;
  for (const k of Array.from(memCache.keys())) {
    if (k.startsWith(prefix)) memCache.delete(k);
  }
  if (typeof window !== "undefined") {
    try {
      const ss = window.sessionStorage;
      const keys: string[] = [];
      for (let i = 0; i < ss.length; i++) {
        const k = ss.key(i);
        if (k && k.startsWith(SS_PREFIX + prefix)) keys.push(k);
      }
      keys.forEach((k) => ss.removeItem(k));
    } catch { /* ignore */ }
  }
}
