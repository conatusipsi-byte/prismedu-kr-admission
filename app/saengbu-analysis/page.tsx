/**
 * /saengbu-analysis — 생기부(학생부) AI 분석 (Pro 전용)
 *
 * 생기부 전체 텍스트를 입력하면 학생부종합전형 5축(학업·전공적합·활동·인성·발전가능성)을
 * AI가 정성 분석. Pro 미만은 ProGate 잠금. (운영 API 비용 통제 + spec-analysis 일관)
 *
 * 윤리/개인정보: 민감정보 → 동의 게이트(SaengbuAnalysisView), 원문 미저장, 참고용 명시.
 */

import type { Metadata } from "next";
import { ProGate } from "@/components/access/ProGate";
import { SaengbuAnalysisView } from "./SaengbuAnalysisView";

export const metadata: Metadata = {
  title: "생기부 AI 분석 — Conatus",
  description: "생기부 전체 텍스트 → 학생부종합전형 5축 정성 분석 (참고용)",
  robots: { index: false, follow: false },
  alternates: { canonical: "/saengbu-analysis" },
};

export const dynamic = "force-dynamic";

export default function SaengbuAnalysisPage(): React.ReactElement {
  return (
    <div className="mx-auto max-w-content px-gutter-sm md:px-gutter lg:px-gutter-lg py-6 lg:py-10">
      <header className="mb-6">
        <h1 className="text-2xl lg:text-3xl font-bold text-foreground">생기부 AI 분석</h1>
        <p className="mt-1.5 text-sm text-muted-foreground break-keep-all">
          생기부 전체 텍스트를 붙여넣으면 학생부종합전형 5축(학업역량·전공적합성·활동·인성·발전가능성)을
          AI가 정성적으로 분석해 강·약점과 보강 방향을 짚어드려요.
        </p>
      </header>

      <ProGate
        feature="생기부 AI 정성 분석"
        description="NEIS 생기부 텍스트를 5축 학종 평가요소로 분석. 자소서가 폐지된 학종에서 세특·창체의 전공적합성·발전가능성을 객관적으로 점검해요."
        highlights={[
          "5축 루브릭 점수 (학업·전공적합·활동·인성·발전가능성)",
          "강점·약점·보강 액션 + 목표 전공 적합성",
          "정직성 원칙: 근거 없는 영역은 추측치 X, '정보 부족' 명시",
          "참고용 분석 — 합격을 보장하지 않으며 최종 판단은 전문 컨설팅",
        ]}
      >
        <SaengbuAnalysisView />
      </ProGate>
    </div>
  );
}
