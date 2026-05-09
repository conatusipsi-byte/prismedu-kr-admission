/**
 * middleware.ts 회귀 테스트
 *
 * 본 파일은 **Edge runtime의 빠른 가드**만 검증한다 — 쿠키 부재 시 redirect,
 * 쿠키 존재 시 통과, 비-canonical 호스트의 noindex 헤더.
 *
 * 실 master 검증(쿠키 무효 / admins doc 부재)은 `lib/__tests__/api-auth-server.test.ts`
 * 가 `requireMasterAuthFromHeaders`로 검증. 두 테스트 합쳐서 사용자 요청 3 케이스
 * (비로그인 / 일반 사용자 / master) 커버.
 */

import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { middleware, SESSION_COOKIE_NAME } from "@/middleware";

function makeReq(
  pathname: string,
  opts: { cookie?: string; host?: string } = {},
): NextRequest {
  const url = new URL(`https://prismedu.kr${pathname}`);
  const headers = new Headers();
  if (opts.host) headers.set("host", opts.host);
  if (opts.cookie) headers.set("cookie", `${SESSION_COOKIE_NAME}=${opts.cookie}`);
  return new NextRequest(url, { headers });
}

/* ═══════════════════════════════════════════════════════════════════════
   1. /admin/* 가드 — 사용자 요청 3 케이스 중 "비로그인"
   ═══════════════════════════════════════════════════════════════════════ */

describe("middleware — /admin/* 쿠키 가드 (비로그인 케이스)", () => {
  it("세션 쿠키 부재 → 홈으로 redirect (302)", () => {
    const res = middleware(makeReq("/admin/sanitize-monitor"));
    expect(res.status).toBe(307); // Next.js redirect = 307
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/?reason=admin_login_required");
  });

  it("세션 쿠키 부재 + 깊은 경로도 동일하게 redirect", () => {
    const res = middleware(makeReq("/admin/users/123/edit"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location") ?? "").toContain("admin_login_required");
  });

  it("/admin 자체 (트레일링 슬래시 없음)도 redirect", () => {
    const res = middleware(makeReq("/admin"));
    expect(res.status).toBe(307);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   2. /admin/* 가드 — 쿠키 존재 (일반 사용자 + master 모두 여기 도달)
   ═══════════════════════════════════════════════════════════════════════ */

describe("middleware — /admin/* 쿠키 존재 시 통과", () => {
  it("__session 쿠키 있으면 redirect 없이 통과 (실 권한은 layout이 검증)", () => {
    const res = middleware(makeReq("/admin/sanitize-monitor", { cookie: "stub-cookie" }));
    // NextResponse.next() — 200 도 아니고 redirect 도 아님. status 미설정.
    expect(res.headers.get("location")).toBeNull();
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   3. /admin 외 경로는 영향받지 않음
   ═══════════════════════════════════════════════════════════════════════ */

describe("middleware — admin 외 경로 통과", () => {
  it("홈 (/) 은 쿠키 부재여도 통과", () => {
    const res = middleware(makeReq("/"));
    expect(res.headers.get("location")).toBeNull();
  });

  it("/admissions 은 쿠키 부재여도 통과", () => {
    const res = middleware(makeReq("/admissions"));
    expect(res.headers.get("location")).toBeNull();
  });

  it("/admin 접두 일치 안 함 (예: /administrator) — 통과", () => {
    // matcher 자체가 admin 만 잡지만, middleware 내부 로직은 startsWith 라
    // /administrator 도 잡힘. 향후 정확 일치로 좁힐 수 있게 회귀 명시:
    const res = middleware(makeReq("/administrator"));
    // 본 PR 단계: startsWith("/admin") 이라 redirect 발생 — 이 동작이 변하면 본 테스트 갱신.
    expect(res.status).toBe(307);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   5. 보호 라우트 가드 (Day 11) — 미인증 사용자 /login redirect
   ═══════════════════════════════════════════════════════════════════════ */

describe("middleware — 보호 라우트 가드", () => {
  it("/analysis (미인증) → /login?returnUrl=/analysis", () => {
    const res = middleware(makeReq("/analysis"));
    expect(res.status).toBe(307);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/login");
    expect(location).toContain("returnUrl=%2Fanalysis");
  });

  it("/analysis/{matchId} (미인증) → /login?returnUrl=...", () => {
    const res = middleware(makeReq("/analysis/match_user_123"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location") ?? "").toContain("returnUrl=%2Fanalysis%2Fmatch_user_123");
  });

  it("/chat?matchId=xxx (미인증) → /login?returnUrl=... (쿼리스트링 보존)", () => {
    const url = new URL("https://prismedu.kr/chat?matchId=match_abc");
    const req = new NextRequest(url, {});
    const res = middleware(req);
    expect(res.status).toBe(307);
    const location = res.headers.get("location") ?? "";
    // returnUrl=/chat?matchId=match_abc 형태로 인코딩됨
    expect(location).toMatch(/returnUrl=%2Fchat/);
    expect(location).toMatch(/matchId%3Dmatch_abc/);
  });

  it("/payment (미인증) → /login redirect", () => {
    const res = middleware(makeReq("/payment"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location") ?? "").toContain("/login");
  });

  it("/orders (미인증) → /login redirect", () => {
    const res = middleware(makeReq("/orders"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location") ?? "").toContain("/login");
  });

  it("보호 라우트 + 세션 쿠키 → redirect 없이 통과", () => {
    const res = middleware(makeReq("/analysis", { cookie: "stub-cookie" }));
    expect(res.headers.get("location")).toBeNull();
  });

  it("/payment/success (결제 콜백) — 미인증도 통과 (서버에서 confirm 시 본인 검증)", () => {
    const res = middleware(makeReq("/payment/success"));
    expect(res.headers.get("location")).toBeNull();
  });

  it("/payment/fail (결제 콜백) — 미인증도 통과", () => {
    const res = middleware(makeReq("/payment/fail"));
    expect(res.headers.get("location")).toBeNull();
  });

  it("/login 자체는 인증 가드 미적용 (무한 루프 차단)", () => {
    const res = middleware(makeReq("/login"));
    expect(res.headers.get("location")).toBeNull();
  });

  it("returnUrl URL 인코딩 안전 — slash·query 모두 인코딩", () => {
    const res = middleware(makeReq("/chat"));
    const location = res.headers.get("location") ?? "";
    // / 는 %2F 로 인코딩, 디코딩 시 /chat 복구
    expect(location).toMatch(/returnUrl=%2Fchat/);
    expect(location).not.toMatch(/returnUrl=\/chat/); // raw / 는 안 됨 (open redirect 차단)
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   4. SEO — 비-canonical 호스트는 X-Robots-Tag noindex
   ═══════════════════════════════════════════════════════════════════════ */

describe("middleware — 비-canonical 호스트 noindex", () => {
  it("prismedu.kr 외 호스트는 X-Robots-Tag 부착", () => {
    const res = middleware(
      makeReq("/admissions", { host: "preview.web.app" }),
    );
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  });

  it("canonical 호스트는 X-Robots-Tag 미부착", () => {
    const res = middleware(makeReq("/admissions", { host: "prismedu.kr" }));
    expect(res.headers.get("X-Robots-Tag")).toBeNull();
  });

  it("www. canonical 호스트도 미부착", () => {
    const res = middleware(makeReq("/admissions", { host: "www.prismedu.kr" }));
    expect(res.headers.get("X-Robots-Tag")).toBeNull();
  });
});
