"use client";

/**
 * SaengbuAnalysisView — /saengbu-analysis Pro UI (Client)
 *
 * 흐름: 개인정보 동의 게이트 → 생기부 텍스트 입력(.txt 업로드 가능) + 목표 전공 →
 *   POST /api/saengbu-analysis → 5축 결과 렌더 → "다시 분석".
 *
 * 윤리/개인정보(P-002):
 *   - 동의 체크 전 분석 버튼 비활성 (서버단에서도 consent 재검증)
 *   - 생기부 원문 미저장 안내 명시
 *   - 결과 상단·하단에 "참고용, 합격 보장 X" disclaimer 고정
 *   - score=null 은 "정보 부족" 배지 (0점으로 호도 X), source=mock 안내
 */

import * as React from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Award,
  Lightbulb,
  Loader2,
  Lock,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Upload,
} from "lucide-react";
import { fetchWithAuth, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SaengbuAnalysisResponse } from "@/lib/schemas/api/saengbu-analysis";

const AXIS_LABEL: Record<string, string> = {
  academic: "학업역량",
  majorFit: "전공적합성",
  activity: "활동·경험",
  community: "인성·공동체역량",
  growth: "발전가능성",
};

const MIN_CHARS = 50;
const MAX_CHARS = 30000;

export function SaengbuAnalysisView(): React.ReactElement {
  const [text, setText] = React.useState("");
  const [focusMajor, setFocusMajor] = React.useState("");
  const [consent, setConsent] = React.useState(false);
  const [result, setResult] = React.useState<SaengbuAnalysisResponse | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const charCount = text.trim().length;
  const canSubmit = consent && charCount >= MIN_CHARS && charCount <= MAX_CHARS && !submitting;

  function handleFile(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".txt")) {
      setError("현재 .txt 파일만 지원해요. 생기부 PDF는 열어서 전체 텍스트를 복사해 붙여넣어주세요.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setText(String(reader.result ?? "").slice(0, MAX_CHARS));
      setFileName(file.name);
      setError(null);
    };
    reader.onerror = () => setError("파일을 읽지 못했어요. 텍스트를 직접 붙여넣어주세요.");
    reader.readAsText(file, "utf-8");
  }

  async function handleSubmit(): Promise<void> {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const data = await fetchWithAuth<SaengbuAnalysisResponse>("/api/saengbu-analysis", {
        method: "POST",
        body: JSON.stringify({
          text: text.trim(),
          focusMajor: focusMajor.trim() || undefined,
          consent: true,
        }),
      });
      setResult(data);
      requestAnimationFrame(() => {
        document.getElementById("saengbu-result")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return <ResultView result={result} onReset={() => { setResult(null); setError(null); }} />;
  }

  return (
    <div className="flex flex-col gap-5">
      {/* 참고용 disclaimer (상단 고정) */}
      <DisclaimerBanner />

      {/* 목표 전공 (선택) */}
      <Card className="p-card-lg border-brand-200 bg-brand-50/20 dark:border-brand-900/40">
        <Label htmlFor="focus-major" className="text-xs">
          목표 전공/학과 (선택) — 입력 시 전공적합성 평가에 반영
        </Label>
        <Input
          id="focus-major"
          value={focusMajor}
          onChange={(e) => setFocusMajor(e.target.value)}
          placeholder="예: 컴퓨터공학, 의예, 경영학"
          className="mt-1.5"
          maxLength={40}
          disabled={submitting}
        />
      </Card>

      {/* 생기부 입력 */}
      <Card className="p-card-lg flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Label htmlFor="saengbu-text" className="text-sm font-semibold">
            생기부 텍스트
          </Label>
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" accept=".txt,text/plain" onChange={handleFile} className="hidden" aria-hidden />
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={submitting}>
              <Upload className="h-3 w-3" /> .txt 불러오기
            </Button>
          </div>
        </div>
        <textarea
          id="saengbu-text"
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
          placeholder="NEIS에서 발급한 생기부 PDF를 열어 전체 텍스트를 복사해 붙여넣어주세요. (창의적 체험활동·세특·행특 등 전체)"
          rows={12}
          disabled={submitting}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 resize-y"
        />
        <div className="flex items-center justify-between text-2xs text-muted-foreground">
          <span>{fileName ? `불러옴: ${fileName}` : "PDF는 텍스트 복사 후 붙여넣기 권장"}</span>
          <span className={charCount > MAX_CHARS ? "text-rose-600" : ""}>
            {charCount.toLocaleString()} / {MAX_CHARS.toLocaleString()}자
            {charCount > 0 && charCount < MIN_CHARS && ` (최소 ${MIN_CHARS}자)`}
          </span>
        </div>
      </Card>

      {/* 개인정보 동의 게이트 (필수) */}
      <Card className="p-card-lg border-amber-200 bg-amber-50/30 dark:border-amber-900/40 dark:bg-amber-900/10">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            disabled={submitting}
            className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600"
            data-element="consent-checkbox"
          />
          <span className="text-xs text-foreground/90 break-keep-all leading-relaxed">
            <strong className="font-semibold">[필수] 개인정보 처리 동의.</strong> 생기부 분석을 위해 입력하신
            텍스트가 AI(Anthropic Claude) API로 전송·처리됩니다. <strong>생기부 원문은 서버에 저장되지 않으며
            (일회성 분석)</strong>, 분석 결과만 비용 절감을 위해 익명 해시 기반으로 임시 보관될 수 있습니다.
            민감정보(주민등록번호 등)는 입력하지 마세요. 자세한 내용은{" "}
            <a href="/privacy" target="_blank" rel="noopener" className="underline text-brand-700 dark:text-brand-300">
              개인정보처리방침
            </a>
            을 따릅니다.
          </span>
        </label>
      </Card>

      {error && (
        <Card className="p-card-lg border-destructive/30 bg-destructive/5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground flex-1">{error}</p>
          </div>
        </Card>
      )}

      <Button onClick={() => void handleSubmit()} disabled={!canSubmit} size="lg" className="self-start">
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {submitting ? "AI 분석 중… (15~30초)" : "생기부 분석하기"}
      </Button>
      {!consent && (
        <p className="text-2xs text-muted-foreground -mt-3 flex items-center gap-1">
          <Lock className="h-3 w-3" aria-hidden /> 분석하려면 개인정보 처리에 동의해주세요.
        </p>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   결과
   ═══════════════════════════════════════════════════════════════════════ */

function DisclaimerBanner(): React.ReactElement {
  return (
    <Card className="p-card-lg border-amber-200 bg-amber-50/40 dark:border-amber-900/40 dark:bg-amber-900/15">
      <div className="flex items-start gap-3">
        <ShieldAlert className="h-4 w-4 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground break-keep-all leading-relaxed">
          <strong className="text-foreground font-medium">참고용 분석입니다.</strong> AI 분석은 생기부의 정성
          요소를 참고용으로 평가할 뿐, <strong>실제 입시 결과·합격을 보장하지 않습니다.</strong> 점수는 합격
          가능성이 아닌 역량 루브릭(0~100)이며, 최종 판단은 학교·전문 입시 컨설팅과 함께하세요.
        </p>
      </div>
    </Card>
  );
}

function ResultView({
  result,
  onReset,
}: {
  result: SaengbuAnalysisResponse;
  onReset: () => void;
}): React.ReactElement {
  return (
    <div id="saengbu-result" className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-foreground">생기부 분석 결과</h2>
          <p className="text-2xs text-muted-foreground/70 mt-0.5">
            출처: {result.source === "anthropic" ? "Claude API" : "Mock (정형 가이드)"}
            {result.cached && " · 캐시(재분석, 신규 토큰 0)"}
            {!result.cached && ` · 토큰 ${result.usage.inputTokens + result.usage.outputTokens} 사용`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onReset}>
          <ArrowLeft className="h-3.5 w-3.5" /> 다시 분석
        </Button>
      </div>

      <DisclaimerBanner />

      {result.source === "mock" && (
        <Card className="p-card-lg border-amber-200 bg-amber-50/40 dark:border-amber-900/40 dark:bg-amber-900/15">
          <div className="flex items-start gap-3">
            <ShieldAlert className="h-4 w-4 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground break-keep-all leading-relaxed">
              <strong className="text-foreground font-medium">현재 Mock 응답 모드.</strong> ANTHROPIC_API_KEY 가
              등록되지 않아 점수를 산출하지 않습니다(추측치 미생성). 키 등록 시 실제 5축 분석이 활성화됩니다.
            </p>
          </div>
        </Card>
      )}

      {/* 5축 */}
      <section aria-label="5축 루브릭">
        <h3 className="text-sm font-semibold text-foreground mb-3">학종 5축 루브릭 (참고용 0~100)</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {result.axes.map((a) => (
            <AxisCard key={a.axis} axis={a} />
          ))}
        </div>
      </section>

      {result.majorFit && (
        <Card className="p-card-lg border-brand-200 bg-brand-50/30 dark:border-brand-900/40 dark:bg-brand-950/15">
          <h3 className="text-sm font-semibold text-foreground mb-1.5 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand-600" /> 목표 전공 적합성 — {result.majorFit.major}
          </h3>
          <p className="text-xs text-muted-foreground break-keep-all leading-relaxed">{result.majorFit.comment}</p>
        </Card>
      )}

      {result.strengths.length > 0 && (
        <ListSection title="강점" icon={<TrendingUp className="h-4 w-4" />} tone="emerald" items={result.strengths} />
      )}
      {result.weaknesses.length > 0 && (
        <ListSection title="약점·보완점" icon={<TrendingDown className="h-4 w-4" />} tone="amber" items={result.weaknesses} />
      )}
      {result.recommendations.length > 0 && (
        <ListSection title="추천 보강 액션" icon={<Lightbulb className="h-4 w-4" />} tone="mint" items={result.recommendations} />
      )}

      {result.caveats.length > 0 && (
        <Card className="p-card-lg border-amber-200 bg-amber-50/30 dark:border-amber-900/40 dark:bg-amber-900/10">
          <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-300" /> 정직성·윤리 안내
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

function AxisCard({ axis }: { axis: SaengbuAnalysisResponse["axes"][number] }): React.ReactElement {
  const label = AXIS_LABEL[axis.axis] ?? axis.axis;
  const isInsufficient = axis.score === null;
  return (
    <Card className="p-card-lg flex flex-col gap-2" data-element="axis-card" data-axis={axis.axis}>
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold text-foreground">{label}</h4>
        {isInsufficient ? (
          <span className="text-2xs font-medium rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-2 py-0.5">
            정보 부족
          </span>
        ) : (
          <span className="text-lg font-bold tabular-nums text-foreground">
            {axis.score}
            <span className="text-xs text-muted-foreground">/100</span>
          </span>
        )}
      </div>
      {!isInsufficient && (
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-brand-500" style={{ width: `${axis.score ?? 0}%` }} />
        </div>
      )}
      <p className="text-xs text-muted-foreground break-keep-all leading-relaxed">{axis.comment}</p>
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
      <h3 className={`text-sm font-semibold mb-2 flex items-center gap-2 ${ICON_TONE[tone]}`}>
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
