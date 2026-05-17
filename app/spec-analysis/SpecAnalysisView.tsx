"use client";

/**
 * SpecAnalysisView — /spec-analysis Pro UI (Client)
 *
 * 흐름:
 *   1. AnalysisFormWizard 재사용 (3-step) — onSubmit override 로 /api/spec-analysis 호출
 *   2. 응답 (activities + strengths + weaknesses + recommendations + caveats) 렌더
 *   3. "다시 분석" 으로 form 으로 복귀
 *
 * 정직성 (P-002):
 *   - 영역별 score=null 은 "정보 부족" 배지로 노출 (점수 0 으로 호도 X)
 *   - source="mock" 면 사용자에게 안내
 *   - caveats 항상 노출
 */

import * as React from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Award,
  Lightbulb,
  Loader2,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { fetchWithAuth, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AnalysisFormWizard,
  type AnalysisFormPayload,
} from "@/components/analysis/AnalysisFormWizard";
import type { SpecAnalysisResponse } from "@/lib/schemas/api/spec-analysis";

const AREA_LABEL: Record<string, string> = {
  autonomous: "자율활동",
  club: "동아리활동",
  career: "진로활동",
  detailedAbility: "세특",
  behavioralCharacteristics: "행특",
};

export function SpecAnalysisView(): React.ReactElement {
  const [result, setResult] = React.useState<SpecAnalysisResponse | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [focusMajor, setFocusMajor] = React.useState("");

  async function handleSubmit(payload: AnalysisFormPayload): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      const body = {
        specs: {
          basic: {
            gradeLevel: payload.basic.gradeLevel!,
            track: payload.basic.track!,
            abroadHighSchool: "no" as const,
          },
          score: payload.score,
          extra: payload.extra,
        },
        focusMajor: focusMajor.trim() || undefined,
      };
      const data = await fetchWithAuth<SpecAnalysisResponse>(
        "/api/spec-analysis",
        {
          method: "POST",
          body: JSON.stringify(body),
        },
      );
      setResult(data);
      // 결과 영역으로 스크롤
      requestAnimationFrame(() => {
        document.getElementById("spec-analysis-result")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <ResultView
        result={result}
        onReset={() => {
          setResult(null);
          setError(null);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Card className="p-card-lg border-brand-200 bg-brand-50/20 dark:border-brand-900/40">
        <Label htmlFor="focus-major" className="text-xs">
          목표 전공 (선택) — 입력 시 적합도 평가에 반영
        </Label>
        <Input
          id="focus-major"
          value={focusMajor}
          onChange={(e) => setFocusMajor(e.target.value)}
          placeholder="예: 컴퓨터과학, 의예, 경영학"
          className="mt-1.5"
          maxLength={40}
          disabled={submitting}
        />
        <p className="text-2xs text-muted-foreground mt-1.5">
          공란이면 일반 학종 평가 기준으로 분석합니다.
        </p>
      </Card>

      <AnalysisFormWizard onSubmit={handleSubmit} />

      {error && (
        <Card className="p-card-lg border-destructive/30 bg-destructive/5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-destructive">분석 실패</p>
              <p className="text-xs text-muted-foreground mt-1">{error}</p>
            </div>
          </div>
        </Card>
      )}

      {submitting && (
        <Card className="p-card-lg">
          <div className="flex items-center gap-3 py-4">
            <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
            <p className="text-sm">AI 분석 중… (10~20초 소요)</p>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   결과 렌더
   ═══════════════════════════════════════════════════════════════════════ */

function ResultView({
  result,
  onReset,
}: {
  result: SpecAnalysisResponse;
  onReset: () => void;
}): React.ReactElement {
  return (
    <div id="spec-analysis-result" className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-foreground">분석 결과</h2>
          <p className="text-2xs text-muted-foreground/70 mt-0.5">
            응답 출처: {result.source === "anthropic" ? "Claude API" : "Mock (정형 가이드)"}
            {" · "}
            토큰 {result.usage.inputTokens + result.usage.outputTokens} 사용
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onReset}>
          <ArrowLeft className="h-3.5 w-3.5" />
          다시 분석
        </Button>
      </div>

      {result.source === "mock" && (
        <Card className="p-card-lg border-amber-200 bg-amber-50/40 dark:border-amber-900/40 dark:bg-amber-900/15">
          <div className="flex items-start gap-3">
            <ShieldAlert className="h-4 w-4 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">
                현재 mock 응답 모드
              </p>
              <p className="text-xs text-muted-foreground mt-1 break-keep-all leading-relaxed">
                ANTHROPIC_API_KEY 가 등록되지 않아 AI 호출이 일반론적 가이드로 대체됩니다.
                관리자에게 키 등록 요청 시 즉시 활성화됩니다.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* 영역별 점수 */}
      <section aria-label="영역별 점수">
        <h3 className="text-sm font-semibold text-foreground mb-3">
          영역별 적합도 (5개)
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {result.activities.map((a) => (
            <ActivityCard key={a.area} activity={a} />
          ))}
        </div>
      </section>

      {/* 강점 */}
      {result.strengths.length > 0 && (
        <ListSection
          title="강점"
          icon={<TrendingUp className="h-4 w-4" />}
          tone="emerald"
          items={result.strengths}
        />
      )}

      {/* 약점 */}
      {result.weaknesses.length > 0 && (
        <ListSection
          title="약점"
          icon={<TrendingDown className="h-4 w-4" />}
          tone="amber"
          items={result.weaknesses}
        />
      )}

      {/* 추천 액션 */}
      {result.recommendations.length > 0 && (
        <ListSection
          title="추천 보강 액션"
          icon={<Lightbulb className="h-4 w-4" />}
          tone="mint"
          items={result.recommendations}
        />
      )}

      {/* Caveats — P-002 */}
      {result.caveats.length > 0 && (
        <Card className="p-card-lg border-amber-200 bg-amber-50/30 dark:border-amber-900/40 dark:bg-amber-900/10">
          <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-300" />
            정직성 안내
          </h3>
          <ul className="space-y-1.5 text-xs text-amber-900 dark:text-amber-200">
            {result.caveats.map((c, i) => (
              <li key={i} className="flex gap-1.5 break-keep-all leading-relaxed">
                <span aria-hidden>•</span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function ActivityCard({
  activity,
}: {
  activity: SpecAnalysisResponse["activities"][number];
}): React.ReactElement {
  const label = AREA_LABEL[activity.area] ?? activity.area;
  const isInsufficient = activity.score === null;
  return (
    <Card className="p-card-lg flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold text-foreground">{label}</h4>
        {isInsufficient ? (
          <span className="text-2xs font-medium rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-2 py-0.5">
            정보 부족
          </span>
        ) : (
          <span className="text-lg font-bold tabular-nums text-foreground">
            {activity.score}
            <span className="text-xs text-muted-foreground">/100</span>
          </span>
        )}
      </div>
      {!isInsufficient && (
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-brand-500"
            style={{ width: `${activity.score ?? 0}%` }}
          />
        </div>
      )}
      <p className="text-xs text-muted-foreground break-keep-all leading-relaxed">
        {activity.comment}
      </p>
    </Card>
  );
}

function ListSection({
  title,
  icon,
  tone,
  items,
}: {
  title: string;
  icon: React.ReactNode;
  tone: "emerald" | "amber" | "mint";
  items: string[];
}): React.ReactElement {
  const TONE_CLASS = {
    emerald: "border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/40 dark:bg-emerald-900/10",
    amber: "border-amber-200 bg-amber-50/40 dark:border-amber-900/40 dark:bg-amber-900/10",
    mint: "border-brand-200 bg-brand-50/40 dark:border-brand-900/40 dark:bg-brand-950/15",
  } as const;
  const ICON_TONE = {
    emerald: "text-emerald-700 dark:text-emerald-300",
    amber: "text-amber-700 dark:text-amber-300",
    mint: "text-brand-700 dark:text-brand-300",
  } as const;

  return (
    <Card className={`p-card-lg ${TONE_CLASS[tone]}`}>
      <h3 className={`text-sm font-semibold text-foreground mb-2 flex items-center gap-2 ${ICON_TONE[tone]}`}>
        {icon}
        <span className="text-foreground">{title}</span>
      </h3>
      <ul className="space-y-1.5 text-sm">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2 break-keep-all leading-relaxed">
            <Award className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${ICON_TONE[tone]}`} />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
