"use client";

/**
 * ProbabilitySection — 학과 상세의 "합격률 분석" 섹션 클라이언트 wrapper.
 *
 * 부모 page.tsx 가 ISR(revalidate=600) Server Component 라 세션을 즉시 못 봄.
 * 본 wrapper 가 useAuth 로 로그인 여부를 판정해 ProbabilityTab 에 전달.
 *
 * 상단의 "로그인 필요" 배지도 로그인 시 숨김 처리.
 */

import { Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { ProbabilityTab } from "./ProbabilityTab";
import type { AdmissionTrackKind } from "@/types/admission";

export interface ProbabilitySectionProps {
  trackKind: AdmissionTrackKind;
  sampleSufficient: boolean;
}

export function ProbabilitySection({
  trackKind,
  sampleSufficient,
}: ProbabilitySectionProps): React.ReactElement {
  const { user, loading } = useAuth();
  const isAuthenticated = !loading && !!user;

  return (
    <section id="probability" data-section="probability" className="rounded-3xl border border-border bg-card p-6 lg:p-7">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-bold tracking-tight inline-flex items-center gap-2">
          {!isAuthenticated && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
          합격률 분석
        </h2>
        {!isAuthenticated && (
          <Badge variant="pill-iris" size="sm">
            로그인 필요
          </Badge>
        )}
      </div>
      {/* BUG-002: 이전 <React.Suspense fallback={<Card><CardContent h-32/></Card>}> 제거.
          ProbabilityTab 안에서 promise 를 throw 하는 코드가 전혀 없는데 Suspense 가 있으면
          React 18 streaming SSR 이 임의 페이지에서 클라이언트 컴포넌트를 deferred chunk 로
          분리해 빈 h-32(128px) fallback 을 잠깐 또는 영구히 노출 — QA 1차에서 pusan/info-comp
          에 명시 관찰. 원인은 Suspense boundary 자체이므로 wrapper 제거가 정공법.
          (회귀 방지: probability-section.test.tsx 가 빈 fallback DOM 미노출 강제.) */}
      <ProbabilityTab
        trackKind={trackKind}
        sampleSufficient={sampleSufficient}
        lockReason={undefined}
        probability={null}
        hakjong={null}
        isAuthenticated={isAuthenticated}
      />
    </section>
  );
}
