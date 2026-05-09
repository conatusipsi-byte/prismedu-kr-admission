"use client";

/**
 * PaymentFailView — /payment/fail 페이지 본체
 *
 * 토스가 결제 실패 시 failUrl로 redirect하면서 ?code=...&message=... 전달.
 * 사용자에게 친화적 메시지 표시 + /payment 재시도 CTA.
 *
 * 토스 표준 에러 코드: https://docs.tosspayments.com/reference/error-codes
 */

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const FRIENDLY_MESSAGES: Record<string, string> = {
  PAY_PROCESS_CANCELED: "결제를 취소하셨어요. 필요할 때 다시 시작하세요.",
  PAY_PROCESS_ABORTED: "결제 처리가 중단됐어요. 카드사·잔액을 확인하고 다시 시도해주세요.",
  REJECT_CARD_COMPANY: "카드사에서 승인이 거부됐어요. 카드사에 문의하거나 다른 카드로 시도해주세요.",
  USER_CANCEL: "결제를 취소하셨어요.",
};

export function PaymentFailView(): React.ReactElement {
  const params = useSearchParams();
  const code = params.get("code") ?? "";
  const tossMessage = params.get("message") ?? "";

  const friendly = FRIENDLY_MESSAGES[code] ?? "결제가 완료되지 않았어요. 잠시 후 다시 시도해주세요.";

  return (
    <div className="mx-auto max-w-content py-12">
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-950/40">
            <AlertCircle aria-hidden className="h-10 w-10 text-rose-600" />
          </div>
          <h1 data-testid="fail-headline" className="text-xl font-semibold">결제가 완료되지 않았어요</h1>
          <p className="text-sm text-muted-foreground">{friendly}</p>
          {tossMessage && (
            <p className="rounded-md bg-muted px-3 py-2 text-2xs">
              자세한 사유: {tossMessage}
              {code && (
                <>
                  {" "}
                  (코드: <code className="font-mono">{code}</code>)
                </>
              )}
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <Button asChild>
              <Link href="/payment">다시 결제 시도</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/">홈으로</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
