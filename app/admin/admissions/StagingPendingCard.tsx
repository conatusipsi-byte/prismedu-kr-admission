"use client";

/**
 * StagingPendingCard — /admin/admissions 의 "이행 대기 / 의심 학과" 실 데이터 카드.
 *
 * GET /api/admin/etl-status?promoted=false 호출 → 검수 대기 학과 카운트 + trustLevel 분포.
 * 이전 stub("0건 + ⚠️ stub")을 실 데이터로 교체.
 */

import * as React from "react";
import Link from "next/link";
import { ArrowRight, FileWarning, GitMerge, Loader2 } from "lucide-react";
import { fetchWithAuth, ApiError } from "@/lib/api-client";
import { Card } from "@/components/ui/card";

interface StagingItem {
  id: string;
  universityId: string;
  universityName: string;
  year: number;
  trustLevel: "trusted" | "trusted-fallback" | "suspicious";
  promoted: boolean;
}

interface StagingSummary {
  totalStaging: number;
  pendingReview: number;
  promotedCount: number;
  trustLevelCounts: Record<"trusted" | "trusted-fallback" | "suspicious", number>;
}

interface ApiResponse {
  items: StagingItem[];
  summary: StagingSummary;
  source: "firestore" | "mock";
  nextCursor?: string;
}

export function StagingPendingCard(): React.ReactElement {
  const [data, setData] = React.useState<ApiResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchWithAuth<ApiResponse>(
          "/api/admin/etl-status?promoted=false&limit=100",
        );
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : (e as Error).message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const pending = data?.summary?.pendingReview ?? data?.items.length ?? 0;
  const suspicious = data?.summary?.trustLevelCounts?.suspicious ?? 0;
  const sourceMock = data?.source === "mock";

  return (
    <>
      <section aria-label="이행 대기 학과">
        <h2 className="text-sm font-semibold text-foreground mb-3">
          이행 대기 (Staging → Production)
        </h2>
        <Card className="p-card-lg">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-full bg-mint-50 dark:bg-mint-950/40 flex items-center justify-center text-mint-700 dark:text-mint-300 shrink-0">
              <GitMerge className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              {loading ? (
                <p className="text-sm text-muted-foreground inline-flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> 조회 중…
                </p>
              ) : error ? (
                <p className="text-sm text-destructive">⚠️ 조회 실패: {error}</p>
              ) : (
                <>
                  <p className="text-sm font-medium text-foreground">
                    검수 대기 학과 <span className="tabular-nums">{pending}</span>건
                    {sourceMock && (
                      <span className="ml-2 text-2xs text-muted-foreground/80">(mock)</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 break-keep-all leading-relaxed">
                    PDF 업로드 → 자동 파싱 후 staging에 도착한 항목입니다. ETL 상세 페이지에서
                    내용 검수 후 promote 버튼으로 프로덕션 이행하세요.
                  </p>
                  <Link
                    href="/admin/etl-status"
                    className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-mint-600 dark:text-mint-400 hover:underline"
                  >
                    ETL 상세 보기
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </>
              )}
            </div>
          </div>
        </Card>
      </section>

      <section aria-label="OCR 의심 학과">
        <h2 className="text-sm font-semibold text-foreground mb-3">
          OCR 의심 학과 (수동 재검수 필요)
        </h2>
        <Card className="p-card-lg">
          <div className="flex items-start gap-3">
            <div
              className={
                suspicious > 0
                  ? "w-9 h-9 rounded-lg bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 flex items-center justify-center shrink-0"
                  : "w-9 h-9 rounded-lg bg-muted text-muted-foreground flex items-center justify-center shrink-0"
              }
            >
              <FileWarning className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              {loading ? (
                <p className="text-sm text-muted-foreground inline-flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> 조회 중…
                </p>
              ) : (
                <>
                  <p className="text-sm font-medium text-foreground">
                    의심 학과 <span className="tabular-nums">{suspicious}</span>건
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 break-keep-all leading-relaxed">
                    인코딩 자동 판정(utf8 / adobe_korea1 / ocr) 결과 OCR 분류된 학과는 수동 검수
                    후 promote 권장. 시즌 진입 전 0건 유지가 목표.
                  </p>
                  <Link
                    href="/admin/etl-status?trustLevel=suspicious"
                    className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-mint-600 dark:text-mint-400 hover:underline"
                  >
                    의심 학과만 보기
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </>
              )}
            </div>
          </div>
        </Card>
      </section>
    </>
  );
}
