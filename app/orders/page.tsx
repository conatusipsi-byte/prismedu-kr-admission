import type { Metadata } from "next";
import { OrdersListView } from "./OrdersListView";

export const metadata: Metadata = {
  title: "결제 이력 — conatusipsi",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function OrdersPage(): React.ReactElement {
  return (
    <div
      data-page="orders"
      className="mx-auto max-w-content px-gutter-sm md:px-gutter lg:px-gutter-lg py-6"
    >
      <OrdersListView />
    </div>
  );
}
