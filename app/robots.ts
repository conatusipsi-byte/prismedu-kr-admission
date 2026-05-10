/**
 * /robots.txt — Next.js 가 자동으로 라우트 생성.
 *
 * 정책:
 *   - 공개 페이지는 색인 허용
 *   - 인증 필요 페이지·관리자·API·결제 콜백은 색인 차단
 *   - sitemap.xml 위치 명시 (검색엔진 자동 발견)
 *
 * 비-canonical 호스트(staging vercel URL 등)에선 middleware 가 X-Robots-Tag
 * noindex 헤더를 추가로 부착 — 본 robots.txt 는 canonical 호스트 기준.
 */

import type { MetadataRoute } from "next";

const BASE_URL = "https://conatusipsi.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/"],
        disallow: [
          "/api/",
          "/admin/",
          "/dashboard",
          "/onboarding",
          "/analysis",
          "/analysis/",
          "/chat",
          "/profile",
          "/orders",
          "/payment",
          "/payment/",
          "/login",
          "/compare",
          "/what-if",
          "/planner",
          "/spec-analysis",
        ],
      },
      // AI 학습용 크롤러는 명시적 차단 (선택 — 사용자 데이터 보호)
      {
        userAgent: "GPTBot",
        disallow: "/",
      },
      {
        userAgent: "ClaudeBot",
        disallow: "/",
      },
      {
        userAgent: "anthropic-ai",
        disallow: "/",
      },
      {
        userAgent: "CCBot",
        disallow: "/",
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
