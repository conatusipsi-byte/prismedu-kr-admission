/**
 * 동적 sitemap.xml — Next.js 가 자동으로 /sitemap.xml 라우트 생성.
 *
 * 정직성 / 색인 정책:
 *   - 비로그인 SEO 가능한 페이지만 포함 (랜딩·학과·법무·고객센터)
 *   - 인증 필요 페이지(/dashboard, /analysis, /onboarding 등)는 robots.ts 와 페이지
 *     metadata.robots: noindex 로 색인 차단
 *   - 학과 상세 페이지(/admissions/[uni]/[dept]) 는 데이터가 시즌 진입 후 1,000여
 *     학과 시드되면 그 시점에 동적 추가 (Tier 4)
 *
 * 우선순위:
 *   - 랜딩(/) priority 1.0 — 사이트 진입점
 *   - /admissions /pricing 0.8 — 핵심 SEO 타겟
 *   - 법무·고객센터 0.5 — 보조
 */

import type { MetadataRoute } from "next";

const BASE_URL = "https://conatusipsi.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    {
      url: `${BASE_URL}/`,
      lastModified,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/admissions`,
      lastModified,
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/admissions/jaeoegukmin`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${BASE_URL}/pricing`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/help`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${BASE_URL}/privacy`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${BASE_URL}/terms`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${BASE_URL}/refund`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
