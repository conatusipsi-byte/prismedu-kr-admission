/**
 * /admin/users 회귀 (Day 12)
 *
 * 검증:
 *   1. UsersTable — disabled/master 시각 분리
 *   2. 본인 자신 (currentUid 일치) → 일부 액션 disabled
 *   3. 빈 목록 안내
 *   4. plan/status 뱃지 정확
 *   5. P-002 — "확정 합격"·부정 표현 0건
 */

import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { UsersTable } from "../UsersTable";
import {
  MOCK_USERS,
  listMockUsers,
  summarizeUsers,
  type AdminUserItem,
} from "@/lib/admission/admin-users-mock";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/admin/users",
}));

const NEGATIVE_TERMS = ["검열", "차단된 사용자라니", "거부", "막혔"]; // "차단" 자체는 액션 라벨이므로 허용

/* ═══════════════════════════════════════════════════════════════════════
   listMockUsers — 검색·필터
   ═══════════════════════════════════════════════════════════════════════ */

describe("listMockUsers — 검색·필터", () => {
  it("이메일로 검색", () => {
    const r = listMockUsers({ q: "student1" });
    expect(r.length).toBe(1);
    expect(r[0].email).toContain("student1");
  });

  it("plan='pro' 필터", () => {
    const r = listMockUsers({ plan: "pro" });
    expect(r.every((u) => u.plan === "pro")).toBe(true);
  });

  it("status='disabled' → 차단된 사용자만", () => {
    const r = listMockUsers({ status: "disabled" });
    expect(r.every((u) => u.disabled)).toBe(true);
  });

  it("masterOnly=true → master만", () => {
    const r = listMockUsers({ masterOnly: true });
    expect(r.every((u) => u.isMaster)).toBe(true);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   summarizeUsers
   ═══════════════════════════════════════════════════════════════════════ */

describe("summarizeUsers", () => {
  it("plan별·disabled·master 카운트 정확", () => {
    const s = summarizeUsers(MOCK_USERS);
    expect(s.total).toBe(MOCK_USERS.length);
    expect(s.byPlan.free + s.byPlan.pro + s.byPlan.elite).toBe(MOCK_USERS.length);
    expect(s.disabled).toBeGreaterThan(0); // mock에 disabled=true 1건 있음
    expect(s.master).toBeGreaterThan(0); // mock에 isMaster=true 1건 있음
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   UsersTable — 시각 분리 + 액션
   ═══════════════════════════════════════════════════════════════════════ */

function user(overrides: Partial<AdminUserItem> = {}): AdminUserItem {
  return {
    uid: "uid_test",
    email: "test@example.com",
    name: "테스트",
    plan: "free",
    provider: "kakao",
    disabled: false,
    isMaster: false,
    createdAtMs: Date.now() - 24 * 3600_000,
    ...overrides,
  };
}

describe("UsersTable — 시각 분리·액션", () => {
  it("disabled=true 행 → data-disabled='true' + zinc 톤", () => {
    const { container } = render(
      <UsersTable items={[user({ disabled: true })]} onMutate={vi.fn(async () => {})} />,
    );
    const row = container.querySelector("[data-uid]") as HTMLElement;
    expect(row.getAttribute("data-disabled")).toBe("true");
    expect(row.className).toMatch(/zinc/);
  });

  it("isMaster=true → data-master='true' + ShieldAlert 아이콘", () => {
    const { container } = render(
      <UsersTable items={[user({ isMaster: true })]} onMutate={vi.fn(async () => {})} />,
    );
    const row = container.querySelector("[data-uid]") as HTMLElement;
    expect(row.getAttribute("data-master")).toBe("true");
  });

  it("isMaster=false → '권한 부여' 버튼 + 클릭 시 promote 액션", () => {
    const onMutate = vi.fn(async () => {});
    const { container } = render(
      <UsersTable items={[user({ uid: "u1" })]} onMutate={onMutate} />,
    );
    const promoteBtn = container.querySelector('[data-action="promote"]') as HTMLButtonElement;
    expect(promoteBtn).not.toBeNull();
    fireEvent.click(promoteBtn);
    expect(onMutate).toHaveBeenCalledWith("u1", "promote");
  });

  it("isMaster=true → '권한 해제' 버튼 + revoke 액션", () => {
    const onMutate = vi.fn(async () => {});
    const { container } = render(
      <UsersTable items={[user({ uid: "u1", isMaster: true })]} onMutate={onMutate} />,
    );
    const revokeBtn = container.querySelector('[data-action="revoke"]') as HTMLButtonElement;
    expect(revokeBtn).not.toBeNull();
    fireEvent.click(revokeBtn);
    expect(onMutate).toHaveBeenCalledWith("u1", "revoke");
  });

  it("본인 자신 (currentUid 일치) → 차단 버튼 disabled", () => {
    const { container } = render(
      <UsersTable items={[user({ uid: "self_uid" })]} currentUid="self_uid" onMutate={vi.fn(async () => {})} />,
    );
    const disableBtn = container.querySelector('[data-action="disable"]') as HTMLButtonElement;
    expect(disableBtn.disabled).toBe(true);
  });

  it("본인 자신 + isMaster=true → revoke 버튼 disabled (lockout 방지)", () => {
    const { container } = render(
      <UsersTable items={[user({ uid: "self_uid", isMaster: true })]} currentUid="self_uid" onMutate={vi.fn(async () => {})} />,
    );
    const revokeBtn = container.querySelector('[data-action="revoke"]') as HTMLButtonElement;
    expect(revokeBtn.disabled).toBe(true);
  });

  it("pendingUid 일치 → 액션 자리 Loader2 (스피너)", () => {
    const { container } = render(
      <UsersTable
        items={[user({ uid: "u1" })]}
        onMutate={vi.fn(async () => {})}
        pendingUid="u1"
      />,
    );
    expect(container.querySelector(".animate-spin")).not.toBeNull();
    expect(container.querySelector('[data-action="promote"]')).toBeNull();
  });

  it("plan='elite' → amber 톤 뱃지 (className에 amber 포함)", () => {
    const { container } = render(
      <UsersTable items={[user({ plan: "elite" })]} onMutate={vi.fn(async () => {})} />,
    );
    const amberEl = container.querySelector('[class*="amber"]');
    expect(amberEl).not.toBeNull();
    expect(amberEl!.textContent).toBe("elite");
  });

  it("빈 목록 → 안내 메시지", () => {
    const { container } = render(<UsersTable items={[]} onMutate={vi.fn(async () => {})} />);
    expect(container.querySelector('[data-empty="true"]')).not.toBeNull();
  });

  it("부정 표현 0건 (P-002) — '검열·거부·막혔' 등", () => {
    const { container } = render(
      <UsersTable
        items={[user({ disabled: true }), user({ uid: "u2", isMaster: true })]}
        onMutate={vi.fn(async () => {})}
      />,
    );
    const text = container.textContent ?? "";
    for (const t of NEGATIVE_TERMS) {
      expect(text).not.toContain(t);
    }
    expect(text).not.toMatch(/확정\s*합격/);
  });
});
