/**
 * /dashboard — 인증 사용자 메인 대시보드
 *
 * 메인 플로우의 세 번째 칸: 가입 → 온보딩 → [대시보드] → 첫 분석 → 결제.
 *
 * Server Component는 metadata만 노출. 본체는 useAuth/fetchWithAuth가 필요해
 * Client Component(DashboardView)로 분리.
 *
 * robots: noindex — 인증 페이지.
 */

import type { Metadata } from "next";
import { DashboardView } from "./DashboardView";

export const metadata: Metadata = {
  title: "대시보드 — conatusipsi",
  description: "수능·원서접수 D-Day와 수시 6장·정시 가나다군 진행 상황을 한눈에.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/dashboard" },
};

export const dynamic = "force-dynamic";

export default function DashboardPage(): React.ReactElement {
  return (
    <div
      data-page="dashboard"
      className="mx-auto max-w-content-wide px-gutter-sm md:px-gutter lg:px-gutter-lg py-6 lg:py-8"
    >
      <DashboardView />
    </div>
  );
}
