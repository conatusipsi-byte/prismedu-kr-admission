/**
 * /admin/inquiries — 운영자 전용 문의 관리 (2026-05-30).
 *
 * 권한: 부모 /admin/layout.tsx 의 requireMasterAuthFromHeaders + AdminShell 가 처리.
 * BUG-018: 비-master 사용자에게 title 누설 차단 — adminPageMetadata.
 */

import type { Metadata } from "next";
import { AdminInquiriesView } from "./AdminInquiriesView";
import { adminPageMetadata } from "@/lib/admin-metadata";

export const dynamic = "force-dynamic";

export const generateMetadata = (): Promise<Metadata> =>
  adminPageMetadata("문의 관리 — 운영 콘솔");

export default function AdminInquiriesPage(): React.ReactElement {
  return <AdminInquiriesView />;
}
