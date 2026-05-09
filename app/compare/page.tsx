/**
 * /compare — 학과 비교 (Pro 전용)
 *
 * 여러 학과(2~4개)를 한 화면에 나란히 놓고 모집인원·전년 컷·반영비·합격률을 비교.
 * 본 PR 단계: ProGate로 잠금 + UI placeholder. POST /api/compare 라우트 본체 PR 후
 * 실 데이터 wiring.
 */

import type { Metadata } from "next";
import { ProGate } from "@/components/access/ProGate";

export const metadata: Metadata = {
  title: "학과 비교 — conatusipsi",
  description: "여러 학과의 모집요강·합격률을 한눈에 비교하는 Pro 기능",
  robots: { index: false, follow: false },
  alternates: { canonical: "/compare" },
};

export const dynamic = "force-dynamic";

export default function ComparePage(): React.ReactElement {
  return (
    <div className="mx-auto max-w-content-wide px-gutter-sm md:px-gutter lg:px-gutter-lg py-6 lg:py-10">
      <header className="mb-6">
        <h1 className="text-2xl lg:text-3xl font-bold text-foreground">학과 비교</h1>
        <p className="mt-1.5 text-sm text-muted-foreground break-keep-all">
          마음에 드는 학과 2~4개를 골라 모집인원·전년 입결·반영비·합격률을 한 화면에서
          나란히 비교하세요.
        </p>
      </header>

      <ProGate
        feature="학과 단위 비교 분석"
        description="수시 6장·정시 가나다군 슬롯을 채우기 전에, 후보 학과들을 한 화면에 펼쳐놓고 어디가 더 나에게 유리한지 객관적으로 판단하세요."
        highlights={[
          "최대 4개 학과 동시 비교 (모집인원·반영비·전년 컷·수능최저)",
          "내 성적 기준 학과별 합격률 + Reach/Match/Safety 분류",
          "전형별(학종·교과·논술·정시) 분리 비교",
          "표본 부족 학과는 P-001 정직성 원칙대로 비공개 처리",
        ]}
      />
    </div>
  );
}
