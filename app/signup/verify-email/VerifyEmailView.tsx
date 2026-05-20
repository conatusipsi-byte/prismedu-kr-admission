"use client";

/**
 * VerifyEmailView — "메일함을 확인해주세요" 안내 + 재발송.
 *
 * 정책:
 *   - email 쿼리는 안내용으로만 사용 (없으면 일반 문구)
 *   - 재발송은 supabase.auth.resend({ type: 'signup' }) 호출
 *   - 인증 완료는 메일 링크 클릭 → /auth/callback → "/" 로 처리되므로
 *     이 페이지에선 별도 polling 하지 않음
 */

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2, Mail, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";

export function VerifyEmailView(): React.ReactElement {
  const params = useSearchParams();
  const email = params.get("email") ?? "";

  const [resending, setResending] = React.useState(false);
  const [resentAt, setResentAt] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function handleResend() {
    if (!email) {
      setError("이메일 정보가 없어요. 다시 가입 페이지에서 시도해주세요.");
      return;
    }
    setError(null);
    setResending(true);
    try {
      const { error: err } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/` },
      });
      if (err) throw err;
      setResentAt(Date.now());
    } catch (e) {
      const msg = (e as Error).message;
      if (/rate limit|too many|For security purposes/i.test(msg)) {
        setError("재발송 요청이 너무 잦아요. 잠시 후 다시 시도해주세요.");
      } else {
        setError(`재발송에 실패했어요. (${msg.slice(0, 80)})`);
      }
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 rounded-2xl border bg-card p-6 shadow-sm md:p-8">
      <header className="flex flex-col items-center gap-3 text-center">
        <div className="rounded-full bg-brand-50 p-3 text-brand-600 dark:bg-brand-950/50 dark:text-brand-300">
          <Mail className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-bold">인증 메일을 보냈어요</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {email ? (
            <>
              <span className="font-medium text-foreground">{email}</span> 로 인증 메일이 발송됐어요.
            </>
          ) : (
            "입력하신 이메일로 인증 메일이 발송됐어요."
          )}
        </p>
      </header>

      <div className="rounded-lg border border-brand-300/60 bg-brand-50/50 p-4 text-sm text-brand-900 dark:border-brand-800 dark:bg-brand-950/40 dark:text-brand-100">
        <ol className="flex list-decimal flex-col gap-1.5 pl-4 text-xs leading-relaxed">
          <li>받은 메일함에서 <strong>Conatus 인증 메일</strong>을 열어주세요.</li>
          <li>메일 안의 <strong>확인 링크</strong>를 클릭하면 가입이 완료돼요.</li>
          <li>자동으로 메인 페이지로 이동됩니다.</li>
        </ol>
        <p className="mt-3 text-2xs text-brand-700/80 dark:text-brand-300/80">
          메일이 안 보이면 <strong>스팸함</strong>도 확인해주세요.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive"
        >
          {error}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={handleResend}
          disabled={resending || !email}
          data-testid="resend-confirm-email"
        >
          {resending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          인증 메일 다시 보내기
        </Button>
        {resentAt && !error && (
          <p className="text-center text-2xs text-brand-700 dark:text-brand-300">
            메일을 다시 보냈어요. 잠시만 기다려주세요.
          </p>
        )}
      </div>

      <div className="flex items-center justify-center gap-3 text-2xs text-muted-foreground">
        <Link href="/signup" className="underline-offset-2 hover:underline">
          다른 이메일로 가입
        </Link>
        <span className="text-border">·</span>
        <Link href="/login" className="underline-offset-2 hover:underline">
          이미 인증을 완료했어요
        </Link>
      </div>
    </div>
  );
}
