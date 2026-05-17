/**
 * /signup — split-screen 회원가입 (LoginView initialMode="signup")
 *
 * /login 과 동일 컴포넌트를 mode="signup" 로 진입. URL 분리는 SEO·analytics·
 * 이메일 안내 링크에서 가입/로그인 구분이 필요하기 때문.
 */

import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginView } from "../login/LoginView";
import { SplitScreenAuth } from "@/components/auth/SplitScreenAuth";

export const metadata: Metadata = {
  title: "회원가입 — conatusipsi",
  description: "한국 대학 입시 AI 추천 서비스 무료 회원가입",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function SignupPage(): React.ReactElement {
  return (
    <SplitScreenAuth mode="signup">
      <Suspense fallback={null}>
        <LoginView initialMode="signup" />
      </Suspense>
    </SplitScreenAuth>
  );
}
