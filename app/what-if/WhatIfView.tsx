"use client";

/**
 * WhatIfView — /what-if Pro UI (Client)
 *
 * baseSpecId(matchId) + override(csat 등급/내신 GPA) → POST /api/match/simulate.
 *
 * 진입 흐름:
 *   - /analysis/[matchId] 결과 페이지에서 "What-If 시뮬레이션" CTA → /what-if?baseSpecId=...
 *   - 직접 진입 (URL 없음) → 분석 페이지로 안내
 *
 * 시뮬레이션은 ephemeral — Firestore matches 에 저장 X.
 *
 * 정직성 (P-002):
 *   - 표본 부족 학과는 probability=null + "표본 부족" 라벨
 *   - "확정 합격" 표현 X — Reach/Match/Safety 분류 + 합격률 범위 표시
 */

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Loader2,
  Sparkles,
} from "lucide-react";
import { fetchWithAuth, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

interface MatchResultItem {
  universityId: string;
  universityName: string;
  departmentId: string;
  departmentName: string;
  trackKind: string;
  trackName: string;
  category: "reach" | "hard_target" | "target" | "safety" | "insufficient_sample";
  probability: number | null;
  low: number | null;
  high: number | null;
  sampleSufficient: boolean;
}

interface SimulateResponse {
  simulated: true;
  baseSpecId: string;
  results: MatchResultItem[];
  globalCaveats: string[];
  override: unknown;
  candidateCount: number;
}

const CATEGORY_LABEL: Record<string, { label: string; cls: string }> = {
  safety: { label: "안정", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" },
  target: { label: "적정", cls: "bg-mint-50 text-mint-700 dark:bg-mint-950/40 dark:text-mint-300" },
  hard_target: { label: "도전", cls: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" },
  reach: { label: "상향", cls: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" },
  insufficient_sample: { label: "표본 부족", cls: "bg-muted text-muted-foreground" },
};

const TRACK_LABEL: Record<string, string> = {
  susi_subject: "학생부교과",
  susi_comprehensive: "학생부종합",
  susi_essay: "논술",
  susi_practical: "실기",
  jeongsi_ga: "정시 가군",
  jeongsi_na: "정시 나군",
  jeongsi_da: "정시 다군",
};

interface OverrideState {
  koreanGrade: number | null;
  mathGrade: number | null;
  englishGrade: number | null;
  investigationGradeAvg: number | null;
  naesinGpa: number | null;
}

const INIT_OVERRIDE: OverrideState = {
  koreanGrade: null,
  mathGrade: null,
  englishGrade: null,
  investigationGradeAvg: null,
  naesinGpa: null,
};

export function WhatIfView(): React.ReactElement {
  const searchParams = useSearchParams();
  const baseSpecId = searchParams.get("baseSpecId") ?? "";

  const [override, setOverride] = React.useState<OverrideState>(INIT_OVERRIDE);
  const [result, setResult] = React.useState<SimulateResponse | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (!baseSpecId) {
    return <NoBaseSpecState />;
  }

  const hasAnyOverride = Object.values(override).some((v) => v !== null);

  async function handleSimulate() {
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const csatPart: Record<string, number> = {};
      if (override.koreanGrade != null) csatPart.koreanGrade = override.koreanGrade;
      if (override.mathGrade != null) csatPart.mathGrade = override.mathGrade;
      if (override.englishGrade != null) csatPart.englishGrade = override.englishGrade;
      if (override.investigationGradeAvg != null)
        csatPart.investigationGradeAvg = override.investigationGradeAvg;

      const body = {
        baseSpecId,
        override: {
          ...(Object.keys(csatPart).length > 0 ? { csat: csatPart } : {}),
          ...(override.naesinGpa != null ? { naesinGpa: override.naesinGpa } : {}),
        },
      };
      const data = await fetchWithAuth<SimulateResponse>("/api/match/simulate", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setResult(data);
      requestAnimationFrame(() => {
        document.getElementById("what-if-result")?.scrollIntoView({
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

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-card-lg border-mint-200 bg-mint-50/30 dark:border-mint-900/40 dark:bg-mint-950/15">
        <p className="text-xs text-foreground">
          ✓ 기준 분석:{" "}
          <code className="font-mono text-2xs">{baseSpecId}</code>
        </p>
        <p className="text-2xs text-muted-foreground mt-1">
          이 분석의 점수에 override 만 덮어씌워 시뮬레이션합니다 (저장 안 됨).
        </p>
      </Card>

      <section aria-label="점수 조정">
        <h2 className="text-sm font-semibold text-foreground mb-3">
          점수 조정 (변경할 항목만 조정)
        </h2>
        <Card className="p-card-lg flex flex-col gap-5">
          <GradeSlider
            label="수능 국어 등급"
            value={override.koreanGrade}
            onChange={(v) => setOverride((s) => ({ ...s, koreanGrade: v }))}
          />
          <GradeSlider
            label="수능 수학 등급"
            value={override.mathGrade}
            onChange={(v) => setOverride((s) => ({ ...s, mathGrade: v }))}
          />
          <GradeSlider
            label="수능 영어 등급"
            value={override.englishGrade}
            onChange={(v) => setOverride((s) => ({ ...s, englishGrade: v }))}
          />
          <GradeSlider
            label="수능 탐구 평균 등급"
            value={override.investigationGradeAvg}
            onChange={(v) =>
              setOverride((s) => ({ ...s, investigationGradeAvg: v }))
            }
          />
          <GradeSlider
            label="내신 GPA 평균 (등급)"
            value={override.naesinGpa}
            onChange={(v) => setOverride((s) => ({ ...s, naesinGpa: v }))}
          />
        </Card>
      </section>

      <div className="flex items-center gap-3 flex-wrap">
        <Button
          size="lg"
          disabled={!hasAnyOverride || submitting}
          onClick={() => void handleSimulate()}
          className="bg-mint-600 hover:bg-mint-700"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> 시뮬레이션 중…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" /> 시뮬레이션 시작
            </>
          )}
        </Button>
        {hasAnyOverride && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setOverride(INIT_OVERRIDE)}
            disabled={submitting}
          >
            초기화
          </Button>
        )}
        {!hasAnyOverride && (
          <p className="text-xs text-muted-foreground">
            한 항목 이상 조정해야 시뮬레이션 가능합니다.
          </p>
        )}
      </div>

      {error && (
        <Card className="p-card-lg border-destructive/30 bg-destructive/5">
          <p className="text-sm text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </p>
        </Card>
      )}

      {result && <ResultSection result={result} />}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Grade Slider — 1~9 등급, null 미조정 = "변경 안 함"
   ═══════════════════════════════════════════════════════════════════════ */

function GradeSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
}): React.ReactElement {
  const enabled = value !== null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <Label className="text-sm">{label}</Label>
        <div className="flex items-center gap-2">
          {enabled ? (
            <>
              <span className="text-lg font-bold tabular-nums text-mint-700 dark:text-mint-300">
                {value}
                <span className="text-xs text-muted-foreground"> 등급</span>
              </span>
              <button
                type="button"
                onClick={() => onChange(null)}
                className="text-2xs underline text-muted-foreground hover:text-foreground"
              >
                해제
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => onChange(3)}
              className="text-2xs rounded-full bg-muted text-muted-foreground hover:bg-accent hover:text-foreground px-2 py-1 transition-colors"
            >
              + 조정
            </button>
          )}
        </div>
      </div>
      {enabled && (
        <>
          <Slider
            value={[value ?? 3]}
            min={1}
            max={9}
            step={1}
            onValueChange={(arr) => onChange(arr[0])}
            className="w-full"
          />
          <div className="flex justify-between text-2xs text-muted-foreground">
            <span>1 (최우수)</span>
            <span>5</span>
            <span>9 (최하)</span>
          </div>
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   결과 섹션
   ═══════════════════════════════════════════════════════════════════════ */

function ResultSection({
  result,
}: {
  result: SimulateResponse;
}): React.ReactElement {
  // category 별 그룹
  const groups = new Map<string, MatchResultItem[]>();
  for (const r of result.results) {
    const list = groups.get(r.category) ?? [];
    list.push(r);
    groups.set(r.category, list);
  }
  const order = ["safety", "target", "hard_target", "reach", "insufficient_sample"] as const;

  return (
    <div id="what-if-result" className="flex flex-col gap-5">
      <div>
        <h2 className="text-xl font-bold text-foreground">시뮬레이션 결과</h2>
        <p className="text-2xs text-muted-foreground/70 mt-0.5">
          후보 학과 {result.candidateCount}개 분석 · 저장되지 않음
        </p>
      </div>

      {result.results.length === 0 ? (
        <Card className="p-card-lg">
          <p className="text-sm text-muted-foreground">
            조건에 맞는 학과가 없습니다.
          </p>
        </Card>
      ) : (
        order.map((cat) => {
          const items = groups.get(cat);
          if (!items || items.length === 0) return null;
          const meta = CATEGORY_LABEL[cat];
          return (
            <section key={cat} aria-label={meta.label}>
              <h3 className="text-sm font-semibold text-foreground mb-2">
                {meta.label}{" "}
                <span className="text-2xs text-muted-foreground">
                  ({items.length}개)
                </span>
              </h3>
              <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                {items.map((it) => (
                  <ResultCard
                    key={`${it.universityId}_${it.departmentId}_${it.trackKind}_${it.trackName}`}
                    item={it}
                  />
                ))}
              </div>
            </section>
          );
        })
      )}

      {result.globalCaveats.length > 0 && (
        <Card className="p-card-lg border-amber-200 bg-amber-50/30">
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-300" />
            정직성 안내
          </h3>
          <ul className="text-xs space-y-1 text-amber-900 dark:text-amber-200">
            {result.globalCaveats.map((c, i) => (
              <li key={i} className="break-keep-all leading-relaxed">
                • {c}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function ResultCard({ item }: { item: MatchResultItem }): React.ReactElement {
  const meta = CATEGORY_LABEL[item.category] ?? CATEGORY_LABEL.target;
  return (
    <Card className="p-card-lg flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-2xs text-muted-foreground">{item.universityName}</p>
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-2xs font-medium ${meta.cls}`}
        >
          {meta.label}
        </span>
      </div>
      <p className="text-sm font-semibold text-foreground">
        {item.departmentName}
      </p>
      <p className="text-2xs text-muted-foreground">
        {TRACK_LABEL[item.trackKind] ?? item.trackKind} · {item.trackName}
      </p>
      {item.sampleSufficient && item.probability != null ? (
        <div className="mt-1">
          <p className="text-2xl font-bold text-foreground tabular-nums">
            {Math.round(item.probability)}
            <span className="text-sm text-muted-foreground">%</span>
          </p>
          {item.low != null && item.high != null && (
            <p className="text-2xs text-muted-foreground">
              {Math.round(item.low)}~{Math.round(item.high)}%
            </p>
          )}
        </div>
      ) : (
        <p className="text-2xs text-muted-foreground italic mt-1">
          표본 부족 — 합격 확률 비공개
        </p>
      )}
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   baseSpecId 없을 때 안내
   ═══════════════════════════════════════════════════════════════════════ */

function NoBaseSpecState(): React.ReactElement {
  return (
    <Card className="p-card-lg">
      <div className="flex flex-col items-center text-center gap-3 py-8 max-w-md mx-auto">
        <div className="w-14 h-14 rounded-2xl bg-mint-50 dark:bg-mint-950/40 text-mint-700 dark:text-mint-300 flex items-center justify-center">
          <Sparkles className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-bold text-foreground">기준 분석이 필요해요</h2>
        <p className="text-sm text-muted-foreground break-keep-all leading-relaxed">
          What-If 시뮬레이션은 기존 분석을 기준으로 점수만 조정해서 결과 변화를 봅니다.
          먼저 분석 폼을 작성하고, 결과 페이지에서 &ldquo;What-If 시뮬레이션&rdquo; 으로 들어오세요.
        </p>
        <div className="flex gap-2">
          <Button asChild size="lg" className="bg-mint-600 hover:bg-mint-700">
            <Link href="/analysis">
              분석 시작 <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/dashboard">
              <ArrowLeft className="h-3.5 w-3.5" /> 대시보드
            </Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}
