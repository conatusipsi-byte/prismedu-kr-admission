"use client";

/**
 * PlannerView — /planner Pro UI (Client)
 *
 * GET /api/planner → task 자동 생성 결과 + 완료 상태 머지.
 * PATCH /api/planner → 완료 토글.
 *
 * 표시 흐름:
 *   1. 카테고리별 그룹 (수능·내신·원서·면접·논술·실기·자료준비)
 *   2. 각 task 의 D-Day (오늘 기준)
 *   3. 체크박스 — 낙관 업데이트 + 실패 시 롤백
 *
 * intent 미작성 (empty=true): "분석 폼 → 의향 입력" 안내 카드.
 */

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Circle,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { fetchWithAuth, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { PlannerCategory, PlannerTask } from "@/lib/schemas/api/planner";

interface ApiResponse {
  tasks: PlannerTask[];
  generatedAt: string;
  empty: boolean;
}

const CATEGORY_LABEL: Record<PlannerCategory, { label: string; tone: string }> = {
  csat: { label: "수능 준비", tone: "border-rose-300 bg-rose-50/40 dark:border-rose-900/40 dark:bg-rose-950/15" },
  naesin: { label: "내신 관리", tone: "border-amber-300 bg-amber-50/40 dark:border-amber-900/40 dark:bg-amber-950/15" },
  application: { label: "원서접수", tone: "border-mint-300 bg-mint-50/40 dark:border-mint-800 dark:bg-mint-950/30" },
  interview: { label: "면접", tone: "border-violet-300 bg-violet-50/40 dark:border-violet-900/40 dark:bg-violet-950/15" },
  essay: { label: "논술", tone: "border-blue-300 bg-blue-50/40 dark:border-blue-900/40 dark:bg-blue-950/15" },
  practical: { label: "실기", tone: "border-emerald-300 bg-emerald-50/40 dark:border-emerald-900/40 dark:bg-emerald-950/15" },
  documents: { label: "자료준비", tone: "border-border bg-card" },
};

const CATEGORY_ORDER: PlannerCategory[] = [
  "application",
  "documents",
  "interview",
  "essay",
  "practical",
  "csat",
  "naesin",
];

export function PlannerView(): React.ReactElement {
  const [data, setData] = React.useState<ApiResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<Set<string>>(new Set());

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth<ApiResponse>("/api/planner");
      setData(res);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchData();
  }, [fetchData]);

  async function toggleTask(taskId: string, nextCompleted: boolean) {
    if (!data) return;
    // 낙관 업데이트
    setData((prev) =>
      prev
        ? {
            ...prev,
            tasks: prev.tasks.map((t) =>
              t.id === taskId ? { ...t, completed: nextCompleted } : t,
            ),
          }
        : prev,
    );
    setPending((s) => new Set(s).add(taskId));

    try {
      await fetchWithAuth("/api/planner", {
        method: "PATCH",
        body: JSON.stringify({ taskId, completed: nextCompleted }),
      });
    } catch (e) {
      // 롤백
      setData((prev) =>
        prev
          ? {
              ...prev,
              tasks: prev.tasks.map((t) =>
                t.id === taskId ? { ...t, completed: !nextCompleted } : t,
              ),
            }
          : prev,
      );
      setError(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setPending((s) => {
        const next = new Set(s);
        next.delete(taskId);
        return next;
      });
    }
  }

  if (loading && !data) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
        <Loader2 className="h-4 w-4 animate-spin" /> 플래너 로드 중…
      </div>
    );
  }

  if (error) {
    return (
      <Card className="p-card-lg border-destructive/30 bg-destructive/5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-destructive">조회 실패</p>
            <p className="text-xs text-muted-foreground mt-1">{error}</p>
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={() => void fetchData()}
            >
              <RefreshCw className="h-3.5 w-3.5" /> 다시 시도
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  if (!data || data.empty) {
    return <EmptyState />;
  }

  const totalTasks = data.tasks.length;
  const completedTasks = data.tasks.filter((t) => t.completed).length;
  const pct = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

  // 카테고리별 그룹
  const grouped = new Map<PlannerCategory, PlannerTask[]>();
  for (const t of data.tasks) {
    const list = grouped.get(t.category) ?? [];
    list.push(t);
    grouped.set(t.category, list);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* 진척도 */}
      <Card className="p-card-lg">
        <div className="flex items-baseline justify-between flex-wrap gap-2 mb-3">
          <h2 className="text-base font-semibold text-foreground">전체 진척도</h2>
          <p className="text-sm text-muted-foreground tabular-nums">
            <span className="font-bold text-foreground">{completedTasks}</span> /{" "}
            {totalTasks} 완료 ({pct}%)
          </p>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-mint-500 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-2xs text-muted-foreground/70 mt-3">
          {new Date(data.generatedAt).toLocaleString("ko-KR", {
            timeZone: "Asia/Seoul",
            dateStyle: "short",
            timeStyle: "short",
          })}{" "}
          기준 · 완료 처리는 본인 계정에 즉시 저장됩니다.
        </p>
      </Card>

      {/* 카테고리별 task */}
      {CATEGORY_ORDER.map((cat) => {
        const tasks = grouped.get(cat);
        if (!tasks || tasks.length === 0) return null;
        const meta = CATEGORY_LABEL[cat];
        return (
          <section key={cat} aria-label={meta.label}>
            <h2 className="text-sm font-semibold text-foreground mb-3 flex items-baseline gap-2">
              {meta.label}
              <span className="text-2xs text-muted-foreground">
                ({tasks.filter((t) => t.completed).length}/{tasks.length})
              </span>
            </h2>
            <Card className={`p-0 border ${meta.tone}`}>
              <ul>
                {tasks.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    pending={pending.has(t.id)}
                    onToggle={(c) => void toggleTask(t.id, c)}
                  />
                ))}
              </ul>
            </Card>
          </section>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   하위 컴포넌트
   ═══════════════════════════════════════════════════════════════════════ */

function TaskRow({
  task,
  pending,
  onToggle,
}: {
  task: PlannerTask;
  pending: boolean;
  onToggle: (completed: boolean) => void;
}): React.ReactElement {
  const dDay = computeDDay(task.dueDate);
  const dDayLabel =
    dDay === 0
      ? "D-Day"
      : dDay > 0
        ? `D-${dDay}`
        : `D+${Math.abs(dDay)}`;
  const dDayTone =
    dDay < 0
      ? "text-muted-foreground"
      : dDay <= 7
        ? "text-rose-600 dark:text-rose-400 font-bold"
        : dDay <= 30
          ? "text-amber-700 dark:text-amber-400"
          : "text-muted-foreground";

  return (
    <li className="flex items-start gap-3 px-4 py-3 border-b border-border/40 last:border-0">
      <button
        type="button"
        disabled={pending}
        aria-label={task.completed ? "완료 취소" : "완료 표시"}
        onClick={() => onToggle(!task.completed)}
        className="mt-0.5 shrink-0 disabled:opacity-50 transition-opacity"
      >
        {pending ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : task.completed ? (
          <CheckCircle2 className="h-5 w-5 text-mint-600" />
        ) : (
          <Circle className="h-5 w-5 text-muted-foreground hover:text-foreground transition-colors" />
        )}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <p
            className={
              task.completed
                ? "text-sm line-through text-muted-foreground"
                : "text-sm font-medium text-foreground"
            }
          >
            {task.title}
          </p>
          <span className={`text-2xs tabular-nums ${dDayTone}`}>
            {dDayLabel} · {task.dueDate}
          </span>
        </div>
        {task.description && (
          <p className="text-xs text-muted-foreground mt-1 break-keep-all leading-relaxed">
            {task.description}
          </p>
        )}
      </div>
    </li>
  );
}

function EmptyState(): React.ReactElement {
  return (
    <Card className="p-card-lg">
      <div className="flex flex-col items-center text-center gap-3 py-8 max-w-md mx-auto">
        <div className="w-14 h-14 rounded-2xl bg-muted text-muted-foreground flex items-center justify-center">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-bold text-foreground">아직 plan 이 비어있어요</h2>
        <p className="text-sm text-muted-foreground break-keep-all leading-relaxed">
          분석 페이지에서 수시 6장 또는 정시 가/나/다군 의향을 입력하면, 표준 입시
          일정 기반으로 task 가 자동 생성됩니다.
        </p>
        <Button asChild size="lg" className="bg-mint-600 hover:bg-mint-700">
          <Link href="/analysis">
            분석 폼으로 가기
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    </Card>
  );
}

/** YYYY-MM-DD → 오늘 자정(KST) 기준 D-Day. 양수 = 미래, 음수 = 지난날짜 */
function computeDDay(yyyymmdd: string): number {
  const target = new Date(`${yyyymmdd}T00:00:00+09:00`);
  const todayKstStart = new Date();
  todayKstStart.setHours(0, 0, 0, 0);
  const diffMs = target.getTime() - todayKstStart.getTime();
  return Math.round(diffMs / (24 * 60 * 60 * 1000));
}
