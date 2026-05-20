/**
 * /signup/verify-email — 가입 직후 인증 메일 안내 페이지.
 *
 * 흐름:
 *   1. /signup 폼 제출 → signUpWithEmail 성공 → router.push("/signup/verify-email?email=...")
 *   2. 이 페이지에서 "메일함 확인하세요" 안내 + 재발송 버튼 노출
 *   3. 사용자가 메일 링크 클릭 → /auth/callback → "/" (메인 페이지)
 */

import type { Metadata } from "next";
import { Suspense } from "react";
import { SplitScreenAuth } from "@/components/auth/SplitScreenAuth";
import { VerifyEmailView } from "./VerifyEmailView";

export const metadata: Metadata = {
  title: "인증 메일을 보냈어요 — Conatus",
  description: "받으신 메일의 확인 링크를 눌러 가입을 완료해주세요.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function VerifyEmailPage(): React.ReactElement {
  return (
    <SplitScreenAuth mode="signup">
      <Suspense fallback={null}>
        <VerifyEmailView />
      </Suspense>
    </SplitScreenAuth>
  );
}
