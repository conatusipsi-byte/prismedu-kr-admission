"use client";

/**
 * CompareView — /compare Pro UI (Client)
 *
 * 흐름:
 *   1. 학과 검색바 + 선택 (최대 4개)
 *   2. 선택된 학과의 트랙 선택 (각 학과당 1개)
 *   3. "비교 시작" → POST /api/compare
 *   4. 비교 테이블 (학과 columns, metric rows)
 *
 * URL 쿼리 ?baseSpecId=match_xxx — 분석 결과 페이지에서 진입 시 합격률도 함께 표시.
 *
 * 정직성 (P-001):
 *   - 표본 부족 학과는 probability=null + sampleSufficient=false 라벨
 *   - jaeoegukmin 트랙은 비교 불가 (서버 400)
 */

import * as React from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Loader2,
  Plus,
  Search,
  X,
} from "lucide-react";
import { fetchWithAuth, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  AdmissionTrackKind,
  Department,
  University,
} from "@/types/admission";

interface SearchResultItem {
  department: Department;
  university: University;
  sampleSufficient: boolean;
  availableTracks: AdmissionTrackKind[];
}

interface SelectedItem {
  universityId: string;
  universityName: string;
  departmentId: string;
  departmentName: string;
  trackKind: AdmissionTrackKind;
  availableTracks: AdmissionTrackKind[];
}

interface CompareItemResponse {
  universityId: string;
  universityName: string;
  universityCategory?: string;
  departmentId: string;
  departmentName: string;
  trackKind: AdmissionTrackKind;
  trackName: string;
  quotaInitial: number;
  quotaFinal: number | null;
  csatMinimum: unknown;
  reflectionRatio: unknown;
  schedule: { applicationStart?: string; applicationEnd?: string; announcementDate?: string } | null;
  notes: string | null;
  prevYearResult: {
    competitionRate?: number;
    cutoff70?: number;
    cutoff50?: number;
    gradeCutoff70?: number;
    gradeCutoffAvg?: number;
  } | null;
  sampleStats: {
    acceptedCount: number;
    weightedCount: number;
    stage1PassedCount: number | null;
    stage2AcceptedCount: number | null;
  } | null;
  probability: {
    category: "reach" | "hard_target" | "target" | "safety" | "insufficient_sample";
    probability: number | null;
    low: number | null;
    high: number | null;
    sampleSufficient: boolean;
    sampleN: number;
    weightedSampleN: number;
    caveats: string[];
  } | null;
  error?: string;
}

interface CompareResponse {
  baseSpecId: string | null;
  hasBaseSpec: boolean;
  year: number;
  items: CompareItemResponse[];
  globalCaveats: string[];
}

const TRACK_LABEL: Record<AdmissionTrackKind, string> = {
  susi_subject: "학생부교과",
  susi_comprehensive: "학생부종합",
  susi_essay: "논술",
  susi_practical: "실기",
  jeongsi_ga: "정시 가군",
  jeongsi_na: "정시 나군",
  jeongsi_da: "정시 다군",
  additional: "추가모집",
  jaeoegukmin: "재외국민·외국인",
};

const CATEGORY_LABEL: Record<string, { label: string; cls: string }> = {
  safety: { label: "안정", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" },
  target: { label: "적정", cls: "bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300" },
  hard_target: { label: "도전", cls: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" },
  reach: { label: "상향", cls: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" },
  insufficient_sample: { label: "표본 부족", cls: "bg-muted text-muted-foreground" },
};

const MAX_ITEMS = 4;
const MIN_ITEMS = 2;

export function CompareView(): React.ReactElement {
  const searchParams = useSearchParams();
  const baseSpecId = searchParams.get("baseSpecId") ?? undefined;

  const [items, setItems] = React.useState<SelectedItem[]>([]);
  const [result, setResult] = React.useState<CompareResponse | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const canCompare = items.length >= MIN_ITEMS;

  function addItem(item: SelectedItem) {
    setError(null);
    setResult(null);
    if (items.length >= MAX_ITEMS) return;
    if (
      items.some(
        (i) => i.universityId === item.universityId && i.departmentId === item.departmentId,
      )
    ) {
      setError("이미 선택된 학과입니다.");
      return;
    }
    setItems((prev) => [...prev, item]);
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
    setResult(null);
  }

  function changeTrack(idx: number, trackKind: AdmissionTrackKind) {
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, trackKind } : it)),
    );
    setResult(null);
  }

  async function handleCompare() {
    if (items.length < MIN_ITEMS) return;
    setSubmitting(true);
    setError(null);
    try {
      const body = {
        items: items.map((it) => ({
          universityId: it.universityId,
          departmentId: it.departmentId,
          trackKind: it.trackKind,
        })),
        baseSpecId,
      };
      const data = await fetchWithAuth<CompareResponse>("/api/compare", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setResult(data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {baseSpecId && (
        <Card className="p-card-lg border-brand-200 bg-brand-50/30 dark:border-brand-900/40 dark:bg-brand-950/15">
          <p className="text-xs text-foreground">
            ✓ 분석 결과 (<code className="font-mono text-2xs">{baseSpecId}</code>) 와 함께 합격률 비교 모드
          </p>
        </Card>
      )}

      {/* 선택 */}
      <section aria-label="학과 선택">
        <h2 className="text-sm font-semibold text-foreground mb-3">
          비교할 학과 ({items.length}/{MAX_ITEMS}, 최소 {MIN_ITEMS}개)
        </h2>

        {items.length > 0 && (
          <ul className="flex flex-col gap-2 mb-3">
            {items.map((it, idx) => (
              <SelectedRow
                key={`${it.universityId}_${it.departmentId}`}
                item={it}
                onRemove={() => removeItem(idx)}
                onChangeTrack={(t) => changeTrack(idx, t)}
              />
            ))}
          </ul>
        )}

        {items.length < MAX_ITEMS && (
          <DepartmentSearchBox onAdd={addItem} disabled={submitting} />
        )}
      </section>

      {error && (
        <Card className="p-card-lg border-destructive/30 bg-destructive/5">
          <p className="text-sm text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </p>
        </Card>
      )}

      <Button
        size="lg"
        disabled={!canCompare || submitting}
        onClick={() => void handleCompare()}
        className="bg-brand-600 hover:bg-brand-700 self-start"
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> 비교 중…
          </>
        ) : (
          <>
            비교 시작 <ArrowRight className="h-4 w-4" />
          </>
        )}
      </Button>

      {result && <CompareTable result={result} />}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   학과 검색 박스
   ═══════════════════════════════════════════════════════════════════════ */

function DepartmentSearchBox({
  onAdd,
  disabled,
}: {
  onAdd: (item: SelectedItem) => void;
  disabled?: boolean;
}): React.ReactElement {
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SearchResultItem[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  const [debouncedQuery, setDebouncedQuery] = React.useState("");
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  React.useEffect(() => {
    if (debouncedQuery.trim().length === 0) {
      setResults([]);
      return;
    }
    let aborted = false;
    setSearching(true);
    const params = new URLSearchParams();
    params.set("q", debouncedQuery);
    params.set("limit", "8");

    fetch(`/api/admissions/search?${params.toString()}`)
      .then(async (res) => {
        if (aborted) return;
        if (!res.ok) throw new Error(`검색 실패 (${res.status})`);
        const data = (await res.json()) as { results?: SearchResultItem[] };
        setResults(data.results ?? []);
        setOpen(true);
      })
      .catch(() => {
        if (!aborted) setResults([]);
      })
      .finally(() => {
        if (!aborted) setSearching(false);
      });
    return () => {
      aborted = true;
    };
  }, [debouncedQuery]);

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="대학·학과 검색 (예: 서울대 의예)"
          className="pl-9"
          disabled={disabled}
        />
        {searching && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {open && results.length > 0 && (
        <Card className="absolute z-10 mt-1 w-full max-h-72 overflow-auto p-1 shadow-lg">
          <ul>
            {results.map((r) => {
              const tracks = (r.availableTracks ?? []).filter((t) => t !== "jaeoegukmin");
              const disabled = tracks.length === 0;
              return (
                <li key={`${r.university.id}_${r.department.id}`}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      if (disabled) return;
                      onAdd({
                        universityId: r.university.id,
                        universityName: r.university.n,
                        departmentId: r.department.id,
                        departmentName: r.department.name,
                        trackKind: tracks[0],
                        availableTracks: tracks,
                      });
                      setQuery("");
                      setResults([]);
                      setOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 rounded-md hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <p className="text-sm font-medium text-foreground">
                      {r.university.n} {r.department.name}
                    </p>
                    <p className="text-2xs text-muted-foreground mt-0.5">
                      {disabled
                        ? "비교 가능한 트랙 없음 (재외국민 전용)"
                        : `${tracks.length}개 트랙 운영`}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {open && debouncedQuery && !searching && results.length === 0 && (
        <Card className="absolute z-10 mt-1 w-full p-3 shadow-lg">
          <p className="text-xs text-muted-foreground">결과 없음</p>
        </Card>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   선택된 학과 행 + 트랙 선택
   ═══════════════════════════════════════════════════════════════════════ */

function SelectedRow({
  item,
  onRemove,
  onChangeTrack,
}: {
  item: SelectedItem;
  onRemove: () => void;
  onChangeTrack: (trackKind: AdmissionTrackKind) => void;
}): React.ReactElement {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {item.universityName} {item.departmentName}
        </p>
      </div>
      <Select
        value={item.trackKind}
        onValueChange={(v) => onChangeTrack(v as AdmissionTrackKind)}
      >
        <SelectTrigger className="w-32 h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {item.availableTracks.map((t) => (
            <SelectItem key={t} value={t}>
              {TRACK_LABEL[t]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <button
        type="button"
        onClick={onRemove}
        aria-label="제거"
        className="p-1 text-muted-foreground hover:text-destructive transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </li>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   비교 테이블
   ═══════════════════════════════════════════════════════════════════════ */

function CompareTable({ result }: { result: CompareResponse }): React.ReactElement {
  const ok = result.items.filter((i): i is CompareItemResponse & { error?: undefined } => !i.error);
  const failed = result.items.filter((i) => i.error);

  if (ok.length === 0) {
    return (
      <Card className="p-card-lg border-amber-200 bg-amber-50/40">
        <p className="text-sm text-amber-900 dark:text-amber-200">
          비교 가능한 학과가 없습니다. 모집요강이 등록되지 않았거나 트랙 매칭 실패.
        </p>
      </Card>
    );
  }

  return (
    <section aria-label="비교 결과" className="flex flex-col gap-4">
      <h2 className="text-lg font-bold text-foreground">
        비교 결과 ({ok.length}개)
        <span className="ml-2 text-2xs text-muted-foreground">
          {result.year}학년도 모집요강 기준
        </span>
      </h2>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b">
                <th className="sticky left-0 bg-card text-left p-3 font-medium text-xs text-muted-foreground min-w-[120px]">
                  항목
                </th>
                {ok.map((it) => (
                  <th
                    key={`${it.universityId}_${it.departmentId}_${it.trackKind}`}
                    className="text-left p-3 font-semibold text-foreground min-w-[180px] border-l"
                  >
                    <div className="text-2xs text-muted-foreground font-normal">
                      {it.universityName}
                    </div>
                    <div className="text-sm">{it.departmentName}</div>
                    <div className="text-2xs text-muted-foreground mt-1">
                      {it.trackName} ({TRACK_LABEL[it.trackKind]})
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-xs">
              {result.hasBaseSpec && (
                <Row label="합격 가능성">
                  {ok.map((it) => (
                    <Cell key={`prob_${it.universityId}_${it.departmentId}`}>
                      <ProbCell prob={it.probability} />
                    </Cell>
                  ))}
                </Row>
              )}
              <Row label="모집인원 (당초)">
                {ok.map((it) => (
                  <Cell key={`q_${it.universityId}`}>
                    <span className="tabular-nums font-semibold">
                      {it.quotaInitial}명
                    </span>
                    {it.quotaFinal != null && it.quotaFinal !== it.quotaInitial && (
                      <span className="block text-2xs text-muted-foreground">
                        최종 {it.quotaFinal}명
                      </span>
                    )}
                  </Cell>
                ))}
              </Row>
              <Row label="전년 경쟁률">
                {ok.map((it) => (
                  <Cell key={`cr_${it.universityId}`}>
                    {it.prevYearResult?.competitionRate != null
                      ? `${it.prevYearResult.competitionRate.toFixed(1)} : 1`
                      : <span className="text-muted-foreground">—</span>}
                  </Cell>
                ))}
              </Row>
              <Row label="전년 컷 (등급)">
                {ok.map((it) => (
                  <Cell key={`gc_${it.universityId}`}>
                    {it.prevYearResult?.gradeCutoff70 != null
                      ? `${it.prevYearResult.gradeCutoff70.toFixed(2)}등급 (70%)`
                      : it.prevYearResult?.gradeCutoffAvg != null
                        ? `${it.prevYearResult.gradeCutoffAvg.toFixed(2)}등급 (평균)`
                        : <span className="text-muted-foreground">—</span>}
                  </Cell>
                ))}
              </Row>
              <Row label="전년 컷 (점수)">
                {ok.map((it) => (
                  <Cell key={`pc_${it.universityId}`}>
                    {it.prevYearResult?.cutoff70 != null
                      ? `${it.prevYearResult.cutoff70} (70%)`
                      : it.prevYearResult?.cutoff50 != null
                        ? `${it.prevYearResult.cutoff50} (50%)`
                        : <span className="text-muted-foreground">—</span>}
                  </Cell>
                ))}
              </Row>
              <Row label="합격 사례 표본">
                {ok.map((it) => (
                  <Cell key={`s_${it.universityId}`}>
                    {it.sampleStats ? (
                      <>
                        <span className="tabular-nums">
                          {it.sampleStats.acceptedCount}건
                        </span>
                        <span className="block text-2xs text-muted-foreground">
                          가중 {it.sampleStats.weightedCount.toFixed(1)}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">미수집</span>
                    )}
                  </Cell>
                ))}
              </Row>
              <Row label="원서 마감">
                {ok.map((it) => (
                  <Cell key={`d_${it.universityId}`}>
                    {it.schedule?.applicationEnd ?? <span className="text-muted-foreground">—</span>}
                  </Cell>
                ))}
              </Row>
            </tbody>
          </table>
        </div>
      </Card>

      {failed.length > 0 && (
        <Card className="p-card-lg border-amber-200 bg-amber-50/30 dark:border-amber-900/40 dark:bg-amber-900/10">
          <h3 className="text-sm font-semibold mb-2 text-amber-900 dark:text-amber-200">
            ⚠️ 비교 실패 ({failed.length}건)
          </h3>
          <ul className="text-xs space-y-1 text-amber-800 dark:text-amber-300">
            {failed.map((f) => (
              <li key={`${f.universityId}_${f.departmentId}_${f.trackKind}`}>
                {f.universityId} {f.departmentId} ({TRACK_LABEL[f.trackKind]}): {f.error}
              </li>
            ))}
          </ul>
        </Card>
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
    </section>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <tr className="border-b border-border/40 last:border-0">
      <td className="sticky left-0 bg-muted/30 p-3 font-medium text-muted-foreground text-2xs whitespace-nowrap">
        {label}
      </td>
      {children}
    </tr>
  );
}

function Cell({ children }: { children: React.ReactNode }): React.ReactElement {
  return <td className="p-3 border-l text-foreground">{children}</td>;
}

function ProbCell({
  prob,
}: {
  prob: CompareItemResponse["probability"];
}): React.ReactElement {
  if (!prob) return <span className="text-muted-foreground">—</span>;
  if (!prob.sampleSufficient || prob.probability == null) {
    const meta = CATEGORY_LABEL.insufficient_sample;
    return (
      <span className={`inline-flex rounded-full px-2 py-0.5 text-2xs font-medium ${meta.cls}`}>
        {meta.label}
      </span>
    );
  }
  const meta = CATEGORY_LABEL[prob.category] ?? CATEGORY_LABEL.target;
  return (
    <div>
      <span className={`inline-flex rounded-full px-2 py-0.5 text-2xs font-medium ${meta.cls}`}>
        {meta.label}
      </span>
      <div className="tabular-nums text-sm font-semibold mt-1">
        {Math.round(prob.probability)}%
      </div>
      {prob.low != null && prob.high != null && (
        <div className="text-2xs text-muted-foreground">
          {Math.round(prob.low)}~{Math.round(prob.high)}%
        </div>
      )}
    </div>
  );
}
