/**
 * 날짜 헬퍼 — planner/dashboard/essays에서 중복 정의되던 함수들 통합.
 */

/** ISO date 문자열 → "MM월 DD일" 한국어 표시 */
export function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr.includes("T") ? dateStr : dateStr + "T00:00:00");
    return d.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
  } catch { return dateStr; }
}

/** 오늘 기준 D-day 계산. 음수 = 지난 일자, 0 = 오늘, 양수 = 남은 일수 */
export function getDDay(dateStr: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(dateStr.includes("T") ? dateStr : dateStr + "T00:00:00");
  if (isNaN(target.getTime())) return 0;
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

/** YYYY-MM-DD (UTC) — 일자 비교용 */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
