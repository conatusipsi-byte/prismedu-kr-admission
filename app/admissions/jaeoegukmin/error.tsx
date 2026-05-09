"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

export default function JaeoegukminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("[/admissions/jaeoegukmin] error:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-content py-16 text-center">
      <h1 className="mb-2 text-xl font-semibold">자격 진단을 불러오지 못했어요</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        잠시 후 다시 시도해주세요.
      </p>
      <Button onClick={reset}>다시 시도</Button>
    </div>
  );
}
