"use client";

/**
 * AdmissionFitPanel — AI 적합도 분석 (Layer 1) 학과 상세 패널.
 *
 * 정직성 (P-002):
 *   - 합격 "확률"이 아니라 "전형 요구(전형방법·반영비율·수능최저·계열) 대비 적합도" 판단.
 *     입결(합격선) 미사용 → Layer 2(통계 합격률, 플래그 게이트)와 명확히 분리.
 *   - 강/중/약 부합 등급 + 강·약점 + 보강 추천 + caveats. 숫자 % 만들지 않음.
 *
 * 비용 통제(최우선):
 *   - 검색/목록은 AI 호출 0. 본 분석은 학생이 "이 전형 분석" 버튼을 누른 1개 전형만 호출.
 *   - 버튼은 Pro/Elite 에게만 렌더(무료·비로그인은 호출 자체 불가) + 서버 403/429 2중 방어.
 *   - 동일 (프로필+전형) 재요청은 서버 ai-cache 로 0 토큰.
 */

import * as React from "react";
import Link from "next/link";
import {
  Sparkles, Loader2, TrendingUp, TrendingDown,
  Lightbulb, AlertTriangle, Check, X, FileText, Info, Lock, ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { fetchWithAuth, ApiError } from "@/lib/api-client";
import { TRACK_KIND_LABELS } from "@/lib/admission/labels";
import { FIT_TIER_LABEL, type AdmissionFitResponse, type FitTier } from "@/lib/schemas/api/admission-fit";
import type { AdmissionTrackKind } from "@/types/admission";

export interface FitTrackOption {
  kind: AdmissionTrackKind;
  name: string;
}

export function AdmissionFitPanel({
  universityId,
  departmentId,
  tracks,
}: {
  universityId: string;
  departmentId: string;
  tracks: FitTrackOption[];
}): React.ReactElement {
  const { user, profile, loading } = useAuth();
  const plan = profile?.plan ?? "free";
  const isPro = plan === "pro" || plan === "elite";

  // 전형종류(kind) 기준 dedupe — 서버 라우트가 trackKind 로 키잉(동일 kind 첫 전형 분석).
  const options = React.useMemo(() => {
    const seen = new Set<string>();
    const out: FitTrackOption[] = [];
    for (const t of tracks) {
      if (!seen.has(t.kind)) { seen.add(t.kind); out.push(t); }
    }
    return out;
  }, [tracks]);

  const nextUrl = `/admissions/${universityId}/${departmentId}`;

  return (
    <section
      id="ai-fit"
      data-section="ai-fit"
      data-component="admission-fit-panel"
      className="rounded-3xl border border-brand-200/70 bg-gradient-to-b from-brand-50/40 to-card p-6 lg:p-7 dark:border-brand-900/40 dark:from-brand-950/20"
    >
      <div className="mb-1 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-brand-600 dark:text-brand-400" aria-hidden />
        <h2 className="text-base font-bold tracking-tight">AI 적합도 분석</h2>
        <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2 py-0.5 text-2xs font-semibold text-brand-700 ring-1 ring-brand-200/70 dark:bg-brand-900/50 dark:text-brand-300 dark:ring-brand-800/50">
          AI 심층 · Pro
        </span>
      </div>
      <p className="mb-1 text-xs text-muted-foreground break-keep-all leading-relaxed">
        내 프로필과 이 전형이 강조하는 요소(전형방법·반영비율·수능최저·계열)를 비교해
        <strong className="text-foreground"> 적합도(강/중/약 부합)</strong>와 강·약점·보강점을 분석해요.
      </p>
      <p className="mb-4 text-2xs text-muted-foreground break-keep-all leading-relaxed">
        ⚠️ 합격 <strong className="text-foreground">확률(%)</strong>이 아니라 <strong className="text-foreground">전형 요구 대비 적합도</strong> 판단이에요 ·
        선택한 <strong className="text-foreground">1개 전형</strong>만 분석합니다 (검색·목록은 무료).
      </p>

      {options.length === 0 ? (
        <p className="text-sm text-muted-foreground break-keep-all">분석할 전형 정보가 없습니다.</p>
      ) : loading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> 불러오는 중…
        </div>
      ) : !user ? (
        <GateCard
          icon={<Sparkles className="h-5 w-5" />}
          title="로그인하고 AI 적합도 분석 받기"
          desc="내 프로필 기준으로 이 전형이 원하는 것에 얼마나 부합하는지 분석해드려요."
          primary={{ href: `/login?next=${encodeURIComponent(nextUrl)}`, label: "로그인하고 시작" }}
        />
      ) : !isPro ? (
        <GateCard
          icon={<Lock className="h-5 w-5" />}
          title="AI 적합도 분석은 Pro 전용이에요"
          desc="전형이 강조하는 평가요소 대비 내 강·약점과 보강 포인트를 AI가 정리해드립니다."
          primary={{ href: "/pricing", label: "요금제 보기" }}
          secondary={{ href: "/payment", label: "시즌권 결제" }}
        />
      ) : (
        <FitAnalyzer universityId={universityId} departmentId={departmentId} options={options} />
      )}
    </section>
  );
}

/* ───────────────────────── 분석기 (Pro/Elite 전용) ───────────────────────── */

function FitAnalyzer({
  universityId,
  departmentId,
  options,
}: {
  universityId: string;
  departmentId: string;
  options: FitTrackOption[];
}): React.ReactElement {
  const [selected, setSelected] = React.useState<AdmissionTrackKind>(options[0].kind);
  const [submitting, setSubmitting] = React.useState(false);
  const [result, setResult] = React.useState<AdmissionFitResponse | null>(null);
  const [error, setError] = React.useState<{ message: string; actionUrl?: string; actionLabel?: string } | null>(null);

  async function analyze(): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      const data = await fetchWithAuth<AdmissionFitResponse>("/api/admission-fit", {
        method: "POST",
        body: JSON.stringify({ universityId, departmentId, trackKind: selected }),
      });
      setResult(data);
    } catch (e) {
      if (e instanceof ApiError) {
        const body = (e.details && typeof e.details === "object" ? e.details : {}) as { actionUrl?: string; upgradeUrl?: string };
        if (e.status === 409 && body.actionUrl) {
          setError({ message: e.message, actionUrl: body.actionUrl, actionLabel: "분석 폼으로 이동" });
        } else if (e.status === 403) {
          setError({ message: e.message, actionUrl: body.upgradeUrl ?? "/pricing", actionLabel: "요금제 보기" });
        } else if (e.status === 429) {
          setError({ message: "요청이 많아요. 잠시 후 다시 시도해주세요." });
        } else {
          setError({ message: e.message });
        }
      } else {
        setError({ message: (e as Error).message });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 전형 선택 — 1개만 분석(비용) */}
      <div>
        <p className="mb-2 text-2xs font-semibold text-muted-foreground">분석할 전형 선택</p>
        <div className="flex flex-wrap gap-1.5">
          {options.map((o) => {
            const active = o.kind === selected;
            return (
              <button
                key={o.kind}
                type="button"
                onClick={() => { setSelected(o.kind); setResult(null); setError(null); }}
                data-track-kind={o.kind}
                aria-pressed={active}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                  active
                    ? "border-brand-500 bg-brand-500 text-white"
                    : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {TRACK_KIND_LABELS[o.kind]}
              </button>
            );
          })}
        </div>
      </div>

      {/* 실행 버튼 — 명시적 클릭 시에만 AI 호출 */}
      <Button
        type="button"
        onClick={analyze}
        disabled={submitting}
        className="w-full bg-brand-600 hover:bg-brand-700 sm:w-auto"
        data-action="analyze-fit"
      >
        {submitting ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> 분석 중… (10~20초)</>
        ) : (
          <><Sparkles className="h-4 w-4" /> {result ? "다시 분석" : `${TRACK_KIND_LABELS[selected]} 적합도 분석`}</>
        )}
      </Button>

      {error && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
            <div className="flex-1">
              <p className="text-sm font-medium text-destructive">분석을 진행할 수 없어요</p>
              <p className="mt-0.5 text-xs text-muted-foreground break-keep-all">{error.message}</p>
              {error.actionUrl && (
                <Button asChild size="sm" variant="outline" className="mt-2">
                  <Link href={error.actionUrl}>
                    {error.actionLabel ?? "이동"} <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {result && <FitResult result={result} />}
    </div>
  );
}

/* ───────────────────────── 결과 렌더 ───────────────────────── */

const TIER_TONE: Record<FitTier, string> = {
  strong: "bg-emerald-50 text-emerald-700 ring-emerald-200/70 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800/50",
  moderate: "bg-amber-50 text-amber-700 ring-amber-200/70 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800/50",
  weak: "bg-zinc-100 text-zinc-600 ring-zinc-300/70 dark:bg-zinc-800/40 dark:text-zinc-300 dark:ring-zinc-700/50",
};

function FitResult({ result }: { result: AdmissionFitResponse }): React.ReactElement {
  return (
    <div data-component="admission-fit-result" className="flex flex-col gap-4 border-t border-border/60 pt-4">
      {/* 등급 + 요약 */}
      <div className="rounded-2xl border border-border bg-background p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-sm font-semibold">
            {result.context.universityName} · {result.context.trackName}
          </span>
          <span className={cn("inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-bold ring-1", TIER_TONE[result.fitTier])}>
            {FIT_TIER_LABEL[result.fitTier]}
          </span>
        </div>
        <p className="text-sm text-foreground break-keep-all leading-relaxed">{result.summary}</p>
      </div>

      {/* 수능최저 사실 판정 (결정적, AI 아님) */}
      <CsatMinLine csatMinimum={result.csatMinimum} />

      {result.strengths.length > 0 && (
        <ListBlock title="강점" tone="emerald" icon={<TrendingUp className="h-4 w-4" />} items={result.strengths} />
      )}
      {result.weaknesses.length > 0 && (
        <ListBlock title="약점" tone="amber" icon={<TrendingDown className="h-4 w-4" />} items={result.weaknesses} />
      )}
      {result.recommendations.length > 0 && (
        <ListBlock title="보강 추천" tone="mint" icon={<Lightbulb className="h-4 w-4" />} items={result.recommendations} />
      )}

      {/* Caveats — 정직성 */}
      {result.caveats.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4 dark:border-amber-900/40 dark:bg-amber-950/15">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> 꼭 알아두세요
          </p>
          <ul className="space-y-1 text-2xs text-amber-900 break-keep-all leading-relaxed dark:text-amber-200">
            {result.caveats.map((c, i) => (
              <li key={i} className="flex gap-1.5"><span aria-hidden>•</span><span>{c}</span></li>
            ))}
          </ul>
        </div>
      )}

      {/* 출처/토큰 — 투명성 */}
      <p className="text-2xs text-muted-foreground/70">
        출처: {result.source === "anthropic" ? "Claude AI" : "Mock(정형 가이드 · AI 키 미등록)"}
        {result.cached && " · 캐시"}
        {" · "}토큰 {result.usage.inputTokens + result.usage.outputTokens}
      </p>
    </div>
  );
}

function CsatMinLine({ csatMinimum }: { csatMinimum: AdmissionFitResponse["csatMinimum"] }): React.ReactElement {
  const { status, note } = csatMinimum;
  let tone = "bg-muted text-muted-foreground ring-border";
  let icon = <Info className="h-3 w-3" />;
  let label = "수능최저";
  if (status === "met") { tone = TIER_TONE.strong; icon = <Check className="h-3 w-3" />; label = "수능최저 충족"; }
  else if (status === "not_met") { tone = "bg-rose-50 text-rose-700 ring-rose-200/70 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-800/50"; icon = <X className="h-3 w-3" />; label = "수능최저 미충족"; }
  else if (status === "complex") { icon = <FileText className="h-3 w-3" />; label = "수능최저 원문 확인"; }
  else if (status === "none") { label = "수능최저 없음"; }
  else { icon = <Info className="h-3 w-3" />; label = "수능최저 미판정"; }

  return (
    <div className="flex items-start gap-2 rounded-2xl border border-border bg-background p-3">
      <span className={cn("mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-bold ring-1", tone)}>
        {icon} {label}
      </span>
      <p className="text-2xs text-muted-foreground break-keep-all leading-relaxed">{note}</p>
    </div>
  );
}

const LIST_TONE = {
  emerald: { card: "border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/40 dark:bg-emerald-950/15", icon: "text-emerald-700 dark:text-emerald-300" },
  amber: { card: "border-amber-200 bg-amber-50/40 dark:border-amber-900/40 dark:bg-amber-950/15", icon: "text-amber-700 dark:text-amber-300" },
  mint: { card: "border-brand-200 bg-brand-50/40 dark:border-brand-900/40 dark:bg-brand-950/15", icon: "text-brand-700 dark:text-brand-300" },
} as const;

function ListBlock({
  title, tone, icon, items,
}: {
  title: string;
  tone: keyof typeof LIST_TONE;
  icon: React.ReactNode;
  items: string[];
}): React.ReactElement {
  const t = LIST_TONE[tone];
  return (
    <div className={cn("rounded-2xl border p-4", t.card)}>
      <p className={cn("mb-2 flex items-center gap-1.5 text-xs font-semibold", t.icon)}>
        {icon} <span className="text-foreground">{title}</span>
      </p>
      <ul className="space-y-1.5 text-sm">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2 break-keep-all leading-relaxed">
            <span className={cn("mt-0.5 shrink-0", t.icon)} aria-hidden>•</span>
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ───────────────────────── 게이트 카드 (로그인/Pro) ───────────────────────── */

function GateCard({
  icon, title, desc, primary, secondary,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  primary: { href: string; label: string };
  secondary?: { href: string; label: string };
}): React.ReactElement {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-background/60 px-4 py-7 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500 text-white">
        {icon}
      </div>
      <div className="max-w-sm space-y-1">
        <p className="text-sm font-bold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground break-keep-all leading-relaxed">{desc}</p>
      </div>
      <div className="flex w-full flex-col gap-2 pt-1 sm:w-auto sm:flex-row">
        <Button asChild className="bg-brand-600 hover:bg-brand-700">
          <Link href={primary.href}>{primary.label} <ArrowRight className="h-3.5 w-3.5" /></Link>
        </Button>
        {secondary && (
          <Button asChild variant="outline">
            <Link href={secondary.href}>{secondary.label}</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
