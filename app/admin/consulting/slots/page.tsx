/**
 * /admin/consulting/slots — 운영자 컨설팅 슬롯 관리 (2026-06-01).
 *
 * 슬롯 열기/닫기 + 미래 슬롯 생성. 권한은 부모 /admin/layout.tsx 의
 * requireMasterAuthFromHeaders + AdminShell 가 처리. 데이터는 클라가
 * /api/admin/consulting/slots* 호출.
 */

import type { Metadata } from "next";
import { AdminSlotsView } from "./AdminSlotsView";
import { adminPageMetadata } from "@/lib/admin-metadata";

export const dynamic = "force-dynamic";

// BUG-018: 비-master 사용자에게 admin title 누설 차단 (404 위장).
export const generateMetadata = (): Promise<Metadata> =>
  adminPageMetadata("컨설팅 슬롯 관리 — 운영 콘솔");

export default function AdminConsultingSlotsPage() {
  return <AdminSlotsView />;
}
