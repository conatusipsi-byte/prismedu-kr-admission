"use client";

/**
 * SampleStatsView — /admin/sample-stats 페이지 본체 (Client)
 *
 * - GET /api/admin/sample-stats?year=N → 통계 + 학과별 표
 * - 필터: year, trackKind, status (sufficient·insufficient·all)
 */

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SampleStatsOverview } from "@/components/admin/SampleStatsOverview";
import { SampleStatsTable } from "@/components/admin/SampleStatsTable";
import type {
  SampleStatsItem,
  SampleStatsSummary,
} from "@/lib/admission/sample-stats-summary";

interface ApiResponse {
  items: SampleStatsItem[];
  summary: SampleStatsSummary;
  source: "firestore" | "mock";
}

const TRACK_KINDS = [
  "all",
  "susi_subject",
  "susi_comprehensive",
  "susi_essay",
  "susi_practical",
  "jeongsi_ga",
  "jeongsi_na",
  "jeongsi_da",
] as const;

export function SampleStatsView(): React.ReactElement {
  const [year, setYear] = React.useState<number>(new Date().getFullYear() + 1);
  const [trackKind, setTrackKind] = React.useState<string>("all");
  const [status, setStatus] = React.useState<"all" | "sufficient" | "insufficient">("all");
  const [data, setData] = React.useState<ApiResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let aborted = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    params.set("year", String(year));
    params.set("limit", "200");
    if (trackKind !== "all") params.set("trackKind", trackKind);
    if (status !== "all") params.set("status", status);

    fetch(`/api/admin/sample-stats?${params.toString()}`)
      .then(async (res) => {
        if (aborted) return;
        if (!res.ok) {
          const d = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(d.error ?? `조회 실패 (${res.status})`);
        }
        const d = (await res.json()) as ApiResponse;
        setData(d);
      })
      .catch((e) => {
        if (!aborted) setError((e as Error).message);
      })
      .finally(() => {
        if (!aborted) setLoading(false);
      });
    return () => {
      aborted = true;
    };
  }, [year, trackKind, status]);

  return (
    <div
      data-page="admin-sample-stats"
      className="mx-auto flex max-w-content-wide flex-col gap-6 px-gutter-sm md:px-gutter lg:px-gutter-lg py-6"
    >
      <header>
        <h1 className="text-2xl font-bold">합격사례 표본 집계</h1>
        <p className="text-xs text-muted-foreground">
          학과·트랙별 표본 충족 여부 — 표본 부족 학과는 사이트에서 합격 확률을 표시하지 않습니다 (P-001).
          {data?.source === "mock" && " (현재 mock 데이터 — Firestore 시드 후 자동 전환)"}
        </p>
      </header>

      {/* 필터 */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="year-filter" className="text-xs">학년도</Label>
          <Input
            id="year-filter"
            type="number"
            min={2025}
            max={2099}
            value={year}
            onChange={(e) => {
              const n = Number.parseInt(e.target.value, 10);
              if (Number.isFinite(n)) setYear(n);
            }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="track-filter" className="text-xs">트랙</Label>
          <Select value={trackKind} onValueChange={setTrackKind}>
            <SelectTrigger id="track-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TRACK_KINDS.map((k) => (
                <SelectItem key={k} value={k}>{k === "all" ? "전체" : k}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="status-filter" className="text-xs">표본 상태</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger id="status-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              <SelectItem value="sufficient">충족만</SelectItem>
              <SelectItem value="insufficient">부족만</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>

      {error && (
        <div
          role="alert"
          data-testid="sample-stats-error"
          className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive"
        >
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> 조회 중…
        </div>
      ) : data ? (
        <>
          <SampleStatsOverview summary={data.summary} />
          <section>
            <h2 className="mb-3 text-lg font-semibold">학과·트랙별 ({data.items.length})</h2>
            <SampleStatsTable items={data.items} />
          </section>
        </>
      ) : null}
    </div>
  );
}
