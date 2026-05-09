"use client";

/**
 * EtlStatusView — /admin/etl-status 페이지 본체 (Client)
 *
 * - GET /api/admin/etl-status (mock fallback 자동) → 통계 + 검수 대기 목록
 * - 행 클릭 → StagingAdmissionDetailModal 열기
 * - 승격 완료 → 목록에서 제거 + 통계 즉시 갱신
 */

import * as React from "react";
import Link from "next/link";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EtlStatusOverview } from "@/components/admin/EtlStatusOverview";
import { SuspiciousAdmissionsList } from "@/components/admin/SuspiciousAdmissionsList";
import { StagingAdmissionDetailModal } from "@/components/admin/StagingAdmissionDetailModal";
import {
  type EtlStatusSummary,
  type StagingEntry,
} from "@/lib/admission/mock-etl-staging";

interface ApiResponse {
  items: StagingEntry[];
  summary: EtlStatusSummary;
  source: "firestore" | "mock";
  nextCursor?: string;
}

export function EtlStatusView(): React.ReactElement {
  const [items, setItems] = React.useState<StagingEntry[]>([]);
  const [summary, setSummary] = React.useState<EtlStatusSummary | null>(null);
  const [source, setSource] = React.useState<"firestore" | "mock" | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<StagingEntry | null>(null);
  const [modalOpen, setModalOpen] = React.useState(false);

  React.useEffect(() => {
    let aborted = false;
    setLoading(true);
    setError(null);
    fetch("/api/admin/etl-status?promoted=false&trustLevel=all&limit=100")
      .then(async (res) => {
        if (aborted) return;
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? `조회 실패 (${res.status})`);
        }
        const data = (await res.json()) as ApiResponse;
        setItems(data.items);
        setSummary(data.summary);
        setSource(data.source);
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
  }, []);

  function handleSelect(e: StagingEntry) {
    setSelected(e);
    setModalOpen(true);
  }

  function handlePromoted(stagingId: string) {
    // 목록에서 제거 + 통계 즉시 갱신 (서버 재조회 없이)
    setItems((prev) => prev.filter((e) => e.id !== stagingId));
    setSummary((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        pendingReview: Math.max(0, prev.pendingReview - 1),
        promotedCount: prev.promotedCount + 1,
      };
    });
  }

  return (
    <div data-page="admin-etl-status" className="mx-auto flex max-w-content-wide flex-col gap-6 px-gutter-sm md:px-gutter lg:px-gutter-lg py-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">ETL 검수 — 승격 대기 목록</h1>
          <p className="text-xs text-muted-foreground">
            업로드된 PDF 파싱 결과를 검수하고 admissions로 승격합니다.
            {source === "mock" && " (현재 mock 데이터 — Firestore 시드 후 자동 전환)"}
          </p>
        </div>
        <Button asChild className="bg-mint-600 hover:bg-mint-700">
          <Link href="/admin/etl-upload">
            <Plus className="mr-1.5 h-3.5 w-3.5" /> 새 PDF 업로드
          </Link>
        </Button>
      </header>

      {error && (
        <div
          role="alert"
          data-testid="etl-status-error"
          className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive"
        >
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> ETL 데이터 로딩…
        </div>
      ) : (
        <>
          {summary && <EtlStatusOverview summary={summary} />}
          <section data-section="pending-review">
            <h2 className="mb-3 text-lg font-semibold">검수 대기 ({items.length})</h2>
            <SuspiciousAdmissionsList items={items} onSelect={handleSelect} />
          </section>
        </>
      )}

      <StagingAdmissionDetailModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        entry={selected}
        onPromoted={handlePromoted}
      />
    </div>
  );
}
