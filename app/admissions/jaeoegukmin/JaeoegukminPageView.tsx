"use client";

/**
 * JaeoegukminPageView — wizard ↔ result ↔ recommendations 상태 머신
 *
 * 단순 useState 기반 상태 머신:
 *   "wizard"          → JaeoegukminEligibilityWizard
 *   "result"          → JaeoegukminResultCard
 *   "recommendations" → JaeoegukminTrackList
 *
 * 결과 화면에서 "추천 대학 보기" 클릭 → recommendations 로 전환.
 * 어느 단계든 "다시 진단" 클릭 → wizard 로 reset.
 */

import * as React from "react";
import { JaeoegukminEligibilityWizard } from "@/components/admissions/JaeoegukminEligibilityWizard";
import { JaeoegukminResultCard } from "@/components/admissions/JaeoegukminResultCard";
import { JaeoegukminTrackList } from "@/components/admissions/JaeoegukminTrackList";
import type { JaeoegukminResult } from "@/lib/admission/jaeoegukmin-eligibility";

type ViewState = "wizard" | "result" | "recommendations";

export function JaeoegukminPageView() {
  const [view, setView] = React.useState<ViewState>("wizard");
  const [result, setResult] = React.useState<JaeoegukminResult | null>(null);

  const handleComplete = React.useCallback((r: JaeoegukminResult) => {
    setResult(r);
    setView("result");
    // 결과 카드로 스크롤
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

  const handleRestart = React.useCallback(() => {
    setResult(null);
    setView("wizard");
  }, []);

  const handleShowRecommendations = React.useCallback(() => {
    setView("recommendations");
  }, []);

  return (
    <div
      data-component="jaeoegukmin-page-view"
      data-view={view}
      className="mx-auto max-w-content px-gutter-sm md:px-gutter py-8"
    >
      {view === "wizard" && (
        <JaeoegukminEligibilityWizard onComplete={handleComplete} />
      )}

      {view === "result" && result && (
        <div className="flex flex-col gap-6">
          <JaeoegukminResultCard
            result={result}
            onRestart={handleRestart}
            onShowRecommendations={
              result.type !== "not_eligible" ? handleShowRecommendations : undefined
            }
          />
        </div>
      )}

      {view === "recommendations" && result && (
        <div className="flex flex-col gap-6">
          {/* 결과 카드 요약 (compact) + 다시 진단 CTA */}
          <JaeoegukminResultCard result={result} onRestart={handleRestart} />
          <JaeoegukminTrackList type={result.type} />
        </div>
      )}
    </div>
  );
}
