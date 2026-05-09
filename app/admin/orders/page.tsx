/**
 * /admin/orders — 주문 관리 (운영자)
 *
 * 사이트맵 §2.5: orders 컬렉션 조회 + 환불 처리.
 * 본 PR 단계: 페이지 골격 + 상태 안내. 실 주문 fetcher는 GET /api/admin/orders
 * 라우트 본체 PR 후 wiring (현재 stub).
 */

import type { Metadata } from "next";
import { CheckCircle2, Clock, ShoppingBag, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "주문 관리 — conatusipsi 운영",
  robots: { index: false, follow: false },
};

const STATUS_LEGEND = [
  { status: "paid", label: "결제 완료", icon: CheckCircle2, tone: "emerald" },
  { status: "pending", label: "결제 대기", icon: Clock, tone: "amber" },
  { status: "refunded", label: "환불 완료", icon: XCircle, tone: "muted" },
  { status: "failed", label: "결제 실패", icon: XCircle, tone: "rose" },
] as const;

export default function AdminOrdersPage(): React.ReactElement {
  return (
    <div className="flex flex-col gap-section-lg">
      <header>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <ShoppingBag className="h-5 w-5 text-mint-600 dark:text-mint-400" />
          주문 관리
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground break-keep-all">
          단건권·시즌권 결제 내역. 환불 요청은 영업일 기준 3일 이내 처리.
        </p>
      </header>

      <section aria-label="상태 범례">
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
          {STATUS_LEGEND.map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.status}
                className="flex items-center gap-2 rounded-lg border border-border/60 bg-card px-3 py-2 text-xs"
              >
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">{s.label}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section aria-label="오늘 주문">
        <h2 className="text-sm font-semibold text-foreground mb-3">오늘 주문</h2>
        <Card className="p-card-lg">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b">
                <tr>
                  <th className="text-left p-3 font-medium">주문 ID</th>
                  <th className="text-left p-3 font-medium">사용자</th>
                  <th className="text-left p-3 font-medium">상품</th>
                  <th className="text-right p-3 font-medium">금액</th>
                  <th className="text-left p-3 font-medium">상태</th>
                  <th className="text-left p-3 font-medium">시각</th>
                  <th className="text-right p-3 font-medium">작업</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={7} className="text-center text-muted-foreground py-12">
                    <p className="text-sm">오늘 주문 0건</p>
                    <p className="text-2xs mt-1 text-muted-foreground/70">
                      ⚠️ GET /api/admin/orders 본체 PR 후 실데이터로 자동 채워짐
                    </p>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      <section aria-label="환불 요청">
        <h2 className="text-sm font-semibold text-foreground mb-3">환불 요청 대기</h2>
        <Card className="p-card-lg">
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
              <XCircle className="h-5 w-5" />
            </div>
            <p className="text-sm font-medium text-foreground">환불 요청 0건</p>
            <p className="text-xs text-muted-foreground max-w-md break-keep-all leading-relaxed">
              사용자가{" "}
              <code className="text-2xs px-1.5 py-0.5 rounded bg-muted">
                /orders → 환불 요청
              </code>{" "}
              을 누르면 여기에 표시됩니다. 환불 정책(/refund §2)에 따라 단건권 사용 후엔
              환불 불가, 시즌권은 일할 계산.
            </p>
          </div>
        </Card>
      </section>
    </div>
  );
}
