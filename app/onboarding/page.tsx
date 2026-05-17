/**
 * /onboarding — 첫 로그인 시 KR Specs 입력 wizard 페이지
 *
 * 메인 플로우의 두 번째 칸: 가입 → [온보딩] → 첫 분석 → 결제 → 상세 분석.
 * 비로그인 사용자가 직접 진입해도 BasicInfoStep까지는 보이지만, "프로필 저장"
 * 단계에서 fetchWithAuth가 401을 던지므로 LoginView로 우회 안내된다.
 *
 * robots: noindex — 인증 후 페이지는 검색 노출 차단.
 */

import type { Metadata } from "next";
import { OnboardingWizard } from "@/components/analysis/OnboardingWizard";

export const metadata: Metadata = {
  title: "프로필 입력 — conatusipsi",
  description:
    "내신·수능·생기부 비교과를 한 번 입력하면 모든 분석에 그대로 사용됩니다.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/onboarding" },
};

export const dynamic = "force-dynamic";

export default function OnboardingPage(): React.ReactElement {
  return (
    <div
      data-page="onboarding"
      className="mx-auto max-w-content px-gutter-sm md:px-gutter lg:px-gutter-lg py-6 lg:py-10"
    >
      <header className="mb-6 max-w-2xl">
        <p className="text-xs font-semibold text-brand-600 dark:text-brand-400 mb-1.5">
          처음이시군요 👋
        </p>
        <h1 className="text-2xl lg:text-3xl font-bold text-foreground">
          내 입시 프로필 만들기
        </h1>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed break-keep-all">
          학년·계열, 내신, 수능/모의, 비교과를 차례로 입력하면 분석·비교·What-if가
          모두 같은 데이터로 동작해요. 의향(수시 6장·정시 가/나/다군)은 분석 결과를
          보면서 학과를 고르며 채우는 게 자연스러워 다음 단계에서 진행합니다.
        </p>
      </header>

      <OnboardingWizard />
    </div>
  );
}
