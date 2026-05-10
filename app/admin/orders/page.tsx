/**
 * /admin/orders — 주문 관리 (운영자)
 *
 * 사이트맵 §2.5: orders 컬렉션 조회.
 * GET /api/admin/orders 본체와 wired 됨. 환불 mutation 은 후속 PR.
 *
 * master 권한 검증은 admin/layout.tsx 단일 진입점.
 */

import type { Metadata } from "next";
import { OrdersView } from "./OrdersView";

export const metadata: Metadata = {
  title: "주문 관리 — conatusipsi 운영",
  robots: { index: false, follow: false },
};

export default function AdminOrdersPage(): React.ReactElement {
  return <OrdersView />;
}
