"use client";

/**
 * BookingCalendar — Calendly 스타일 주별 7일 캘린더.
 *
 * 동작:
 *   - 오늘 + 6일 = 7일 컬럼을 가로 배치 (모바일은 가로 스크롤).
 *   - 각 컬럼: 헤더 "5/22 목" + 그 날의 가용 시간 칩 ("19:00", "20:30" 등).
 *   - 칩 클릭 → 단일 선택 (선택된 칩은 brand 컬러로 강조).
 *   - "이전 주" / "다음 주" 버튼으로 weekOffset 변경. 최대 4주 후까지 (Day 1 슬롯 마스터 정책).
 *   - 칩 0개 컬럼은 "—" 표시. 전체 주가 비면 "이번 주 예약 가능 시간이 없습니다".
 *
 * 데이터:
 *   - GET /api/consulting/slots?from=YYYY-MM-DD&to=YYYY-MM-DD → 가용 슬롯 목록.
 *   - 응답이 1분 캐싱 (s-maxage=60) — 다른 사용자 예약으로 변동 가능.
 *
 * Day 2 단계는 슬롯 선택 후 "신청서 폼" 으로의 결합이 skeleton 상태 (page.tsx 가 노출만 함).
 * Day 3 에서 onSelect → 신청서 폼 활성화 → POST /api/consulting/bookings 흐름 연결.
 */

import * as React from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { TIME_SLOT_LABELS } from "@/lib/plans";
import type { ConsultingTimeSlot } from "@/types/admission";

const MAX_WEEKS_AHEAD = 4;
const KOREAN_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

export interface AvailableSlot {
  id: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
}

interface SlotsApiResponse {
  slots: AvailableSlot[];
}

/**
 * 캘린더 entitlement context — page (server) 가 사용자의 권한을 분석해 전달.
 * 캘린더는 시기 도래 + 슬롯 시작 시각을 비교해 각 슬롯의 사용 가능 여부 판정.
 */
export interface CalendarEntitlement {
  /** 시기 미지정 슬롯 잔여 (consult_one + 시기 미지정 번들) */
  untimedRemaining: number;
  /** 시기 지정 슬롯 (validFrom 도래 + 미사용) */
  timedSlots: Array<{
    timeSlot: ConsultingTimeSlot;
    validFrom: string;
    remaining: number;
  }>;
  /** 시기 지정 슬롯 (validFrom 미도래) — 안내용 */
  pendingTimedSlots: Array<{
    timeSlot: ConsultingTimeSlot;
    validFrom: string;
  }>;
}

export interface BookingCalendarProps {
  /** 슬롯 선택 시 콜백. Day 3 신청서 폼과 결합. */
  onSelect?: (slot: AvailableSlot | null) => void;
  /** 사용자 컨설팅 entitlement — page 가 분석 후 전달. 미전달 시 모든 슬롯 활성. */
  entitlement?: CalendarEntitlement;
}

/**
 * 특정 슬롯이 사용자의 entitlement 로 예약 가능한지 + 사유 메시지.
 */
function evaluateSlotUsability(
  slot: AvailableSlot,
  ent: CalendarEntitlement | undefined,
): { usable: boolean; lockedReason?: string } {
  if (!ent) return { usable: true };
  if (ent.untimedRemaining > 0) return { usable: true };
  const slotMs = Date.parse(slot.startAt);
  // 시기 지정 슬롯 중 validFrom 도래 + slot.startAt 이후 사용 가능한 게 있나
  const usableTimed = ent.timedSlots.find(
    (t) => t.remaining > 0 && Date.parse(t.validFrom) <= slotMs,
  );
  if (usableTimed) return { usable: true };
  // 모든 가용 시기 슬롯이 slot 시각 이전이면 (=remaining 다 썼거나 부재) → 거부
  // 미도래 슬롯이 있고 그게 slot.startAt 이전이면 "X월 X일 이후 예약 가능"
  const earliestPending = ent.pendingTimedSlots
    .filter((p) => Date.parse(p.validFrom) > Date.now())
    .sort((a, b) => Date.parse(a.validFrom) - Date.parse(b.validFrom))[0];
  if (earliestPending) {
    const label = TIME_SLOT_LABELS[earliestPending.timeSlot];
    return {
      usable: false,
      lockedReason: `${label} (${earliestPending.validFrom.slice(0, 10)}) 부터 예약 가능`,
    };
  }
  return { usable: false, lockedReason: "사용 가능한 컨설팅 권한이 없습니다." };
}

/** 주의 시작일(오늘 + weekOffset*7) YYYY-MM-DD */
function getWeekStart(weekOffset: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + weekOffset * 7);
  return d;
}

/** Date → "YYYY-MM-DD" */
function toIsoDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Date → "5/22 목" */
function formatColumnHeader(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()} ${KOREAN_WEEKDAYS[d.getDay()]}`;
}

/** ISO timestamp → "19:00" (로컬 시간) */
function formatSlotTime(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function BookingCalendar({ onSelect, entitlement }: BookingCalendarProps): React.ReactElement {
  const [weekOffset, setWeekOffset] = React.useState(0);
  const [selectedSlotId, setSelectedSlotId] = React.useState<string | null>(null);
  const [slots, setSlots] = React.useState<AvailableSlot[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const weekStart = React.useMemo(() => getWeekStart(weekOffset), [weekOffset]);
  const weekEnd = React.useMemo(() => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7);
    return d;
  }, [weekStart]);

  React.useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const from = toIsoDate(weekStart);
    const to = toIsoDate(weekEnd);
    fetch(`/api/consulting/slots?from=${from}&to=${to}`, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as SlotsApiResponse;
      })
      .then((body) => {
        setSlots(body.slots ?? []);
      })
      .catch((e: Error) => {
        if (e.name === "AbortError") return;
        setError("예약 가능 시간을 불러오지 못했어요. 잠시 후 다시 시도해주세요.");
        setSlots([]);
      })
      .finally(() => {
        setLoading(false);
      });
    return () => controller.abort();
  }, [weekStart, weekEnd]);

  const days = React.useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [weekStart]);

  const slotsByDay = React.useMemo(() => {
    const map = new Map<string, AvailableSlot[]>();
    for (const slot of slots) {
      const key = toIsoDate(new Date(slot.startAt));
      const arr = map.get(key) ?? [];
      arr.push(slot);
      map.set(key, arr);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.startAt.localeCompare(b.startAt));
    }
    return map;
  }, [slots]);

  const handleSelect = (slot: AvailableSlot) => {
    const nextId = selectedSlotId === slot.id ? null : slot.id;
    setSelectedSlotId(nextId);
    onSelect?.(nextId === null ? null : slot);
  };

  const canGoBack = weekOffset > 0;
  const canGoForward = weekOffset < MAX_WEEKS_AHEAD;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-foreground">
          예약 가능 시간
        </h3>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setWeekOffset((w) => Math.max(0, w - 1))}
            disabled={!canGoBack || loading}
            aria-label="이전 주"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="sr-only sm:not-sr-only sm:ml-1">이전 주</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setWeekOffset((w) => Math.min(MAX_WEEKS_AHEAD, w + 1))}
            disabled={!canGoForward || loading}
            aria-label="다음 주"
          >
            <span className="sr-only sm:not-sr-only sm:mr-1">다음 주</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div
          className="flex items-center justify-center py-10 text-sm text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
          예약 가능 시간을 불러오는 중…
        </div>
      ) : error ? (
        <p className="text-sm text-destructive py-6 text-center" role="alert">
          {error}
        </p>
      ) : slots.length === 0 ? (
        <p className="text-sm text-muted-foreground py-10 text-center break-keep-all">
          이번 주 예약 가능 시간이 없습니다. {canGoForward ? "다음 주를 확인해주세요." : ""}
        </p>
      ) : (
        <div
          className="grid grid-cols-7 gap-2 overflow-x-auto md:overflow-visible -mx-1 px-1"
          role="grid"
          aria-label="예약 가능 시간 캘린더"
        >
          {days.map((day) => {
            const key = toIsoDate(day);
            const daySlots = slotsByDay.get(key) ?? [];
            return (
              <div
                key={key}
                className="min-w-[88px] flex flex-col gap-2"
                role="gridcell"
              >
                <div className="text-2xs font-semibold text-center text-muted-foreground pb-1.5 border-b border-border">
                  {formatColumnHeader(day)}
                </div>
                <div className="flex flex-col gap-1.5">
                  {daySlots.length === 0 ? (
                    <span className="text-2xs text-center text-muted-foreground/60 py-1">
                      —
                    </span>
                  ) : (
                    daySlots.map((slot) => {
                      const selected = slot.id === selectedSlotId;
                      const { usable, lockedReason } = evaluateSlotUsability(slot, entitlement);
                      return (
                        <button
                          key={slot.id}
                          type="button"
                          onClick={() => usable && handleSelect(slot)}
                          aria-pressed={selected}
                          aria-disabled={!usable}
                          disabled={!usable}
                          title={!usable ? lockedReason : undefined}
                          data-slot-usable={usable}
                          className={cn(
                            "rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1",
                            !usable
                              ? "bg-muted/40 border-dashed border-border text-muted-foreground/60 cursor-not-allowed"
                              : selected
                                ? "bg-brand-600 border-brand-600 text-white hover:bg-brand-700"
                                : "bg-background border-border text-foreground hover:bg-muted",
                          )}
                        >
                          {formatSlotTime(slot.startAt)}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedSlotId && (
        <p className="text-2xs text-muted-foreground border-t border-border pt-3">
          선택한 시간 ID: <code className="font-mono">{selectedSlotId}</code> · 신청서 작성은 다음 단계에서 진행됩니다 (Day 3).
        </p>
      )}
    </div>
  );
}
