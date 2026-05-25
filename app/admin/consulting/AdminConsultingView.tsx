"use client";

/**
 * AdminConsultingView — /admin/consulting 본체 (Day 6, 2026-05-25).
 *
 * 4 탭: 예정 / 완료 / 취소 / 미예약 신청서.
 * 각 booking 카드 — 펼치기 / adminNotes 입력 / status 변경 / 강제 취소.
 *
 * 정직성 (P-002):
 *   - adminNotes 사용자 비노출 명시 (UI 라벨 "운영자 전용")
 *   - 강제 취소 시 확인 모달 (24h 정책 우회 경고)
 */

import * as React from "react";
import { fetchWithAuth, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Search,
  RefreshCw,
  Calendar,
  ChevronDown,
  AlertTriangle,
  Loader2,
  Mail,
} from "lucide-react";

type Tab = "upcoming" | "past" | "cancelled" | "unbooked";

interface BookingItem {
  id: string;
  status: "confirmed" | "cancelled" | "completed" | "no_show";
  slotStartAt: string;
  slotEndAt: string;
  durationMinutes: number;
  application: {
    id: string;
    studentName: string;
    studentGrade: 1 | 2 | 3;
    highSchool: string | null;
    consultationTopics: string[];
    currentGrades: string | null;
    targetUniversities: string[] | null;
    questions: string;
  } | null;
  user: { id: string; email: string | null; name: string | null };
  adminNotes: string | null;
  adminNotesUpdatedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
}

interface ApplicationItem {
  id: string;
  studentName: string;
  studentGrade: 1 | 2 | 3;
  highSchool: string | null;
  consultationTopics: string[];
  currentGrades: string | null;
  targetUniversities: string[] | null;
  questions: string;
  createdAt: string;
  user: { id: string; email: string | null };
  hasBooking: boolean;
}

interface BookingsApiResponse {
  items: BookingItem[];
  total: number;
  nextOffset: number | null;
}
interface ApplicationsApiResponse {
  items: ApplicationItem[];
  total: number;
  filtered: number;
}

const KOREAN_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function formatSlot(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} (${KOREAN_WEEKDAYS[d.getDay()]}) ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function AdminConsultingView(): React.ReactElement {
  const [tab, setTab] = React.useState<Tab>("upcoming");
  const [search, setSearch] = React.useState("");
  const [bookings, setBookings] = React.useState<BookingItem[]>([]);
  const [applications, setApplications] = React.useState<ApplicationItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === "unbooked") {
        const r = await fetchWithAuth<ApplicationsApiResponse>(
          `/api/admin/consulting/applications?filter=unbooked&olderThanDays=0&limit=100`,
        );
        setApplications(r.items);
      } else {
        const qs = new URLSearchParams({ status: tab, limit: "100" });
        if (search.trim().length > 0) qs.set("q", search.trim());
        const r = await fetchWithAuth<BookingsApiResponse>(
          `/api/admin/consulting/bookings?${qs.toString()}`,
        );
        setBookings(r.items);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }, [tab, search]);

  React.useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const onSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void load();
  };

  const TABS: Array<{ id: Tab; label: string }> = [
    { id: "upcoming", label: "예정" },
    { id: "past", label: "완료" },
    { id: "cancelled", label: "취소" },
    { id: "unbooked", label: "미예약 신청서" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">컨설팅 예약 관리</h1>
          <p className="text-xs text-muted-foreground mt-0.5 break-keep-all">
            운영자 전용 — 사용자에게 노출되지 않습니다. 강제 취소 시 24시간 정책 우회.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          새로고침
        </Button>
      </header>

      <div
        role="tablist"
        className="inline-flex gap-1 rounded-lg bg-muted/40 p-1 self-start"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            data-tab={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              tab === t.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab !== "unbooked" && (
        <form onSubmit={onSearchSubmit} className="flex items-center gap-2">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            <input
              type="search"
              placeholder="이메일 또는 학생 이름 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-border bg-background pl-8 pr-3 py-1.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            />
          </div>
          <Button type="submit" size="sm" variant="outline" disabled={loading}>
            검색
          </Button>
        </form>
      )}

      {error && (
        <div role="alert" className="rounded-md border border-rose-300/60 bg-rose-50/60 dark:border-rose-700/60 dark:bg-rose-950/30 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
          <AlertTriangle className="inline h-3 w-3 mr-1" aria-hidden />
          {error}
        </div>
      )}

      {tab !== "unbooked" ? (
        <BookingsList
          items={bookings}
          loading={loading}
          onMutated={load}
        />
      ) : (
        <ApplicationsList items={applications} loading={loading} />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   BookingsList
   ───────────────────────────────────────────────────────────────────── */

function BookingsList({
  items,
  loading,
  onMutated,
}: {
  items: BookingItem[];
  loading: boolean;
  onMutated: () => void | Promise<void>;
}): React.ReactElement {
  if (loading && items.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          <Loader2 className="inline h-4 w-4 animate-spin mr-2" />
          불러오는 중…
        </CardContent>
      </Card>
    );
  }
  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          예약이 없습니다.
        </CardContent>
      </Card>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {items.map((b) => (
        <li key={b.id}>
          <BookingCard booking={b} onMutated={onMutated} />
        </li>
      ))}
    </ul>
  );
}

function BookingCard({
  booking,
  onMutated,
}: {
  booking: BookingItem;
  onMutated: () => void | Promise<void>;
}): React.ReactElement {
  const [expanded, setExpanded] = React.useState(false);
  const [adminNotes, setAdminNotes] = React.useState(booking.adminNotes ?? "");
  const [saving, setSaving] = React.useState(false);
  const [busy, setBusy] = React.useState<null | "save_notes" | "complete" | "no_show" | "force_cancel">(null);

  const patch = async (
    body: Record<string, unknown>,
    label: typeof busy,
  ): Promise<void> => {
    setBusy(label);
    setSaving(true);
    try {
      await fetchWithAuth(`/api/admin/consulting/bookings/${booking.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      await onMutated();
    } catch (e) {
      window.alert((e as Error).message);
    } finally {
      setBusy(null);
      setSaving(false);
    }
  };

  const onForceCancel = (): void => {
    const reason = window.prompt(
      "강제 취소 — 24시간 정책 우회 (운영자 권한).\n사용자에게는 자동 환불 처리됩니다.\n취소 사유 (선택):",
      "",
    );
    if (reason === null) return; // 취소
    void patch({ forceCancel: true, cancellationReason: reason }, "force_cancel");
  };

  return (
    <Card data-component="admin-booking-card" data-booking-id={booking.id} data-status={booking.status}>
      <CardContent className="py-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Calendar className="h-4 w-4 text-brand-600" aria-hidden />
              <span className="font-semibold tabular-nums text-sm">{formatSlot(booking.slotStartAt)}</span>
              <span className="text-2xs text-muted-foreground">· {booking.durationMinutes}분</span>
              <StatusBadge status={booking.status} />
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
              <Mail className="h-3 w-3" aria-hidden />
              <span>{booking.user.email ?? "(이메일 없음)"}</span>
              {booking.application && (
                <>
                  <span>·</span>
                  <span>
                    {booking.application.studentName} ({booking.application.studentGrade}학년)
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {booking.status === "confirmed" && (
              <>
                <Button size="sm" variant="outline" onClick={() => void patch({ setStatus: "completed" }, "complete")} disabled={busy !== null}>
                  완료
                </Button>
                <Button size="sm" variant="outline" onClick={() => void patch({ setStatus: "no_show" }, "no_show")} disabled={busy !== null}>
                  no-show
                </Button>
                <Button size="sm" variant="outline" onClick={onForceCancel} disabled={busy !== null} className="border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-300 dark:hover:bg-rose-950/30">
                  강제 취소
                </Button>
              </>
            )}
            <Button size="sm" variant="outline" onClick={() => setExpanded((x) => !x)}>
              <ChevronDown className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")} />
              {expanded ? "접기" : "펼치기"}
            </Button>
          </div>
        </div>

        {expanded && booking.application && (
          <div data-element="application-details" className="rounded-md bg-muted/30 p-3 text-xs flex flex-col gap-2">
            <div className="flex gap-2 flex-wrap">
              <span className="text-muted-foreground">학교:</span>
              <span>{booking.application.highSchool ?? "-"}</span>
            </div>
            <div className="flex gap-2 flex-wrap items-baseline">
              <span className="text-muted-foreground">상담 주제:</span>
              <span className="flex flex-wrap gap-1">
                {booking.application.consultationTopics.map((t) => (
                  <Badge key={t} variant="outline" className="text-2xs">{t}</Badge>
                ))}
              </span>
            </div>
            {booking.application.currentGrades && (
              <div className="flex gap-2 flex-wrap">
                <span className="text-muted-foreground">현재 성적:</span>
                <span className="break-keep-all">{booking.application.currentGrades}</span>
              </div>
            )}
            {booking.application.targetUniversities && booking.application.targetUniversities.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                <span className="text-muted-foreground">희망 대학:</span>
                <span>{booking.application.targetUniversities.join(", ")}</span>
              </div>
            )}
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground">질문</span>
              <p className="whitespace-pre-wrap break-keep-all text-foreground/90">{booking.application.questions}</p>
            </div>
          </div>
        )}

        {/* 운영자 메모 */}
        <div data-element="admin-notes" className="flex flex-col gap-1.5">
          <label className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
            운영자 메모 <span className="font-normal lowercase tracking-normal">(사용자에게 노출 X)</span>
          </label>
          <textarea
            value={adminNotes}
            onChange={(e) => setAdminNotes(e.target.value)}
            placeholder="컨설팅 후속 조치·관찰 메모…"
            maxLength={2000}
            rows={2}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-2xs text-muted-foreground">
              {booking.adminNotesUpdatedAt
                ? `마지막 저장: ${new Date(booking.adminNotesUpdatedAt).toLocaleString("ko-KR")}`
                : "저장된 메모 없음"}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void patch({ adminNotes }, "save_notes")}
              disabled={saving || adminNotes === (booking.adminNotes ?? "")}
            >
              {busy === "save_notes" ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              메모 저장
            </Button>
          </div>
        </div>

        {booking.cancellationReason && (
          <p className="text-2xs text-muted-foreground italic">
            취소 사유: {booking.cancellationReason}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: BookingItem["status"] }): React.ReactElement {
  const map = {
    confirmed: { label: "예정", cls: "bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300" },
    completed: { label: "완료", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" },
    cancelled: { label: "취소", cls: "bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300" },
    no_show:   { label: "no-show", cls: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" },
  } as const;
  const m = map[status];
  return <Badge variant="outline" className={m.cls}>{m.label}</Badge>;
}

/* ─────────────────────────────────────────────────────────────────────
   ApplicationsList — 미예약 신청서 탭
   ───────────────────────────────────────────────────────────────────── */

function ApplicationsList({
  items,
  loading,
}: {
  items: ApplicationItem[];
  loading: boolean;
}): React.ReactElement {
  if (loading && items.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          <Loader2 className="inline h-4 w-4 animate-spin mr-2" />
          불러오는 중…
        </CardContent>
      </Card>
    );
  }
  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          미예약 신청서가 없습니다.
        </CardContent>
      </Card>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {items.map((a) => (
        <li key={a.id}>
          <Card data-component="admin-application-card" data-application-id={a.id}>
            <CardContent className="py-4 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{a.studentName} ({a.studentGrade}학년)</span>
                  <Badge variant="outline" className="text-2xs">미예약</Badge>
                </div>
                <span className="text-2xs text-muted-foreground tabular-nums">
                  {new Date(a.createdAt).toLocaleString("ko-KR")}
                </span>
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                <Mail className="h-3 w-3" aria-hidden />
                {a.user.email ?? "(이메일 없음)"}
              </div>
              <div className="flex gap-2 flex-wrap text-xs">
                <span className="text-muted-foreground">주제:</span>
                {a.consultationTopics.map((t) => (
                  <Badge key={t} variant="outline" className="text-2xs">{t}</Badge>
                ))}
              </div>
              <p className="text-xs text-foreground/90 whitespace-pre-wrap break-keep-all">{a.questions}</p>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
