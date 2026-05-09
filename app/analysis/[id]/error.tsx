"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function AnalysisResultError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.ReactElement {
  React.useEffect(() => {
    console.error("[/analysis/[id]] error:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-content py-16 text-center">
      <h1 className="mb-2 text-xl font-semibold">분석 결과를 불러오지 못했어요</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        잠시 후 다시 시도해주세요. 문제가 계속되면 새로 분석을 시작해주세요.
      </p>
      <div className="flex justify-center gap-2">
        <Button onClick={reset}>다시 시도</Button>
        <Button asChild variant="outline">
          <Link href="/analysis">새 분석 시작</Link>
        </Button>
      </div>
    </div>
  );
}
