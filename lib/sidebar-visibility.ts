/**
 * 데스크톱 사이드바 표시 여부 — DesktopSidebar와 AppShell의 lg:pl-64 분기를 단일 소스로.
 *
 * 정책:
 *  1) 인증 미해결(loading) 또는 비로그인 → 숨김. 비로그인 상태에서 사이드바 +
 *     좌측 256px padding을 적용하면 빈 띠로 보임 (Landing/공개 페이지 핫픽스).
 *  2) 공개·전용 라우트(/, /onboarding, /parent-view/*)는 로그인 여부와 무관하게 숨김.
 *  3) 그 외(인증 필요 라우트) + 로그인 상태 → 표시.
 */
export function shouldShowSidebar(
  pathname: string,
  isAuthenticated: boolean,
  authLoading: boolean,
): boolean {
  if (authLoading || !isAuthenticated) return false;
  if (pathname === "/" || pathname === "/onboarding") return false;
  if (pathname.startsWith("/parent-view/")) return false;
  return true;
}
