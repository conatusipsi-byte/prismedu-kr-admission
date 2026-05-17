"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/**
 * 학과 상세 에러 boundary.
 *
 * Supabase 일시 장애(503)·네트워크 등 throw 된 에러 캡처.
 * 1회 자동 재시도 후에도 실패하면 UI 노출.
 */
export default function DepartmentDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.ReactElement {
  const [autoRetried, setAutoRetried] = React.useState(false);
  const [retrying, setRetrying] = React.useState(false);

  // 첫 진입 시 1회 자동 재시도 (콜드 스타트/일시 throttle 대응)
  React.useEffect(() => {
    if (!autoRetried) {
      setAutoRetried(true);
      const t = setTimeout(() => {
        setRetrying(true);
        reset();
      }, 1200);
      return () => clearTimeout(t);
    }
    console.error("[/admissions/[uid]/[did]] error:", error);
  }, [autoRetried, error, reset]);

  if (!autoRetried || retrying) {
    return (
      <div className="mx-auto max-w-content py-24 flex flex-col items-center justify-center text-center">
        <RefreshCw className="h-6 w-6 text-muted-foreground animate-spin mb-3" />
        <p className="text-sm text-muted-foreground">잠시만요, 다시 불러오는 중…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-content px-gutter-sm md:px-gutter py-20 flex flex-col items-center text-center">
      <Badge variant="pill-amber" size="md" className="mb-5">
        일시적 오류
      </Badge>
      <h1 className="font-display text-3xl lg:text-4xl font-extrabold tracking-tighter mb-3">
        학과 정보를 불러오지 못했어요
      </h1>
      <p className="text-sm text-muted-foreground max-w-md mb-8 leading-relaxed break-keep-all">
        서버가 일시적으로 응답하지 않습니다. 잠시 후 다시 시도하거나, 검색 페이지로 돌아가 다른 학과를 살펴보세요.
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        <Button onClick={() => reset()} variant="primary" size="lg">
          <RefreshCw className="h-4 w-4" />
          다시 시도
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href="/admissions">
            <ArrowLeft className="h-4 w-4" />
            학과 검색으로
          </Link>
        </Button>
      </div>
    </div>
  );
}
