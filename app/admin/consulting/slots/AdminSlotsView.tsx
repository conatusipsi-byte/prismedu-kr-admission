"use client";

/**
 * AdminSlotsView — /admin/consulting/slots 본체 (2026-06-01).
 *
 * 날짜(KST)별 슬롯 리스트 + status(available/booked/blocked).
 *   - 단일 토글: 열기(blocked→available) / 닫기(available→blocked)
 *   - 일괄: 특정 날짜 전체 열기/닫기 (booked 제외)
 *   - 미래 슬롯 N일치 추가 생성 (slot-schedule 12:00~20:00 60분 재사용, 멱등)
 *
 * 정직성 (P-002): booked 슬롯은 토글/일괄에서 비활성·제외 (예약 보호).
 * KST 표시: Intl Asia/Seoul 명시 (BUG-015 일관, 운영자 TZ 무관 정확).
 */

import * as React from "react";
import { fetchWithAuth, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  RefreshCw,
  Loader2,
  AlertTriangle,
  CalendarPlus,
  Lock,
  LockOpen,
  CalendarDays,
} from "lucide-react";

type SlotStatus = "available" | "booked" | "blocked";

interface Slot {
  id: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  status: SlotStatus;
}
interface SlotsResponse {
  slots: Slot[];
  counts: { available: number; booked: number; blocked: number };
  total: number;
}

/* ── KST 포맷 (Asia/Seoul 명시 — 운영자 브라우저 TZ 무관) ─────────────────── */
const KST = "Asia/Seoul";
/** "YYYY-MM-DD" (KST) — 그룹 키 + bulk API date 파라미터 */
function kstDateKey(iso: string): string {
  // en-CA → YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: KST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}
/** "6월 2일 (월)" (KST) — 날짜 헤더 */
function kstDateLabel(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: KST,
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(iso));
}
/** "12:00" (KST) */
function kstTime(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: KST,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function AdminSlotsView(): React.ReactElement {
  const [slots, setSlots] = React.useState<Slot[]>([]);
  const [counts, setCounts] = React.useState<SlotsResponse["counts"]>({ available: 0, booked: 0, blocked: 0 });
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [busyDate, setBusyDate] = React.useState<string | null>(null);
  const [daysAhead, setDaysAhead] = React.useState(14);
  const [generating, setGenerating] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetchWithAuth<SlotsResponse>("/api/admin/consulting/slots");
      setSlots(r.slots);
      setCounts(r.counts);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  // 단일 슬롯 토글
  const toggleSlot = async (slot: Slot): Promise<void> => {
    if (slot.status === "booked") return; // 예약 보호
    const next = slot.status === "available" ? "blocked" : "available";
    setBusyId(slot.id);
    try {
      await fetchWithAuth(`/api/admin/consulting/slots/${slot.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      await load();
    } catch (e) {
      window.alert((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  // 날짜 일괄 열기/닫기
  const bulk = async (date: string, action: "open" | "close"): Promise<void> => {
    setBusyDate(date);
    try {
      const r = await fetchWithAuth<{ changed: number }>("/api/admin/consulting/slots/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, action }),
      });
      setNotice(`${date} ${action === "open" ? "열기" : "닫기"} — ${r.changed}개 변경`);
      await load();
    } catch (e) {
      window.alert((e as Error).message);
    } finally {
      setBusyDate(null);
    }
  };

  // 미래 슬롯 생성
  const generate = async (): Promise<void> => {
    setGenerating(true);
    setNotice(null);
    try {
      const r = await fetchWithAuth<{ inserted: number; skipped: number; perDay: number }>(
        "/api/admin/consulting/slots/generate",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ daysAhead }),
        },
      );
      setNotice(`생성 완료 — 신규 ${r.inserted}개 / 기존 ${r.skipped}개 skip (하루 ${r.perDay}슬롯, ${daysAhead}일).`);
      await load();
    } catch (e) {
      window.alert((e as Error).message);
    } finally {
      setGenerating(false);
    }
  };

  // KST 날짜별 그룹화 (slots 는 start_at 오름차순)
  const groups = React.useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of slots) {
      const key = kstDateKey(s.startAt);
      const arr = map.get(key);
      if (arr) arr.push(s);
      else map.set(key, [s]);
    }
    return Array.from(map.entries());
  }, [slots]);

  return (
    <div className="flex flex-col gap-6" data-component="admin-slots">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">컨설팅 슬롯 관리</h1>
          <p className="text-xs text-muted-foreground mt-0.5 break-keep-all">
            12:00~20:00 KST · 60분 · 하루 8슬롯. 슬롯을 열고/닫거나 미래 슬롯을 생성합니다.
            예약된(booked) 슬롯은 보호되어 변경되지 않습니다.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          새로고침
        </Button>
      </header>

      {/* 요약 + 생성 */}
      <Card>
        <CardContent className="py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs flex-wrap">
            <Badge variant="outline" className="bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300">
              예약가능 {counts.available}
            </Badge>
            <Badge variant="outline" className="bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
              예약됨 {counts.booked}
            </Badge>
            <Badge variant="outline" className="bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
              닫힘 {counts.blocked}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="daysAhead" className="text-xs text-muted-foreground">
              향후
            </label>
            <input
              id="daysAhead"
              type="number"
              min={1}
              max={60}
              value={daysAhead}
              onChange={(e) => setDaysAhead(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
              className="w-16 rounded-md border border-border bg-background px-2 py-1 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            />
            <span className="text-xs text-muted-foreground">일치</span>
            <Button size="sm" onClick={() => void generate()} disabled={generating}>
              {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <CalendarPlus className="h-3 w-3" />}
              슬롯 생성
            </Button>
          </div>
        </CardContent>
      </Card>

      {notice && (
        <div role="status" className="rounded-md border border-brand-300/60 bg-brand-50/60 dark:border-brand-700/60 dark:bg-brand-950/30 px-3 py-2 text-sm text-brand-700 dark:text-brand-300">
          {notice}
        </div>
      )}
      {error && (
        <div role="alert" className="rounded-md border border-rose-300/60 bg-rose-50/60 dark:border-rose-700/60 dark:bg-rose-950/30 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
          <AlertTriangle className="inline h-3 w-3 mr-1" aria-hidden />
          {error}
        </div>
      )}

      {loading && slots.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            <Loader2 className="inline h-4 w-4 animate-spin mr-2" />
            불러오는 중…
          </CardContent>
        </Card>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
            <CalendarDays className="h-5 w-5" aria-hidden />
            향후 30일 내 슬롯이 없습니다. 위 “슬롯 생성”으로 미래 슬롯을 만들 수 있어요.
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {groups.map(([dateKey, daySlots]) => {
            const openable = daySlots.some((s) => s.status === "blocked");
            const closable = daySlots.some((s) => s.status === "available");
            return (
              <li key={dateKey}>
                <Card data-element="slot-day" data-date={dateKey}>
                  <CardContent className="py-4 flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <h2 className="text-sm font-semibold flex items-center gap-1.5">
                        <CalendarDays className="h-4 w-4 text-brand-600" aria-hidden />
                        {kstDateLabel(daySlots[0].startAt)}
                        <span className="text-2xs font-normal text-muted-foreground">· {daySlots.length}슬롯</span>
                      </h2>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void bulk(dateKey, "open")}
                          disabled={busyDate === dateKey || !openable}
                          title="닫힌 슬롯 전체 열기"
                        >
                          <LockOpen className="h-3 w-3" /> 전체 열기
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void bulk(dateKey, "close")}
                          disabled={busyDate === dateKey || !closable}
                          title="예약가능 슬롯 전체 닫기"
                        >
                          <Lock className="h-3 w-3" /> 전체 닫기
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {daySlots.map((s) => (
                        <SlotChip
                          key={s.id}
                          slot={s}
                          busy={busyId === s.id}
                          onToggle={() => void toggleSlot(s)}
                        />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function SlotChip({
  slot,
  busy,
  onToggle,
}: {
  slot: Slot;
  busy: boolean;
  onToggle: () => void;
}): React.ReactElement {
  const time = kstTime(slot.startAt);
  const isBooked = slot.status === "booked";
  const isAvailable = slot.status === "available";

  const cls =
    slot.status === "available"
      ? "border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-700 dark:bg-brand-950/40 dark:text-brand-300"
      : slot.status === "booked"
        ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300 cursor-not-allowed"
        : "border-zinc-300 bg-zinc-100 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400";

  return (
    <button
      type="button"
      data-element="slot-chip"
      data-slot-id={slot.id}
      data-status={slot.status}
      onClick={onToggle}
      disabled={busy || isBooked}
      title={isBooked ? "예약된 슬롯 — 변경 불가" : isAvailable ? "클릭하여 닫기" : "클릭하여 열기"}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium tabular-nums transition",
        cls,
        !isBooked && "hover:opacity-80",
      )}
    >
      {busy ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : isBooked ? (
        <Lock className="h-3 w-3" aria-hidden />
      ) : isAvailable ? (
        <LockOpen className="h-3 w-3" aria-hidden />
      ) : (
        <Lock className="h-3 w-3" aria-hidden />
      )}
      {time}
      <span className="text-2xs opacity-70">
        {slot.status === "available" ? "가능" : slot.status === "booked" ? "예약" : "닫힘"}
      </span>
    </button>
  );
}
