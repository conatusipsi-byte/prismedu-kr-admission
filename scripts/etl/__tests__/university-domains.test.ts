/**
 * 대학 도메인 맵 + 로고 URL 헬퍼 회귀 (2026-06-01).
 *
 * 검증:
 *   - universityLogoUrl: faviconV2 형식(도메인 임베드·size·fallback_opts)
 *   - universityHomepageUrl: https://{domain}
 *   - UNIVERSITY_DOMAINS: 도메인 형식·중복 없음·주요교 정확·충분한 규모
 */

import { describe, it, expect } from "vitest";
import {
  UNIVERSITY_DOMAINS,
  universityLogoUrl,
  universityHomepageUrl,
} from "@/scripts/etl/university-domains";

describe("universityLogoUrl — faviconV2", () => {
  it("도메인을 임베드한 faviconV2 URL (fallback_opts·size 포함)", () => {
    const u = universityLogoUrl("snu.ac.kr");
    expect(u).toContain("t2.gstatic.com/faviconV2");
    expect(u).toContain("url=https://snu.ac.kr");
    expect(u).toContain("size=128");
    expect(u).toContain("fallback_opts="); // 없으면 전부 404 (실측) — 필수
  });

  it("www. 호스트도 그대로 임베드", () => {
    expect(universityLogoUrl("www.skku.edu")).toContain("url=https://www.skku.edu");
  });
});

describe("universityHomepageUrl", () => {
  it("https://{domain}", () => {
    expect(universityHomepageUrl("kaist.ac.kr")).toBe("https://kaist.ac.kr");
  });
});

describe("UNIVERSITY_DOMAINS 무결성", () => {
  const entries = Object.entries(UNIVERSITY_DOMAINS);

  it("주요 SKY·과기원 도메인 정확", () => {
    expect(UNIVERSITY_DOMAINS.snu).toBe("snu.ac.kr");
    expect(UNIVERSITY_DOMAINS.yonsei).toBe("yonsei.ac.kr");
    expect(UNIVERSITY_DOMAINS.korea).toBe("korea.ac.kr");
    expect(UNIVERSITY_DOMAINS.sungkyunkwan).toBe("skku.edu");
    expect(UNIVERSITY_DOMAINS.kaist).toBe("kaist.ac.kr");
  });

  it("모든 도메인이 점(.) 포함 + 공백 없음 (형식)", () => {
    for (const [id, domain] of entries) {
      expect(domain.length, id).toBeGreaterThan(3);
      expect(domain, id).toContain(".");
      expect(domain, id).not.toMatch(/\s/);
      expect(domain, id).not.toMatch(/^https?:/); // 도메인만 (URL 아님)
    }
  });

  it("도메인 중복 없음 (한 도메인이 두 학교에 매핑되지 않음)", () => {
    const domains = entries.map(([, d]) => d);
    expect(new Set(domains).size).toBe(domains.length);
  });

  it("충분한 규모 (주요교 우선 — 최소 50교)", () => {
    expect(entries.length).toBeGreaterThanOrEqual(50);
  });
});
