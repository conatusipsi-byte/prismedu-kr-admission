"use client";

/**
 * MyBookingsView — 예약 이력 탭 + 취소 액션 (Day 4, 2026-05-25).
 *
 * 탭: 예정 (취소 가능) / 완료 / 취소.
 * 취소: 24시간 전이면 활성 버튼. 24시간 이내 disabled + 안내.
 *
 * 정직성 (P-002):
 *   - 24시간 전 정책 명시 (취소 modal 진입 전 안내).
 *   - 취소 후 환불 슬롯 (consumedTimeSlot 복구) 즉시 토스트 노출.
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Calendar, Check, X, AlertCircle, ChevronLeft, Loader2 } from "lucide-react";
import { fetchWithAuth, ApiError } from "@/lib/api-client";
import { TIME_SLOT_LABELS } from "@/lib/plans";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ConsultingTimeSlot } from "@/types/admission";

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
    consultationTopics: string[];
  } | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
}

export interface MyBookingsViewProps {
  upcoming: BookingItem[];
  past: BookingItem[];
  cancelled: BookingItem[];
  loadError: string | null;
}

type Tab = "upcoming" | "past" | "cancelled";

const KOREAN_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function formatSlotLabel(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} (${KOREAN_WEEKDAYS[d.getDay()]}) ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} KST`;
}

const TWENTY_FOUR_H = 24 * 60 * 60 * 1000;

export function MyBookingsView({
  upcoming,
  past,
  cancelled,
  loadError,
}: MyBookingsViewProps): React.ReactElement {
  const router = useRouter();
  // BUG-023: 빈 예약이어도 "예정" 탭이 default — 사용자가 "여기 비어있네 → 예약하러 가자" 흐름.
  const [tab, setTab] = React.useState<Tab>("upcoming");
  const [cancellingId, setCancellingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(loadError);
  const [toast, setToast] = React.useState<string | null>(null);

  const items = tab === "upcoming" ? upcoming : tab === "past" ? past : cancelled;

  const onCancel = async (booking: BookingItem): Promise<void> => {
    const slotMs = Date.parse(booking.slotStartAt);
    const hoursLeft = (slotMs - Date.now()) / 1000 / 60 / 60;
    const ok = window.confirm(
      `정말 취소하시겠어요?\n\n${formatSlotLabel(booking.slotStartAt)} (${hoursLeft.toFixed(1)}시간 전)\n\n예약 24시간 전까지만 취소가 가능합니다. 시기 지정 컨설팅이면 사용 가능 슬롯으로 복구됩니다.`,
    );
    if (!ok) return;
    setCancellingId(booking.id);
    setError(null);
    try {
      const res = await fetchWithAuth<{
        bookingId: string;
        status: string;
        refundedTimeSlot: ConsultingTimeSlot | null;
      }>(`/api/consulting/bookings/${booking.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const refundLabel = res.refundedTimeSlot
        ? ` (${TIME_SLOT_LABELS[res.refundedTimeSlot]} 슬롯 복구)`
        : "";
      setToast(`예약이 취소되었습니다${refundLabel}.`);
      router.refresh();
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : "취소 처리 중 오류";
      setError(msg);
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-content px-gutter-sm md:px-gutter lg:px-gutter-lg py-section flex flex-col gap-section">
      <header className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <p className="text-2xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-400">
            컨설팅
          </p>
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground tracking-tight">
            내 컨설팅 예약
          </h1>
        </div>
        <Link
          href="/consulting"
          className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          예약 페이지로
        </Link>
      </header>

      {/* 탭 */}
      <div
        role="tablist"
        aria-label="예약 이력 탭"
        className="inline-flex gap-1 rounded-lg bg-muted/40 p-1 self-start"
      >
        {(["upcoming", "past", "cancelled"] as const).map((t) => {
          const count = t === "upcoming" ? upcoming.length : t === "past" ? past.length : cancelled.length;
          const label = t === "upcoming" ? "예정" : t === "past" ? "완료" : "취소";
          return (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              data-tab={t}
              onClick={() => setTab(t)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                tab === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label} <span className="font-numeric tabular-nums text-2xs ml-1">{count}</span>
            </button>
          );
        })}
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-rose-300/60 bg-rose-50/60 dark:border-rose-700/60 dark:bg-rose-950/30 px-3 py-2 text-sm text-rose-700 dark:text-rose-300"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
          <span>{error}</span>
        </div>
      )}
      {toast && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-lg border border-brand-300/60 bg-brand-50/60 dark:border-brand-700/60 dark:bg-brand-950/30 px-3 py-2 text-sm text-foreground"
        >
          <Check className="h-4 w-4 shrink-0 mt-0.5 text-brand-600 dark:text-brand-400" aria-hidden />
          <span>{toast}</span>
        </div>
      )}

      {/* 목록 */}
      {items.length === 0 ? (
        <Card data-state="empty">
          <CardContent className="py-12 text-center text-sm text-muted-foreground flex flex-col items-center gap-4">
            <span>
              {tab === "upcoming" && "예정된 예약이 없습니다."}
              {tab === "past" && "완료된 예약이 아직 없습니다."}
              {tab === "cancelled" && "취소된 예약이 없습니다."}
            </span>
            {tab === "upcoming" && (
              <Button asChild size="sm" variant="outline" data-element="empty-state-cta">
                <Link href="/consulting">컨설팅 예약하기</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((b) => {
            const slotMs = Date.parse(b.slotStartAt);
            const within24h = slotMs - Date.now() < TWENTY_FOUR_H;
            const canCancel = tab === "upcoming" && !within24h && b.status === "confirmed";
            return (
              <li key={b.id}>
                <Card data-component="booking-card" data-status={b.status}>
                  <CardContent className="flex flex-col gap-3 py-4">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-brand-600 dark:text-brand-400" aria-hidden />
                        <span className="text-sm font-semibold tabular-nums">
                          {formatSlotLabel(b.slotStartAt)}
                        </span>
                        <span className="text-2xs text-muted-foreground">· {b.durationMinutes}분</span>
                      </div>
                      <StatusBadge status={b.status} />
                    </div>
                    {b.application && (
                      <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-1.5">
                        <span>
                          {b.application.studentName} ({b.application.studentGrade}학년)
                        </span>
                        <span>·</span>
                        <span className="flex flex-wrap gap-1">
                          {b.application.consultationTopics.slice(0, 3).map((t) => (
                            <span
                              key={t}
                              className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-2xs"
                            >
                              {t}
                            </span>
                          ))}
                          {b.application.consultationTopics.length > 3 && (
                            <span className="text-2xs">+{b.application.consultationTopics.length - 3}</span>
                          )}
                        </span>
                      </div>
                    )}
                    {b.cancellationReason && (
                      <p className="text-2xs text-muted-foreground italic">
                        취소 사유: {b.cancellationReason}
                      </p>
                    )}
                    {tab === "upcoming" && b.status === "confirmed" && (
                      <div className="flex items-center justify-end gap-2 pt-1">
                        {canCancel ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onCancel(b)}
                            disabled={cancellingId === b.id}
                          >
                            {cancellingId === b.id ? (
                              <>
                                <Loader2 className="h-3 w-3 animate-spin" /> 취소 중…
                              </>
                            ) : (
                              <>
                                <X className="h-3 w-3" /> 취소
                              </>
                            )}
                          </Button>
                        ) : (
                          <span
                            data-element="cancel-window-locked"
                            className="inline-flex items-center gap-1 text-2xs text-muted-foreground"
                          >
                            <AlertCircle className="h-3 w-3" />
                            24시간 이내 — 취소 불가
                          </span>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-2xs text-muted-foreground break-keep-all">
        예약 취소는 시작 24시간 전까지만 가능합니다. 시기 지정 컨설팅 (시즌+컨설팅 3회) 취소 시
        해당 시기 슬롯이 자동 복구됩니다.
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: BookingItem["status"] }): React.ReactElement {
  if (status === "confirmed")
    return (
      <Badge variant="outline" className="bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300">
        예정
      </Badge>
    );
  if (status === "completed")
    return (
      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
        완료
      </Badge>
    );
  if (status === "cancelled")
    return (
      <Badge variant="outline" className="bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
        취소
      </Badge>
    );
  return (
    <Badge variant="outline" className="bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
      no show
    </Badge>
  );
}
