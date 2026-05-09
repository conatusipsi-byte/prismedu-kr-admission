/**
 * /admissions — 학과 검색 페이지
 *
 * 비로그인 접근 가능 (P-001). 카드 그리드는 합격률 미리보기 절대 X — 정형 정보만.
 *
 * 데이터 로딩:
 *   - 클라이언트에서 /api/admissions/search 호출 (디바운스 + 무한 스크롤)
 *   - 본 page.tsx 는 Server Component (SEO 메타) + 클라이언트 컴포넌트 위임
 *
 * P-013: 본 페이지에서 jaeoegukmin 트랙은 디폴트 미노출.
 *   /admissions/jaeoegukmin 별도 라우트로 분리.
 */

import type { Metadata } from "next";
import { AdmissionsSearchView } from "./AdmissionsSearchView";

export const metadata: Metadata = {
  title: "학과 검색 — conatusipsi",
  description:
    "전국 1,000여 학과의 모집요강·전형 정보를 한 곳에서. 합격률 분석은 로그인 후, 모집요강은 무료 공개.",
  openGraph: {
    type: "website",
    locale: "ko_KR",
    title: "학과 검색 — conatusipsi",
    description: "전국 1,000여 학과 모집요강·전형 정보 무료 조회",
  },
  alternates: { canonical: "/admissions" },
  robots: { index: true, follow: true },
};

export default function AdmissionsPage(): React.ReactElement {
  return <AdmissionsSearchView />;
}
