/**
 * IA 재구성(현황·도구 탭 신설) 후 기존 사용자에게 한 번 알리는 nudge.
 * localStorage 1키에 ISO timestamp를 저장 — 7일 TTL.
 *
 * 호출처: dashboard 첫 방문 시 toast / insights·tools 첫 방문 시 banner.
 * 배너 dismiss 또는 toast 자동 종료 시 mark()로 표시.
 */
const KEY = "seen_ia_migration_nudge";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function shouldShowMigrationNudge(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return true;
    const ts = parseInt(raw, 10);
    if (!Number.isFinite(ts)) return true;
    return Date.now() - ts > TTL_MS;
  } catch {
    return false;
  }
}

export function markMigrationNudgeSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* private mode 등 — 조용히 무시 */
  }
}
