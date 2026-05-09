"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ChatError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.ReactElement {
  React.useEffect(() => {
    console.error("[/chat] error:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-content py-16 text-center">
      <h1 className="mb-2 text-xl font-semibold">AI 카운슬러를 불러오지 못했어요</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        잠시 후 다시 시도해주세요.
      </p>
      <div className="flex justify-center gap-2">
        <Button onClick={reset}>다시 시도</Button>
        <Button asChild variant="outline">
          <Link href="/">홈으로</Link>
        </Button>
      </div>
    </div>
  );
}
