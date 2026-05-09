/**
 * /planner — 입시 자동 플래너 (Pro 전용)
 *
 * 사용자 의향(수시 6장·정시 가/나/다군) + 학년/모집 일정 → 카테고리별 task 자동 생성.
 * 본 PR 단계: ProGate 잠금 + UI placeholder. /api/planner/* 본체 PR 후 wiring.
 */

import type { Metadata } from "next";
import { ProGate } from "@/components/access/ProGate";

export const metadata: Metadata = {
  title: "입시 플래너 — conatusipsi",
  description: "원서접수·면접·논술·수능까지 카테고리별 task 자동 생성",
  robots: { index: false, follow: false },
  alternates: { canonical: "/planner" },
};

export const dynamic = "force-dynamic";

export default function PlannerPage(): React.ReactElement {
  return (
    <div className="mx-auto max-w-content px-gutter-sm md:px-gutter lg:px-gutter-lg py-6 lg:py-10">
      <header className="mb-6">
        <h1 className="text-2xl lg:text-3xl font-bold text-foreground">입시 플래너</h1>
        <p className="mt-1.5 text-sm text-muted-foreground break-keep-all">
          내 수시 6장·정시 가나다군 일정에 맞춰 다음에 뭐 해야 하는지 자동으로 정리해드려요.
        </p>
      </header>

      <ProGate
        feature="자동 입시 플래너"
        description="모집요강·원서접수·면접·논술·수능 일정을 한 곳에서 관리. 카테고리별 task 자동 생성 + D-Day 알림."
        highlights={[
          "지원 학과별 자동 task 생성 (원서접수·면접·논술·실기·자료준비)",
          "카테고리: 수능 준비 / 내신 / 원서접수 / 면접 / 논술 / 실기 / 자료준비",
          "D-Day 카운트다운 + 마감 임박 task 우선 노출",
          "체크리스트 기반 — 완료 시 진척도 자동 갱신",
        ]}
      />
    </div>
  );
}
