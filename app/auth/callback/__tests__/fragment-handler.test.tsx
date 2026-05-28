/**
 * CallbackFragmentHandler — URL `#` fragment 처리 회귀.
 *
 *   - `#error_description=...` → /login?error=<desc> 즉시 redirect
 *   - `#error=access_denied` 단독 → /login?error=access_denied
 *   - hash 비어있고 SIGNED_IN 안 오면 5초 후 /login?error=missing_code_or_token
 *   - SIGNED_IN 도착 시 nextPath 로 이동
 *
 * 사건 배경:
 *   Supabase 가 카카오 OAuth 거절을 fragment 에 박아 보내는데 (`#error=server_error
 *   &error_description=Unable+to+exchange+external+code`), 서버는 fragment 를
 *   못 보므로 missing_code_or_token 으로 폴백돼 "인증 링크 만료" 가 노출됐었음.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor, act } from "@testing-library/react";

const { mockReplace, mockOnAuthStateChange } = vi.hoisted(() => ({
  mockReplace: vi.fn(),
  mockOnAuthStateChange: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: vi.fn() }),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: (event: string) => void) => {
        mockOnAuthStateChange(cb);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
  },
}));

import { CallbackFragmentHandler } from "../CallbackFragmentHandler";

describe("CallbackFragmentHandler", () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockOnAuthStateChange.mockClear();
    window.location.hash = "";
  });

  it("#error_description=... → /login?error=<desc> 즉시 redirect", async () => {
    window.location.hash =
      "#error=server_error&error_description=Unable+to+exchange+external+code";
    render(<CallbackFragmentHandler nextPath="/dashboard" />);
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(
        `/login?error=${encodeURIComponent("Unable to exchange external code")}`,
      );
    });
  });

  it("#error=access_denied (description 없음) → /login?error=access_denied", async () => {
    window.location.hash = "#error=access_denied";
    render(<CallbackFragmentHandler nextPath="/dashboard" />);
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(
        `/login?error=${encodeURIComponent("access_denied")}`,
      );
    });
  });

  it("hash 비어있고 5초 동안 SIGNED_IN 없으면 /login?error=missing_code_or_token", async () => {
    vi.useFakeTimers();
    try {
      window.location.hash = "";
      render(<CallbackFragmentHandler nextPath="/dashboard" />);
      await act(async () => {
        vi.advanceTimersByTime(5000);
      });
      expect(mockReplace).toHaveBeenCalledWith("/login?error=missing_code_or_token");
    } finally {
      vi.useRealTimers();
    }
  });

  it("SIGNED_IN 이벤트 도착 시 nextPath 로 이동", async () => {
    window.location.hash = "";
    render(<CallbackFragmentHandler nextPath="/profile" />);
    const cb = mockOnAuthStateChange.mock.calls[0]?.[0];
    expect(typeof cb).toBe("function");
    await act(async () => {
      cb?.("SIGNED_IN");
    });
    expect(mockReplace).toHaveBeenCalledWith("/profile");
  });
});
