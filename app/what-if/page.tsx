/**
 * /what-if — 가정 시뮬레이터 (Pro 전용)
 *
 * 기존 분석(matchId)을 기준으로 점수만 조정해서 합격률 변화를 본다.
 * Pro 미만은 ProGate 잠금. Pro/Elite 는 WhatIfView 본체.
 *
 * URL ?baseSpecId=match_xxx — 분석 결과 페이지에서 진입.
 */

import type { Metadata } from "next";
import { Suspense } from "react";
import { ProGate } from "@/components/access/ProGate";
import { WhatIfView } from "./WhatIfView";

export const metadata: Metadata = {
  title: "What-if 시뮬레이터 — conatusipsi",
  description: "수능·내신 가정 변경에 따른 합격률 실시간 변화 시뮬레이션",
  robots: { index: false, follow: false },
  alternates: { canonical: "/what-if" },
};

export const dynamic = "force-dynamic";

export default function WhatIfPage(): React.ReactElement {
  return (
    <div className="mx-auto max-w-content px-gutter-sm md:px-gutter lg:px-gutter-lg py-6 lg:py-10">
      <header className="mb-6">
        <h1 className="text-2xl lg:text-3xl font-bold text-foreground">What-if 시뮬레이터</h1>
        <p className="mt-1.5 text-sm text-muted-foreground break-keep-all">
          &ldquo;수능 영어 1등급으로 올리면?&rdquo;, &ldquo;내신 0.3 더 끌어올리면?&rdquo; — 가정만
          바꿔서 합격률 변화를 즉시 확인.
        </p>
      </header>

      <ProGate
        feature="가정 시뮬레이션"
        description="6월·9월 모의 결과를 보고 수능까지 어디를 더 끌어올려야 하는지 객관적인 방향을 잡아드려요. 슬라이더로 등급을 조정하면 학과별 합격률이 바로 갱신됩니다."
        highlights={[
          "수능 영역별 등급 슬라이더 (국·수·영·탐 1~9등급)",
          "내신 등급 슬라이더 (1.00 ~ 9.00)",
          "변화 전/후 합격률 비교 (Δ% 표시)",
          "생기부 비교과 점수 가정 (시간·횟수·세특)",
        ]}
      >
        <Suspense fallback={null}>
          <WhatIfView />
        </Suspense>
      </ProGate>
    </div>
  );
}
