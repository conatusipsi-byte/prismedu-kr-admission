import type { Metadata } from "next";
import { Suspense } from "react";
import { PaymentFailView } from "./PaymentFailView";

export const metadata: Metadata = {
  title: "결제 실패 — conatusipsi",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function PaymentFailPage(): React.ReactElement {
  return (
    <div
      data-page="payment-fail"
      className="mx-auto max-w-content-wide px-gutter-sm md:px-gutter lg:px-gutter-lg py-6"
    >
      <Suspense fallback={null}>
        <PaymentFailView />
      </Suspense>
    </div>
  );
}
