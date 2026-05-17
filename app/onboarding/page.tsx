/**
 * /onboarding — 첫 로그인 시 KR Specs 입력 wizard.
 *
 * Stage 5 UP-03: 페이지 wrapper 시각 통일 + 진행 흐름 안내.
 * OnboardingWizard 컴포넌트가 step 상태를 내부 관리.
 *
 * audit P1-05: middleware 에서 비로그인 진입 시 /login?returnUrl=/onboarding 으로 차단.
 */

import type { Metadata } from "next";
import { Sparkles, Compass, ChartBar, Trophy } from "lucide-react";
import { OnboardingWizard } from "@/components/analysis/OnboardingWizard";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "프로필 입력 — conatusipsi",
  description: "내신·수능·생기부 비교과를 한 번 입력하면 모든 분석에 그대로 사용됩니다.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/onboarding" },
};

export const dynamic = "force-dynamic";

const STEP_PREVIEW = [
  { icon: Compass,  label: "1. 기본 정보", desc: "학년·계열" },
  { icon: ChartBar, label: "2. 성적",       desc: "내신·수능/모의" },
  { icon: Sparkles, label: "3. 비교과",     desc: "세특·동아리·수상" },
  { icon: Trophy,   label: "4. 결과 확인",  desc: "맞춤 추천 + 시뮬레이션" },
] as const;

export default function OnboardingPage(): React.ReactElement {
  return (
    <div
      data-page="onboarding"
      className="relative"
    >
      {/* 배경 mesh */}
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[40vh] overflow-hidden" aria-hidden>
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 h-[32rem] w-[80rem] rounded-full bg-gradient-to-b from-brand-200/30 via-iris/15 to-transparent blur-3xl dark:from-brand-700/15" />
      </div>

      <div className="mx-auto max-w-content px-gutter-sm md:px-gutter lg:px-gutter-lg py-10 lg:py-14">
        <header className="mb-10 flex flex-col gap-4">
          <Badge variant="pill-brand" size="md" className="self-start">
            <Sparkles className="h-3 w-3" />
            처음이시군요
          </Badge>
          <h1 className="font-display text-3xl lg:text-5xl font-extrabold tracking-tighter">
            내 입시 프로필 만들기
          </h1>
          <p className="text-base text-muted-foreground leading-relaxed break-keep-all max-w-2xl">
            학년·계열, 내신, 수능/모의, 비교과를 차례로 입력하면 분석·비교·What-if가 모두 같은 데이터로 동작해요. 의향(수시 6장·정시 가/나/다군)은 분석 결과를 보면서 학과를 고르며 채우는 게 자연스러워 다음 단계에서 진행합니다.
          </p>
        </header>

        {/* Step preview — 진행 흐름을 한눈에 */}
        <ol className="mb-10 grid grid-cols-2 lg:grid-cols-4 gap-3">
          {STEP_PREVIEW.map((s, idx) => (
            <li
              key={s.label}
              className="rounded-2xl border border-border bg-card/80 backdrop-blur-sm p-4 flex flex-col gap-2"
            >
              <div className="flex items-center justify-between">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-50 to-iris/10 text-brand-600 ring-1 ring-brand-200/50 dark:from-brand-950/60 dark:to-iris/15 dark:text-brand-300 dark:ring-brand-800/40">
                  <s.icon className="h-4 w-4" strokeWidth={1.75} />
                </span>
                <span className="text-2xs font-bold font-numeric tabular-nums text-muted-foreground">
                  {idx + 1} / {STEP_PREVIEW.length}
                </span>
              </div>
              <p className="text-sm font-bold">{s.label}</p>
              <p className="text-2xs text-muted-foreground break-keep-all leading-relaxed">{s.desc}</p>
            </li>
          ))}
        </ol>

        <OnboardingWizard />
      </div>
    </div>
  );
}
