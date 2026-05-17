"use client";

/**
 * LoginView — 로그인·회원가입 폼 (Client)
 *
 * 흐름:
 *   1. 모드: 로그인 / 회원가입 토글
 *   2. 소셜 로그인: 구글 + 카카오 (한국 시장 우선)
 *   3. 이메일·비밀번호: 로그인 / 회원가입 / 비밀번호 재설정
 *   4. 로그인 성공 → /api/auth/session POST(쿠키 발급) → returnUrl로 redirect
 *
 * 정책:
 *   - returnUrl은 동일 출처만 허용 (open redirect 차단)
 *   - 회원가입 시 약관·개인정보 동의 체크 필수 (출시 직전 약관 페이지 추가 시 활성화)
 *   - Supabase Auth가 비밀번호 강도·이메일 형식 검증
 */

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Mail } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Mode = "login" | "signup";

const KAKAO_YELLOW = "#FEE500";

export function LoginView(): React.ReactElement {
  const auth = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const returnUrlRaw = params.get("returnUrl") ?? "/";

  const [mode, setMode] = React.useState<Mode>("login");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [name, setName] = React.useState("");
  const [agreeTos, setAgreeTos] = React.useState(false);
  const [pending, setPending] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [resetSent, setResetSent] = React.useState(false);

  // 로그인 성공 시 returnUrl로 redirect — open redirect 차단을 위해 동일 출처만 허용
  React.useEffect(() => {
    if (auth.user && !auth.loading) {
      const safe = sanitizeReturnUrl(returnUrlRaw);
      router.replace(safe);
    }
  }, [auth.user, auth.loading, returnUrlRaw, router]);

  async function handle(method: string, fn: () => Promise<void>) {
    setError(null);
    setPending(method);
    try {
      await fn();
      // session 쿠키 발급 — middleware/server component 인증 신호.
      // 실패해도 클라 onAuthStateChanged는 동작 — 다음 호출에서 재시도.
      try {
        const { fetchWithAuth } = await import("@/lib/api-client");
        await fetchWithAuth("/api/auth/session");
      } catch {
        /* 무해 — 다음 부팅에서 재시도 */
      }
    } catch (e) {
      setError(humanizeAuthError((e as Error).message));
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-6 rounded-2xl border bg-card p-6 shadow-sm md:p-8">
      <header className="flex flex-col gap-1 text-center">
        <h1 className="text-2xl font-bold">
          {mode === "login" ? "로그인" : "회원가입"}
        </h1>
        <p className="text-xs text-muted-foreground">
          {mode === "login"
            ? "분석·상담·결제를 이용하려면 로그인이 필요해요."
            : "한국 대학 입시 AI 추천 — 무료로 시작하세요."}
        </p>
      </header>

      {error && (
        <div
          role="alert"
          data-testid="login-error"
          className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive"
        >
          {error}
        </div>
      )}

      {/* 소셜 로그인 — 카카오 우선 (한국 시장) */}
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          disabled={!!pending}
          onClick={() => handle("kakao", auth.loginWithKakao)}
          style={{ backgroundColor: KAKAO_YELLOW, color: "#191919" }}
          className="hover:opacity-90"
          data-testid="login-kakao"
        >
          {pending === "kakao" ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <KakaoIcon />
          )}
          카카오로 {mode === "login" ? "로그인" : "시작하기"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!!pending}
          onClick={() => handle("google", auth.loginWithGoogle)}
          data-testid="login-google"
        >
          {pending === "google" ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <GoogleIcon />
          )}
          Google로 {mode === "login" ? "로그인" : "시작하기"}
        </Button>
      </div>

      {/* 구분선 */}
      <div className="flex items-center gap-3 text-2xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        또는 이메일
        <div className="h-px flex-1 bg-border" />
      </div>

      {/* 이메일 폼 */}
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (mode === "login") {
            void handle("email", () => auth.loginWithEmail(email, password));
          } else {
            if (!agreeTos) {
              setError("약관 동의가 필요해요.");
              return;
            }
            void handle("email-signup", () => auth.signUpWithEmail(email, password, name.trim()));
          }
        }}
      >
        {mode === "signup" && (
          <div className="flex flex-col gap-1">
            <Label htmlFor="login-name" className="text-xs">이름</Label>
            <Input
              id="login-name"
              type="text"
              autoComplete="name"
              required
              minLength={1}
              maxLength={50}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!!pending}
            />
          </div>
        )}
        <div className="flex flex-col gap-1">
          <Label htmlFor="login-email" className="text-xs">이메일</Label>
          <Input
            id="login-email"
            type="email"
            autoComplete={mode === "login" ? "email" : "new-email"}
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={!!pending}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="login-password" className="text-xs">비밀번호</Label>
          <Input
            id="login-password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
            minLength={mode === "signup" ? 8 : 6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={!!pending}
          />
          {mode === "signup" && (
            <p className="text-2xs text-muted-foreground">8자 이상</p>
          )}
        </div>

        {mode === "signup" && (
          <label className="flex items-start gap-2 text-2xs text-muted-foreground">
            <input
              type="checkbox"
              checked={agreeTos}
              onChange={(e) => setAgreeTos(e.target.checked)}
              data-testid="agree-tos"
              className="mt-0.5"
            />
            <span>
              <Link href="/terms" className="underline">서비스 이용약관</Link>과
              {" "}
              <Link href="/privacy" className="underline">개인정보 처리방침</Link>에
              동의합니다.
            </span>
          </label>
        )}

        <Button
          type="submit"
          disabled={!!pending}
          className="bg-brand-600 hover:bg-brand-700"
          data-testid="login-email-submit"
        >
          {pending === "email" || pending === "email-signup" ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Mail className="mr-2 h-4 w-4" />
          )}
          {mode === "login" ? "이메일로 로그인" : "이메일로 가입"}
        </Button>
      </form>

      {/* 비밀번호 재설정 */}
      {mode === "login" && (
        <div className="flex items-center justify-between text-2xs">
          <button
            type="button"
            onClick={async () => {
              if (!email) {
                setError("비밀번호를 재설정할 이메일을 입력해주세요.");
                return;
              }
              setError(null);
              try {
                await auth.resetPassword(email);
                setResetSent(true);
              } catch (e) {
                setError(humanizeAuthError((e as Error).message));
              }
            }}
            className="text-muted-foreground underline-offset-2 hover:underline"
            data-testid="login-reset-password"
          >
            비밀번호를 잊으셨나요?
          </button>
          {resetSent && (
            <span className="text-brand-700">재설정 메일 발송됨</span>
          )}
        </div>
      )}

      {/* 모드 전환 */}
      <div className="text-center text-xs">
        {mode === "login" ? (
          <>
            계정이 없으신가요?{" "}
            <button
              type="button"
              onClick={() => {
                setMode("signup");
                setError(null);
              }}
              className="font-semibold text-brand-700 underline-offset-2 hover:underline"
              data-testid="switch-to-signup"
            >
              회원가입
            </button>
          </>
        ) : (
          <>
            이미 계정이 있으신가요?{" "}
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError(null);
              }}
              className="font-semibold text-brand-700 underline-offset-2 hover:underline"
              data-testid="switch-to-login"
            >
              로그인
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * returnUrl 보안 — 동일 출처(상대 경로 또는 동일 origin) 만 허용.
 * 외부 도메인 redirect는 phishing 위험이라 차단 후 "/" 폴백.
 */
function sanitizeReturnUrl(raw: string): string {
  if (!raw) return "/";
  // 상대 경로 — 안전
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  try {
    const u = new URL(raw, typeof window !== "undefined" ? window.location.origin : "https://conatusipsi.com");
    const here = typeof window !== "undefined" ? window.location.origin : "";
    if (here && u.origin === here) return u.pathname + u.search;
  } catch {
    /* invalid url */
  }
  return "/";
}

/** Supabase Auth 에러 메시지 한국어 친화 변환 */
function humanizeAuthError(msg: string): string {
  // Supabase 메시지
  if (/Invalid login credentials/i.test(msg)) return "이메일 또는 비밀번호가 일치하지 않아요.";
  if (/Email not confirmed/i.test(msg)) return "이메일 인증이 아직 안 됐어요. 받으신 메일의 확인 링크를 눌러주세요.";
  if (/User already registered|already.*registered/i.test(msg)) return "이미 가입된 이메일이에요. 로그인을 시도해주세요.";
  if (/Password should be at least|weak.*password/i.test(msg)) return "비밀번호가 너무 약해요. 8자 이상으로 입력해주세요.";
  if (/Unable to validate email address|invalid.*email/i.test(msg)) return "이메일 형식이 올바르지 않아요.";
  if (/rate limit|too many|For security purposes/i.test(msg)) return "요청이 너무 잦아요. 잠시 후 다시 시도해주세요.";
  if (/User not found|not.*found/i.test(msg)) return "등록된 사용자가 없어요. 회원가입을 먼저 해주세요.";
  if (/signup.*disabled|signups not allowed/i.test(msg)) return "현재 회원가입이 일시 중단됐어요.";
  // 소셜 로그인
  if (/popup.*closed|window.*closed/i.test(msg)) return "로그인 창을 닫으셨어요. 다시 시도해주세요.";
  if (/팝업이 차단/.test(msg)) return msg;
  if (/카카오/.test(msg)) return msg;
  return "로그인에 실패했어요. 잠시 후 다시 시도해주세요.";
}

/* ═══ 아이콘 ═══ */

function KakaoIcon(): React.ReactElement {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="mr-2 h-4 w-4" fill="currentColor">
      <path d="M12 3C6.477 3 2 6.477 2 10.8c0 2.764 1.829 5.196 4.595 6.629L5.4 21.6l4.235-2.4c.776.117 1.567.176 2.365.176 5.523 0 10-3.477 10-7.776C22 6.477 17.523 3 12 3z" />
    </svg>
  );
}

function GoogleIcon(): React.ReactElement {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="mr-2 h-4 w-4">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.46 1.18 4.93l3.66-2.83z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}
