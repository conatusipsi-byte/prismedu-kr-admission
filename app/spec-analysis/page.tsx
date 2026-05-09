/**
 * /spec-analysis — 스펙 분석 (Pro 전용)
 *
 * 생기부 비교과(자율·동아리·진로·세특·행특)를 정량 입력하면 학종 적합도를 정성적으로
 * 분석. 본 PR 단계: ProGate 잠금 + UI placeholder. POST /api/spec-analysis 본체 PR 후
 * wiring (Anthropic Claude 호출 — 토큰 비용 가드 처음부터 적용).
 */

import type { Metadata } from "next";
import { ProGate } from "@/components/access/ProGate";

export const metadata: Metadata = {
  title: "스펙 분석 — conatusipsi",
  description: "생기부 비교과 정량 입력 → 학종 적합도 정성 분석",
  robots: { index: false, follow: false },
  alternates: { canonical: "/spec-analysis" },
};

export const dynamic = "force-dynamic";

export default function SpecAnalysisPage(): React.ReactElement {
  return (
    <div className="mx-auto max-w-content px-gutter-sm md:px-gutter lg:px-gutter-lg py-6 lg:py-10">
      <header className="mb-6">
        <h1 className="text-2xl lg:text-3xl font-bold text-foreground">스펙 분석</h1>
        <p className="mt-1.5 text-sm text-muted-foreground break-keep-all">
          내 비교과 활동(자율·동아리·진로·세특·행특)이 학종에 얼마나 어필되는지 AI가
          정성적으로 분석.
        </p>
      </header>

      <ProGate
        feature="AI 비교과 정성 분석"
        description="자소서가 폐지된 24학번 이후, 학종에서 비교과는 정량 입력값 + 면접·세특 정성 평가가 핵심. AI가 내 활동의 강·약점을 객관적으로 짚어드려요."
        highlights={[
          "활동별 적합도 점수 (자율·동아리·진로·세특·행특)",
          "전공 일치도 + 지속성 + 깊이 3축 평가",
          "추천 보강 액션 (어떤 활동이 부족한지)",
          "정직성 원칙: 데이터 부족 시 추측치 X, '정보 부족' 명시",
        ]}
      />
    </div>
  );
}
