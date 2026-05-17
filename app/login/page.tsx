/**
 * /login — split-screen 로그인.
 *
 * 좌 50%: 다크 브랜드 패널 (모바일 압축)
 * 우 50%: LoginView 폼
 */

import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginView } from "./LoginView";
import { SplitScreenAuth } from "@/components/auth/SplitScreenAuth";

export const metadata: Metadata = {
  title: "로그인 — conatusipsi",
  description: "한국 대학 입시 AI 추천 서비스 로그인",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function LoginPage(): React.ReactElement {
  return (
    <SplitScreenAuth mode="login">
      <Suspense fallback={null}>
        <LoginView />
      </Suspense>
    </SplitScreenAuth>
  );
}
