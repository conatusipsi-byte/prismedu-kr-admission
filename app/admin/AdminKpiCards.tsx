"use client";

/**
 * AdminKpiCards — /admin 루트 KPI 4개 (Client)
 *
 * GET /api/admin/kpi 호출 → 카드 4개 렌더.
 * 미인증·실패 시 placeholder 노출 (빈 상태로 동작).
 */

import * as React from "react";
import { Loader2 } from "lucide-react";
import { fetchWithAuth, ApiError } from "@/lib/api-client";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface KpiResponse {
  todoSignupCount?: number | null;
  todayMatchCount?: number | null;
  todayPaidOrderCount?: number | null;
  sampleInsufficientPercent?: number | null;
  generatedAt?: string;
}

export function AdminKpiCards(): React.ReactElement {
  const [data, setData] = React.useState<KpiResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchWithAuth<KpiResponse>("/api/admin/kpi");
        if (!cancelled) setData(res);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof ApiError ? e.message : (e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
    );
  }

  const items = [
    {
      label: "오늘 가입자",
      value: data?.todoSignupCount,
      hint: "users.createdAt >= 오늘 0시 (KST)",
    },
    {
      label: "오늘 분석 요청",
      value: data?.todayMatchCount,
      hint: "matches 일별 생성 수",
    },
    {
      label: "오늘 결제",
      value: data?.todayPaidOrderCount,
      hint: "orders.status='paid'",
    },
    {
      label: "표본 부족 학과",
      value:
        data?.sampleInsufficientPercent != null
          ? `${data.sampleInsufficientPercent}%`
          : null,
      hint: "verifiedCount<5 비율",
    },
  ];

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((k) => (
          <Card key={k.label} className="p-card-lg space-y-1.5">
            <p className="text-xs text-muted-foreground">{k.label}</p>
            <p className="text-2xl font-bold tabular-nums text-foreground">
              {k.value == null ? <span className="text-muted-foreground">—</span> : k.value}
            </p>
            <p className="text-2xs text-muted-foreground/70">{k.hint}</p>
          </Card>
        ))}
      </div>
      {error && (
        <p className="mt-3 text-2xs text-destructive">⚠️ KPI 조회 실패: {error}</p>
      )}
      {data?.generatedAt && (
        <p className="mt-2 text-2xs text-muted-foreground/70 flex items-center gap-1">
          {loading && <Loader2 className="h-3 w-3 animate-spin" />}
          {new Date(data.generatedAt).toLocaleTimeString("ko-KR")} 기준
        </p>
      )}
    </>
  );
}
