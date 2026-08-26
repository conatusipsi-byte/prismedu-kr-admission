/**
 * LoginView 에러 메시지 한국어 변환 회귀.
 *
 * 배경:
 *   2026-05-28 카카오 OAuth 실패 시 "인증 링크가 만료됐거나 잘못됐어요" 라는
 *   엉뚱한 메시지가 노출되던 사건이 있었음. /auth/callback 라우트 수정으로
 *   provider 에러가 그대로 ?error= 로 전달되면서 humanizeAuthError 가 OAuth
 *   에러 패턴을 인식해야 함. 본 테스트는 URL ?error=... 가 의도한 한국어로
 *   변환되는지 검증.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

let currentSearch = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => currentSearch,
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: null,
    profile: null,
    loading: false,
    isMaster: false,
    loginWithKakao: vi.fn(),
    loginWithGoogle: vi.fn(),
    loginWithEmail: vi.fn(),
    signUpWithEmail: vi.fn(),
    resetPassword: vi.fn(),
    loginWithApple: vi.fn(),
    logout: vi.fn(),
    saveProfile: vi.fn(),
    snapshots: [],
    toggleFavorite: vi.fn(),
    isFavorite: () => false,
  }),
}));

vi.mock("@/lib/api-client", () => ({
  fetchWithAuth: vi.fn().mockResolvedValue({}),
}));

/*
 * 모듈 로드는 테스트 본문이 아니라 **파일 import 단계**에서 1회만 수행한다.
 *   - 기존엔 각 it() 안에서 `await import(...)` 했는데, 첫 테스트가 모듈 그래프 전체의
 *     콜드 트랜스폼(측정 ~5.9s)을 떠안아 testTimeout 5000ms 를 넘겼다.
 *   - 더 나쁜 건 연쇄 오염: 타임아웃된 test 본문은 중단되지 않고 계속 실행돼
 *     cleanup 이후에 render() 가 뒤늦게 실행 → 다음 테스트에서 "Found multiple elements".
 *   - top-level await 로 옮기면 로드 비용이 testTimeout 대상에서 빠지고 고아 렌더도 사라진다.
 *   - vi.mock 은 트랜스폼 단계에서 이 위로 hoist 되므로 모킹은 그대로 적용된다.
 */
const { LoginView } = await import("../LoginView");

async function renderWithError(errorParam: string): Promise<string> {
  currentSearch = new URLSearchParams({ error: errorParam });
  render(<LoginView />);
  await waitFor(() => {
    expect(screen.getByTestId("login-error")).toBeInTheDocument();
  });
  return screen.getByTestId("login-error").textContent ?? "";
}

describe("URL ?error= 한국어 변환", () => {
  beforeEach(() => {
    currentSearch = new URLSearchParams();
  });

  it("카카오/OAuth 가 이메일 미반환 → '이메일을 가져오지 못했어요' 안내", async () => {
    const text = await renderWithError(
      "Error getting user email from external provider",
    );
    expect(text).toContain("이메일을 가져오지 못했어요");
  });

  it("access_denied (사용자 동의 취소) → 친화 안내", async () => {
    const text = await renderWithError("access_denied");
    expect(text).toContain("동의를 취소");
  });

  it("server_error → 일시적 오류 안내", async () => {
    const text = await renderWithError("server_error");
    expect(text).toContain("일시적");
  });

  it("missing_code_or_token → 인증 링크 만료 안내 (이메일 confirm 경로 보존)", async () => {
    const text = await renderWithError("missing_code_or_token");
    expect(text).toContain("인증 링크");
  });
});
