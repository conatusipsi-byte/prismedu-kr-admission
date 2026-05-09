/**
 * /login — 로그인·회원가입 페이지
 *
 * lib/auth-context.tsx의 AuthProvider가 root layout에 mount된 상태 가정.
 * 미인증 사용자가 보호 라우트(/analysis 등)에 접근하면 middleware가
 * /login?returnUrl=...로 redirect → 로그인 후 returnUrl로 복귀.
 *
 * robots: noindex — 인증 페이지는 검색 색인 차단.
 */

import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginView } from "./LoginView";

export const metadata: Metadata = {
  title: "로그인 — conatusipsi",
  description: "한국 대학 입시 AI 추천 서비스 로그인",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function LoginPage(): React.ReactElement {
  return (
    <div
      data-page="login"
      className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-content-narrow flex-col px-gutter-sm md:px-gutter py-8"
    >
      <Suspense fallback={null}>
        <LoginView />
      </Suspense>
    </div>
  );
}
