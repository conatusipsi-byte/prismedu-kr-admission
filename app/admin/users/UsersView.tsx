"use client";

/**
 * UsersView — /admin/users 페이지 본체 (Client)
 *
 * - GET /api/admin/users → 목록 + 통계
 * - 검색·plan·status·masterOnly 필터
 * - mutation 호출 → 목록 즉시 갱신 (낙관 업데이트)
 */

import * as React from "react";
import { Loader2, UserX, Users as UsersIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UsersTable } from "@/components/admin/UsersTable";
import type { AdminUserItem, AdminUsersSummary } from "@/lib/admission/admin-users-mock";

interface ApiResponse {
  items: AdminUserItem[];
  summary: AdminUsersSummary;
  source: "firestore" | "mock";
  nextCursor?: string;
}

export function UsersView(): React.ReactElement {
  const [q, setQ] = React.useState("");
  const [plan, setPlan] = React.useState<"free" | "pro" | "elite" | "all">("all");
  const [status, setStatus] = React.useState<"active" | "disabled" | "all">("all");
  const [masterOnly, setMasterOnly] = React.useState<"true" | "false">("false");

  const [data, setData] = React.useState<ApiResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [pendingUid, setPendingUid] = React.useState<string | undefined>();

  // debounce search
  const [debouncedQ, setDebouncedQ] = React.useState("");
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  React.useEffect(() => {
    let aborted = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (debouncedQ) params.set("q", debouncedQ);
    if (plan !== "all") params.set("plan", plan);
    if (status !== "all") params.set("status", status);
    if (masterOnly === "true") params.set("masterOnly", "true");
    params.set("limit", "100");

    fetch(`/api/admin/users?${params.toString()}`)
      .then(async (res) => {
        if (aborted) return;
        if (!res.ok) {
          const d = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(d.error ?? `조회 실패 (${res.status})`);
        }
        const d = (await res.json()) as ApiResponse;
        setData(d);
      })
      .catch((e) => {
        if (!aborted) setError((e as Error).message);
      })
      .finally(() => {
        if (!aborted) setLoading(false);
      });
    return () => {
      aborted = true;
    };
  }, [debouncedQ, plan, status, masterOnly]);

  async function handleMutate(uid: string, action: "promote" | "revoke" | "disable" | "enable") {
    const reason = window.prompt(`${action} 사유 (감사 추적용, 선택)`);
    if (reason === null) return; // 사용자 취소

    setPendingUid(uid);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(uid)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, reason: reason.trim() || undefined }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? `${action} 실패 (${res.status})`);
      }
      // 낙관 업데이트
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.map((u) => {
            if (u.uid !== uid) return u;
            if (action === "promote") return { ...u, isMaster: true };
            if (action === "revoke") return { ...u, isMaster: false };
            if (action === "disable") return { ...u, disabled: true };
            if (action === "enable") return { ...u, disabled: false };
            return u;
          }),
        };
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPendingUid(undefined);
    }
  }

  return (
    <div
      data-page="admin-users"
      className="mx-auto flex max-w-content-wide flex-col gap-6 px-gutter-sm md:px-gutter lg:px-gutter-lg py-6"
    >
      <header>
        <h1 className="text-2xl font-bold">사용자 관리</h1>
        <p className="text-xs text-muted-foreground">
          전체 사용자 검색·plan 확인·운영자 권한·차단 관리.
          {data?.source === "mock" && " (현재 mock 데이터 — Firestore 시드 후 자동 전환)"}
        </p>
      </header>

      {/* 통계 카드 */}
      {data && <UsersOverview summary={data.summary} />}

      {/* 필터 */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div className="flex flex-col gap-1 sm:col-span-2">
          <Label htmlFor="users-q" className="text-xs">검색 (이메일·이름·uid)</Label>
          <Input
            id="users-q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="검색어"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="plan-filter" className="text-xs">plan</Label>
          <Select value={plan} onValueChange={(v) => setPlan(v as typeof plan)}>
            <SelectTrigger id="plan-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              <SelectItem value="free">free</SelectItem>
              <SelectItem value="pro">pro</SelectItem>
              <SelectItem value="elite">elite</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="status-filter" className="text-xs">상태</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger id="status-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              <SelectItem value="active">정상</SelectItem>
              <SelectItem value="disabled">차단됨</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>

      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={masterOnly === "true"}
          onChange={(e) => setMasterOnly(e.target.checked ? "true" : "false")}
          data-testid="master-only-filter"
        />
        master 권한 사용자만
      </label>

      {error && (
        <div
          role="alert"
          data-testid="users-error"
          className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive"
        >
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> 조회 중…
        </div>
      ) : data ? (
        <section>
          <h2 className="mb-3 text-lg font-semibold">사용자 ({data.items.length})</h2>
          <UsersTable items={data.items} onMutate={handleMutate} pendingUid={pendingUid} />
        </section>
      ) : null}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   하위 — UsersOverview
   ═══════════════════════════════════════════════════════════════════════ */

function UsersOverview({ summary }: { summary: AdminUsersSummary }): React.ReactElement {
  return (
    <div data-component="users-overview" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <StatCard icon={<UsersIcon className="h-4 w-4" />} label="전체" value={summary.total} tone="neutral" />
      <StatCard icon={<UsersIcon className="h-4 w-4" />} label="free" value={summary.byPlan.free} tone="neutral" />
      <StatCard icon={<UsersIcon className="h-4 w-4" />} label="pro" value={summary.byPlan.pro} tone="mint" />
      <StatCard icon={<UsersIcon className="h-4 w-4" />} label="elite" value={summary.byPlan.elite} tone="amber" />
      <StatCard icon={<UserX className="h-4 w-4" />} label="차단됨" value={summary.disabled} tone={summary.disabled > 0 ? "rose" : "neutral"} />
    </div>
  );
}

const TONE_CLASS = {
  neutral: "border-border bg-card",
  mint: "border-brand-200 bg-brand-50/30 dark:border-brand-800/40 dark:bg-brand-950/15",
  amber: "border-amber-200 bg-amber-50/30 dark:border-amber-900/40 dark:bg-amber-900/10",
  rose: "border-rose-300 bg-rose-50/40 dark:border-rose-900/40 dark:bg-rose-950/15",
} as const;

function StatCard({
  icon, label, value, tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: keyof typeof TONE_CLASS;
}): React.ReactElement {
  return (
    <Card className={cn("border", TONE_CLASS[tone])}>
      <CardContent className="py-3">
        <div className="mb-1 flex items-center gap-1.5 text-2xs text-muted-foreground">
          {icon}
          {label}
        </div>
        <div className="text-2xl font-bold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}
