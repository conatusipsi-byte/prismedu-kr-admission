/**
 * /analysis — 합격률 분석 폼 페이지
 *
 * 사용자 성적·스펙 입력 → POST /api/match → 결과 페이지 이동.
 *
 * 본 PR 단계: 폼 골격 + 정책 회귀 (P-013 외국 고교 redirect, 자소서 영역 X).
 *   결과 페이지(/analysis/[id]) 본체와 lib/matching-kr.ts는 후속 PR.
 *
 * 인증 가드: middleware는 /admin/*만 처리 — 본 페이지는 비로그인도 폼 입력
 *   가능 (정직성 원칙: 분석을 미리 보여주지 않으면 입력 동기 부족).
 *   POST /api/match 단계에서 라우트의 requireAuth가 실 가드.
 */

import type { Metadata } from "next";
import { AnalysisFormWizard } from "@/components/analysis/AnalysisFormWizard";

export const metadata: Metadata = {
  title: "합격률 분석 — conatusipsi",
  description:
    "성적과 비교과를 입력하면 AI가 학과별 합격 가능성을 산출합니다. 표본이 부족한 학과는 임의 수치를 만들지 않습니다.",
  openGraph: {
    type: "website",
    locale: "ko_KR",
    title: "합격률 분석 — conatusipsi",
    description: "내신·수능·비교과 입력으로 학과별 합격 가능성 산출",
  },
  alternates: { canonical: "/analysis" },
  robots: { index: true, follow: true },
};

export default function AnalysisPage(): React.ReactElement {
  return (
    <div
      data-page="analysis"
      className="mx-auto max-w-content px-gutter-sm md:px-gutter lg:px-gutter-lg py-6"
    >
      <header className="mb-6">
        <h1 className="text-2xl font-bold">합격률 분석</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          학년·계열, 내신·수능, 비교과를 입력하면 학과별 합격 가능성을 산출합니다.
          입력은 언제든 수정·재분석 가능합니다.
        </p>
      </header>
      <AnalysisFormWizard />
    </div>
  );
}
