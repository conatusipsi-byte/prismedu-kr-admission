/**
 * /admin/consulting — Day 6 운영자 컨설팅 예약 관리 (2026-05-25).
 *
 * 권한: 부모 /admin/layout.tsx 의 requireMasterAuthFromHeaders + AdminShell 가 처리.
 * 본 페이지는 클라이언트 컴포넌트 진입점 — 데이터는 클라가 /api/admin/consulting/* 호출.
 */

import type { Metadata } from "next";
import { AdminConsultingView } from "./AdminConsultingView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "컨설팅 예약 관리 — 운영 콘솔",
  robots: { index: false, follow: false },
};

export default function AdminConsultingPage() {
  return <AdminConsultingView />;
}
