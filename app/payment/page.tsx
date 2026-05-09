/**
 * /payment — 결제 카탈로그 페이지 (Server Component shell)
 *
 * 본 페이지는 비로그인 접근 가능 (정형 가격 정보는 공개). 결제 CTA 클릭 시점에
 * /api/payment/request가 requireAuth로 가드 — 미인증이면 401 반환되어 클라가 안내.
 *
 * P-001 정합성: 본 페이지에서 표본 부족 학과를 직접 결제 대상으로 선택하는 흐름은 없다.
 *   사용자는 상품(report_one/season_pass 등)을 결제하고, 분석 결과 페이지에서 표본 부족
 *   학과를 별도 섹션으로 보게 된다.
 */

import type { Metadata } from "next";
import { PaymentCatalogView } from "./PaymentCatalogView";

export const metadata: Metadata = {
  title: "결제 — conatusipsi",
  description: "분석 리포트·시즌권·AI 카운슬러 — 토스페이먼츠 안전 결제",
  alternates: { canonical: "/payment" },
  // 임시 가격 단계라 검색 색인 차단 (출시 시 P-014 확정 후 해제)
  robots: { index: false, follow: false },
};

export default function PaymentPage(): React.ReactElement {
  return (
    <div
      data-page="payment"
      className="mx-auto max-w-content-wide px-gutter-sm md:px-gutter lg:px-gutter-lg py-6"
    >
      <PaymentCatalogView />
    </div>
  );
}
