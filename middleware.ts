import { NextRequest, NextResponse } from "next/server";

/**
 * Edge runtime middleware
 *
 * 책임:
 *   1. 비-canonical 호스트의 SEO 차단 (X-Robots-Tag noindex)
 *   2. /admin/* 빠른 가드 — 세션 쿠키 부재 시 홈으로 redirect.
 *      실 master 검증은 `app/admin/layout.tsx` (Node, server component).
 *   3. 보호 라우트 가드 (Day 11) — /analysis·/payment·/orders·/chat 진입 시
 *      세션 쿠키 부재면 /login?returnUrl=...로 redirect.
 *
 * Edge에서 firebase-admin은 사용 불가 → 본 파일은 쿠키 **존재**만 검사.
 */

const CANONICAL_HOST = "prismedu.kr";

// `lib/api-auth.ts`의 SESSION_COOKIE_NAME과 정확히 일치
export const SESSION_COOKIE_NAME = "__session";

const ADMIN_REDIRECT_PATH = "/";
const ADMIN_REDIRECT_QUERY = "reason=admin_login_required";

/**
 * 인증 필수 라우트 — 미인증 진입 시 /login?returnUrl=... 으로 보냄.
 *
 * /analysis(폼·결과)·/payment(결제)·/orders(이력)·/chat(카운슬러)·/profile(프로필).
 * /admissions, /, /login, /payment/success·fail은 비인증 접근 가능 (또는 별도 처리).
 *
 * /analysis 폼 자체는 비인증도 작성 가능했으나 (정직성 — 입력 전에 동기 부여),
 * 결과 저장·매칭이 인증 필요라 폼 진입 시점에 미리 안내하는 게 UX 더 좋음.
 */
const PROTECTED_PATH_PREFIXES = [
  "/analysis",
  "/payment",
  "/orders",
  "/chat",
  "/profile",
] as const;

const LOGIN_PATH = "/login";

function isProtectedPath(pathname: string): boolean {
  // /payment/success, /payment/fail 은 결제 콜백 페이지라 비인증 접근 OK
  // (서버에서 confirm 시 본인 검증함)
  if (pathname === "/payment/success" || pathname === "/payment/fail") return false;
  return PROTECTED_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = req.cookies.get(SESSION_COOKIE_NAME)?.value;

  // /admin/* 가드
  if (pathname.startsWith("/admin")) {
    if (!hasSession) {
      const url = req.nextUrl.clone();
      url.pathname = ADMIN_REDIRECT_PATH;
      url.search = `?${ADMIN_REDIRECT_QUERY}`;
      return NextResponse.redirect(url);
    }
  }

  // 보호 라우트 가드 — /login으로 returnUrl과 함께 redirect
  if (isProtectedPath(pathname) && !hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = LOGIN_PATH;
    // returnUrl은 pathname + search (현재 쿼리스트링 보존)
    const returnTo = pathname + (req.nextUrl.search || "");
    url.search = `?returnUrl=${encodeURIComponent(returnTo)}`;
    return NextResponse.redirect(url);
  }

  const host = req.headers.get("host") || "";
  const res = NextResponse.next();
  if (host !== CANONICAL_HOST && host !== `www.${CANONICAL_HOST}`) {
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return res;
}

export const config = {
  matcher: [
    // API와 정적 자산 제외 — HTML 페이지만 대상 (admin 가드 + canonical 호스트 noindex)
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt|xml|json|js|css)$).*)",
  ],
};
