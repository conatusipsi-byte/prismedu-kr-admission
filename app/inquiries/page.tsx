/**
 * /inquiries — 사용자 문의·시스템 개선 요청 (2026-05-30).
 *
 * 비로그인 → /login?returnUrl=/inquiries 로 redirect (InquiriesView 가 처리).
 * 운영자가 답변하면 사용자 이메일로 자동 발송 + 본 페이지 이력에서도 확인 가능.
 */

import type { Metadata } from "next";
import { InquiriesView } from "./InquiriesView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "문의 — Conatus",
  description: "시스템 개선 제안과 일반 문의를 보내고 답변을 확인할 수 있어요.",
  alternates: { canonical: "/inquiries" },
  robots: { index: true, follow: true },
};

export default function InquiriesPage(): React.ReactElement {
  return <InquiriesView />;
}
