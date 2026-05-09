/**
 * localStorage·sessionStorage 안전 헬퍼.
 *
 * 모든 호출은 try/catch로 감싸 SSR·private mode·quota 초과에서 안전하게 fallback.
 * 이전엔 페이지마다 inline `try { localStorage.* } catch {}` 패턴이 30+회 반복됨.
 */

type Storage = "local" | "session";

function pick(kind: Storage): globalThis.Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch { return null; }
}

/** Read a string value. Returns null if missing or storage unavailable. */
export function readString(key: string, kind: Storage = "local"): string | null {
  const s = pick(kind);
  if (!s) return null;
  try { return s.getItem(key); } catch { return null; }
}

/**
 * Read JSON-parsed value. Returns null on missing/invalid/unavailable.
 *
 * Corrupted-JSON은 드물지만 디버깅 단서가 되므로 console.warn으로 남김.
 * (missing 과 corrupt 를 구분 — missing은 조용히 null).
 */
export function readJSON<T = unknown>(key: string, kind: Storage = "local"): T | null {
  const raw = readString(key, kind);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    console.warn(`[storage] corrupted JSON for "${key}" — clearing`, err);
    removeKey(key, kind);
    return null;
  }
}

/**
 * Quota 초과·private mode 등으로 write가 실패하면 custom event 발행.
 * 상위 레이어(레이아웃 배너 등)가 구독해 사용자에게 노출 가능.
 * Silent drop이 반복되면 데이터 손실을 사용자가 인지 못 하는 문제를 해소.
 */
const quotaNotifiedKeys = new Set<string>();
function notifyQuotaError(key: string) {
  if (typeof window === "undefined") return;
  if (quotaNotifiedKeys.has(key)) return; // 동일 키에 대한 spam 방지
  quotaNotifiedKeys.add(key);
  try {
    window.dispatchEvent(new CustomEvent("prism:storage-quota", { detail: { key } }));
  } catch { /* ignore */ }
}

/** Write a string. Write 실패 시 quota event 발행. */
export function writeString(key: string, value: string, kind: Storage = "local"): void {
  const s = pick(kind);
  if (!s) return;
  try {
    s.setItem(key, value);
    quotaNotifiedKeys.delete(key); // 성공하면 다음 실패 시 다시 알림
  } catch (err) {
    console.warn(`[storage] write failed for "${key}":`, err);
    notifyQuotaError(key);
  }
}

/** Write JSON-stringified value. Best-effort. */
export function writeJSON(key: string, value: unknown, kind: Storage = "local"): void {
  try { writeString(key, JSON.stringify(value), kind); } catch { /* circular ref */ }
}

/** Remove a key. Best-effort. */
export function removeKey(key: string, kind: Storage = "local"): void {
  const s = pick(kind);
  if (!s) return;
  try { s.removeItem(key); } catch { /* ignore */ }
}
