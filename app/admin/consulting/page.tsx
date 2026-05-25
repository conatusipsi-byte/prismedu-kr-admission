/**
 * /admin/consulting — Day 6 운영자 컨설팅 예약 관리 (2026-05-25).
 *
 * 권한: 부모 /admin/layout.tsx 의 requireMasterAuthFromHeaders + AdminShell 가 처리.
 * 본 페이지는 클라이언트 컴포넌트 진입점 — 데이터는 클라가 /api/admin/consulting/* 호출.
 */

import type { Metadata } from "next";
import { AdminConsultingView } from "./AdminConsultingView";
import { adminPageMetadata } from "@/lib/admin-metadata";

export const dynamic = "force-dynamic";

// BUG-018: 비-master 사용자에게 admin title 누설 차단. adminPageMetadata 가 auth 검사
// 실패 시 404 metadata 반환 (root not-found 와 정확 일치).
export const generateMetadata = (): Promise<Metadata> =>
  adminPageMetadata("컨설팅 예약 관리 — 운영 콘솔");

export default function AdminConsultingPage() {
  return <AdminConsultingView />;
}
