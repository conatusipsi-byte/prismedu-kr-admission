/**
 * adminPageMetadata 회귀 (BUG-018, 2026-05-25).
 *
 * 검증:
 *   - master 사용자 → 실제 title 반환
 *   - 비-master 사용자 → 404 위장 metadata 반환
 *   - auth 검증 예외 (throw) → 안전 방향 (위장)
 *   - 위장 metadata 는 root not-found.tsx 와 정확히 일치
 *   - robots index/follow 모두 false
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const requireMasterAuthFromHeadersMock = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api-auth", () => ({
  requireMasterAuthFromHeaders: () => requireMasterAuthFromHeadersMock(),
}));

beforeEach(() => {
  requireMasterAuthFromHeadersMock.mockReset();
});

describe("adminPageMetadata (BUG-018)", () => {
  it("master 사용자 → 실제 title 반환", async () => {
    requireMasterAuthFromHeadersMock.mockResolvedValue({
      ok: true,
      uid: "admin-1",
      email: "admin@example.com",
      isMaster: true,
    });
    const { adminPageMetadata } = await import("../admin-metadata");
    const meta = await adminPageMetadata("컨설팅 예약 관리 — 운영 콘솔");
    expect(meta.title).toBe("컨설팅 예약 관리 — 운영 콘솔");
    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it("비-master (auth.ok=false) → 404 위장 metadata", async () => {
    requireMasterAuthFromHeadersMock.mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 403 }),
    });
    const { adminPageMetadata } = await import("../admin-metadata");
    const meta = await adminPageMetadata("운영 콘솔");
    // root not-found.tsx 와 정확히 일치
    expect(meta.title).toBe("페이지를 찾을 수 없어요 — Conatus");
    expect(meta.robots).toEqual({ index: false, follow: false });
    // admin title 누설 X
    expect(meta.title).not.toContain("운영");
    expect(meta.title).not.toContain("admin");
  });

  it("auth 검증 throw → 안전 방향 (위장 반환)", async () => {
    requireMasterAuthFromHeadersMock.mockRejectedValue(new Error("DB error"));
    const { adminPageMetadata } = await import("../admin-metadata");
    const meta = await adminPageMetadata("ETL 검수 — admin");
    expect(meta.title).toBe("페이지를 찾을 수 없어요 — Conatus");
    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it("robots noindex/nofollow — 모든 케이스에서 검색 엔진 차단", async () => {
    // master 케이스
    requireMasterAuthFromHeadersMock.mockResolvedValue({ ok: true, uid: "x", isMaster: true });
    const { adminPageMetadata } = await import("../admin-metadata");
    const masterMeta = await adminPageMetadata("X");
    expect(masterMeta.robots).toMatchObject({ index: false, follow: false });

    // 비-master 케이스
    requireMasterAuthFromHeadersMock.mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 403 }),
    });
    const nonMasterMeta = await adminPageMetadata("X");
    expect(nonMasterMeta.robots).toMatchObject({ index: false, follow: false });
  });

  it("위장 title 이 admin 관련 키워드 0건 (정찰 차단)", async () => {
    requireMasterAuthFromHeadersMock.mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 403 }),
    });
    const { adminPageMetadata } = await import("../admin-metadata");
    // 다양한 admin 실제 title 시도 — 모두 위장
    for (const realTitle of [
      "컨설팅 예약 관리 — 운영 콘솔",
      "주문 관리 — Conatus 운영",
      "ETL 검수 — admin",
      "표본 집계 — admin",
      "카운슬러 가드 모니터링 — admin",
      "사용자 — admin",
    ]) {
      const meta = await adminPageMetadata(realTitle);
      const title = meta.title as string;
      expect(title.toLowerCase()).not.toContain("admin");
      expect(title).not.toContain("운영");
      expect(title).not.toContain("ETL");
      expect(title).not.toContain("관리");
    }
  });
});
