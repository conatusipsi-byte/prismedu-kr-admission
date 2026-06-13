"use client";

/**
 * CsatMinChecker — 수능최저학력기준 "충족 여부" 사실 판정 (학과 상세).
 *
 * 정직성 (P-002):
 *   - 합격 "확률"이 아니라 수능최저 "충족/미충족"이라는 결정적 사실 판정.
 *     (합격률 플래그와 무관하게 항상 제공 — feature-flags.ts 와 별개)
 *   - autoEvaluable=true(simple_sum/avg) 만 자동 판정. 복잡 케이스(계열별 차등·포함 조건 등)는
 *     임의 판정하지 않고 모집요강 원문 그대로 노출.
 *   - "충족 ≠ 합격" 명시 — 수능최저는 지원 자격선일 뿐.
 *
 * 데이터: 모집요강 csatMinimum (보유). 로직: lib/admission/min-req-classifier(재사용).
 * 학생 수능 등급은 인라인 입력 + localStorage 저장(학과 간 유지). 서버 호출 없음(순수 계산).
 */

import * as React from "react";
import { Check, X, FileText, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { evaluateMinReq, minReqDisplayText } from "@/lib/admission/min-req-classifier";
import type { AdmissionTrackKind, CsatMinimum, CsatScore, Grade } from "@/types/admission";
import { TRACK_KIND_LABELS } from "@/lib/admission/labels";

export interface CsatMinTrack {
  kind: AdmissionTrackKind;
  name: string;
  csatMinimum?: CsatMinimum | null;
}

interface GradeState {
  korean: Grade | null;
  math: Grade | null;
  english: Grade | null;
  inv1: Grade | null;
  inv2: Grade | null;
  history: Grade | null;
}

const EMPTY: GradeState = { korean: null, math: null, english: null, inv1: null, inv2: null, history: null };
const STORAGE_KEY = "conatus.csatGrades.v1";

const FIELDS: { key: keyof GradeState; label: string; required: boolean }[] = [
  { key: "korean", label: "국어", required: true },
  { key: "math", label: "수학", required: true },
  { key: "english", label: "영어", required: true },
  { key: "inv1", label: "탐구1", required: true },
  { key: "inv2", label: "탐구2", required: false },
  { key: "history", label: "한국사", required: true },
];

/** 필수 5개(+탐구1) 입력되면 판정 가능 */
function buildCsat(g: GradeState): CsatScore | null {
  if (g.korean == null || g.math == null || g.english == null || g.history == null || g.inv1 == null) {
    return null;
  }
  const investigation = [g.inv1, g.inv2]
    .filter((x): x is Grade => x != null)
    .map((grade) => ({ grade, course: "", type: "social" as const }));
  return {
    actual: true,
    takenAt: "",
    korean: { grade: g.korean },
    math: { grade: g.math },
    english: { grade: g.english },
    history: { grade: g.history },
    investigation,
  };
}

export function CsatMinChecker({ tracks }: { tracks: CsatMinTrack[] }): React.ReactElement {
  const [grades, setGrades] = React.useState<GradeState>(EMPTY);

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setGrades({ ...EMPTY, ...(JSON.parse(raw) as Partial<GradeState>) });
    } catch { /* ignore */ }
  }, []);

  const setGrade = (key: keyof GradeState, val: Grade | null) => {
    setGrades((prev) => {
      const next = { ...prev, [key]: val };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const csat = buildCsat(grades);
  const complete = csat != null;
  const withMin = tracks.filter((t) => t.csatMinimum);

  return (
    <section
      id="csat-min"
      data-section="csat-min"
      data-component="csat-min-checker"
      className="rounded-3xl border border-border bg-card p-6 lg:p-7"
    >
      <div className="mb-1 flex items-center gap-2">
        <h2 className="text-base font-bold tracking-tight">수능최저 충족 판정</h2>
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-2xs font-semibold text-emerald-700 ring-1 ring-emerald-200/70 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800/50">
          사실 판정
        </span>
      </div>
      <p className="mb-4 text-xs text-muted-foreground break-keep-all leading-relaxed">
        내 수능 등급을 입력하면 전형별 수능최저학력기준 충족 여부를 <strong className="text-foreground">정확히</strong> 알려드려요.
        (추정 아님 · <strong className="text-foreground">충족이 합격을 보장하지는 않습니다</strong> — 자격선)
      </p>

      {/* 등급 입력 */}
      <div className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {FIELDS.map((f) => (
          <label key={f.key} className="flex flex-col gap-1">
            <span className="text-2xs font-semibold text-muted-foreground">
              {f.label}{f.required && <span className="text-rose-500">*</span>}
            </span>
            <select
              value={grades[f.key] ?? ""}
              onChange={(e) => setGrade(f.key, e.target.value ? (Number(e.target.value) as Grade) : null)}
              data-grade-field={f.key}
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
            >
              <option value="">—</option>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((g) => (
                <option key={g} value={g}>{g}등급</option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {!complete && (
        <p className="mb-4 flex items-center gap-1.5 text-2xs text-amber-700 dark:text-amber-400">
          <Info className="h-3 w-3 shrink-0" aria-hidden />
          필수 영역(국·수·영·탐구1·한국사)을 입력하면 충족 여부가 표시됩니다.
        </p>
      )}

      {/* 전형별 판정 */}
      {withMin.length === 0 ? (
        <p className="text-sm text-muted-foreground break-keep-all">
          이 학과의 등록된 전형에는 수능최저학력기준이 없습니다. (수능최저 미적용)
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {withMin.map((t, i) => (
            <CsatMinRow key={`${t.kind}-${i}`} track={t} csat={csat} />
          ))}
        </ul>
      )}

      <p className="mt-4 flex items-start gap-1.5 border-t border-border/60 pt-3 text-2xs text-muted-foreground break-keep-all leading-relaxed">
        <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" aria-hidden />
        수능최저 충족 여부는 모집요강 기준에 따른 <strong className="text-foreground/80">정확한 사실 판정</strong>입니다.
        복잡한 기준(계열별 차등 등)은 자동 판정하지 않고 원문을 그대로 보여드려요.
      </p>
    </section>
  );
}

function CsatMinRow({ track, csat }: { track: CsatMinTrack; csat: CsatScore | null }): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  const min = track.csatMinimum!;
  const label = `${TRACK_KIND_LABELS[track.kind]} · ${track.name}`;

  // 복잡 케이스 — 자동 판정 X, 원문만
  if (!min.autoEvaluable) {
    return (
      <li className="rounded-2xl border border-border bg-background p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-sm font-semibold">{label}</span>
          <StatusChip tone="neutral" icon={<FileText className="h-3 w-3" />}>원문 확인</StatusChip>
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="mt-1 text-2xs text-iris-700 hover:underline dark:text-iris-300"
        >
          {open ? "기준 원문 접기" : "수능최저 기준이 복잡해요 — 원문 보기"}
        </button>
        {open && (
          <p className="mt-1.5 rounded-lg bg-muted/40 p-2 text-2xs text-muted-foreground break-keep-all leading-relaxed">
            {min.originalText || "원문 정보가 없습니다."}
          </p>
        )}
      </li>
    );
  }

  const result = csat ? evaluateMinReq(min, csat) : undefined;
  const display = minReqDisplayText(min, result);

  let tone: ChipTone = "neutral";
  let chipLabel = "성적 입력 시 판정";
  let icon = <Info className="h-3 w-3" />;
  if (result?.evaluable) {
    if (result.met) { tone = "ok"; chipLabel = "충족"; icon = <Check className="h-3 w-3" />; }
    else { tone = "fail"; chipLabel = "미충족"; icon = <X className="h-3 w-3" />; }
  } else if (result && !result.evaluable && result.reason === "missing_score") {
    tone = "warn"; chipLabel = "일부 영역 미입력"; icon = <Info className="h-3 w-3" />;
  }

  return (
    <li className="rounded-2xl border border-border bg-background p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-semibold">{label}</span>
        <StatusChip tone={tone} icon={icon}>{chipLabel}</StatusChip>
      </div>
      <p className="mt-1 text-2xs text-muted-foreground break-keep-all">
        {result?.evaluable ? display.headline : min.originalText}
      </p>
    </li>
  );
}

type ChipTone = "ok" | "fail" | "warn" | "neutral";
const TONE_CLS: Record<ChipTone, string> = {
  ok: "bg-emerald-50 text-emerald-700 ring-emerald-200/70 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800/50",
  fail: "bg-rose-50 text-rose-700 ring-rose-200/70 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-800/50",
  warn: "bg-amber-50 text-amber-700 ring-amber-200/70 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800/50",
  neutral: "bg-muted text-muted-foreground ring-border",
};

function StatusChip({ tone, icon, children }: { tone: ChipTone; icon: React.ReactNode; children: React.ReactNode }): React.ReactElement {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-bold ring-1", TONE_CLS[tone])}>
      {icon}
      {children}
    </span>
  );
}
