/**
 * /admin/etl-status — ETL 검수 대기 + 통계 (Day 10 실 구현)
 *
 * master 권한은 admin/layout.tsx가 단일 진입점에서 검증 (notFound).
 * 본 page는 server shell + client view 위임.
 */

import type { Metadata } from "next";
import { EtlStatusView } from "./EtlStatusView";
import { adminPageMetadata } from "@/lib/admin-metadata";

// BUG-018: 비-master 접근 시 admin title 누설 차단.
export const generateMetadata = (): Promise<Metadata> =>
  adminPageMetadata("ETL 검수 — admin");

export default function EtlStatusPage(): React.ReactElement {
  return <EtlStatusView />;
}
