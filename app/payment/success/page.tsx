import type { Metadata } from "next";
import { Suspense } from "react";
import { PaymentSuccessView } from "./PaymentSuccessView";

export const metadata: Metadata = {
  title: "결제 완료 — conatusipsi",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function PaymentSuccessPage(): React.ReactElement {
  return (
    <div
      data-page="payment-success"
      className="mx-auto max-w-content-wide px-gutter-sm md:px-gutter lg:px-gutter-lg py-6"
    >
      <Suspense fallback={null}>
        <PaymentSuccessView />
      </Suspense>
    </div>
  );
}
