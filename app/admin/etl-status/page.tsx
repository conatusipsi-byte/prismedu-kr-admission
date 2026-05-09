/**
 * /admin/etl-status — ETL 검수 대기 + 통계 (Day 10 실 구현)
 *
 * master 권한은 admin/layout.tsx가 단일 진입점에서 검증 (notFound).
 * 본 page는 server shell + client view 위임.
 */

import type { Metadata } from "next";
import { EtlStatusView } from "./EtlStatusView";

export const metadata: Metadata = {
  title: "ETL 검수 — admin",
  robots: { index: false, follow: false },
};

export default function EtlStatusPage(): React.ReactElement {
  return <EtlStatusView />;
}
