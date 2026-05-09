/**
 * 미국 대학 합격 결과 발표 시즌 판정.
 *
 * 12월~4월: ED/EA → RD 결과가 순차 발표되는 기간.
 * 5월~11월: 발표가 거의 없는 비시즌 → "이번 주 합격" 같은
 * 시즌 한정 카피는 노출하지 않는다(허수 인상 방지).
 *
 * 주의: dashboard에 `currentMonth >= 3 && currentMonth <= 5`로 정의된
 * 별개의 시즌 상수가 있는데, 그쪽은 12학년 commitment 윈도우(Mar-May)이며
 * 의미가 다르므로 분리 유지.
 */
export function isAdmissionSeason(date: Date = new Date()): boolean {
  const month = date.getMonth() + 1; // 1-12
  return month >= 12 || month <= 4;
}
