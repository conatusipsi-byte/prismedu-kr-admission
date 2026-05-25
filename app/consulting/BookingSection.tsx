"use client";

/**
 * BookingSection — /consulting 페이지의 캘린더 + 신청서 클라이언트 결합.
 *
 * Day 2: 캘린더만.
 * Day 3 (현재): 캘린더 → 슬롯 선택 → 신청서 폼 펼침 → POST /api/consulting/applications.
 * Day 4 (예정): 신청서 제출 후 POST /api/consulting/bookings (slot 점유 + entitlement 차감).
 *
 * 상태:
 *   - selected: 사용자가 선택한 슬롯 (null = 미선택)
 *   - submitState: idle / submitting / success / error
 *   - lastApplicationId: 마지막 제출 성공 시 신청서 id (디버그·관리자용 노출)
 *
 * 정직성 (P-002):
 *   - 신청서 제출 ≠ 예약 확정. 성공 메시지에 명시.
 *   - 슬롯 미선택 시 신청서 가림 → 사용자가 "어떤 슬롯에 신청한 건지" 헷갈리지 않게.
 */

import * as React from "react";
import { CalendarClock, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { BookingCalendar, type AvailableSlot, type CalendarEntitlement } from "@/components/consulting/BookingCalendar";
import { ApplicationForm } from "@/components/consulting/ApplicationForm";
import { fetchWithAuth, ApiError } from "@/lib/api-client";
import type { ConsultingApplicationCreate } from "@/lib/schemas/api/consulting";
import { TIME_SLOT_LABELS } from "@/lib/plans";
import type { ConsultingTimeSlot } from "@/types/admission";

type SubmitState = "idle" | "submitting" | "success" | "error";

interface ApplicationsResponse {
  id: string;
  createdAt: string;
}

interface BookingResponse {
  bookingId: string;
  slotStartAt: string;
  slotEndAt: string;
  consumedTimeSlot: ConsultingTimeSlot | null;
}

/** ISO timestamp → "5/23 (토) 19:00 KST" */
function formatSlotLabel(iso: string): string {
  const d = new Date(iso);
  const KOREAN_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getMonth() + 1}/${d.getDate()} (${KOREAN_WEEKDAYS[d.getDay()]}) ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} KST`;
}

export interface ConsultingBookingSectionProps {
  calendarEntitlement?: CalendarEntitlement;
}

export function ConsultingBookingSection({ calendarEntitlement }: ConsultingBookingSectionProps = {}): React.ReactElement {
  const [selected, setSelected] = React.useState<AvailableSlot | null>(null);
  const [submitState, setSubmitState] = React.useState<SubmitState>("idle");
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [lastBooking, setLastBooking] = React.useState<BookingResponse | null>(null);

  const onSubmit = async (values: ConsultingApplicationCreate): Promise<void> => {
    if (!selected) return;
    setSubmitState("submitting");
    setSubmitError(null);
    try {
      // Day 3 — 신청서 INSERT
      const appBody = await fetchWithAuth<ApplicationsResponse>(
        "/api/consulting/applications",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        },
      );
      // Day 4 — 예약 확정 (slot + entitlement 차감 트랜잭션, RPC)
      const bookingBody = await fetchWithAuth<BookingResponse>(
        "/api/consulting/bookings",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ timeSlotId: selected.id, applicationId: appBody.id }),
        },
      );
      setLastBooking(bookingBody);
      setSubmitState("success");
    } catch (e) {
      // ApiError 는 status + 한국어 message 를 갖고 있음. 일반 Error 도 message 노출.
      const msg =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "신청서 제출 중 네트워크 오류가 발생했어요.";
      setSubmitError(msg);
      setSubmitState("error");
    }
  };

  const resetAfterSuccess = (): void => {
    setSelected(null);
    setSubmitState("idle");
    setSubmitError(null);
    setLastBooking(null);
  };

  return (
    <div className="flex flex-col gap-6">
      <BookingCalendar onSelect={setSelected} entitlement={calendarEntitlement} />

      {/* 신청서 영역 — 슬롯 선택 시 펼침 */}
      {!selected ? (
        <div
          className="border-t border-border pt-5 flex items-center gap-2 text-sm text-muted-foreground break-keep-all"
          role="note"
        >
          <CalendarClock className="h-4 w-4 shrink-0" aria-hidden="true" />
          신청서를 작성하려면 먼저 위에서 예약 시간을 선택해주세요.
        </div>
      ) : submitState === "success" ? (
        <div
          className="border-t border-border pt-5 flex flex-col gap-3"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start gap-3 rounded-lg border border-brand-300/60 dark:border-brand-700/60 bg-brand-50/70 dark:bg-brand-950/30 px-4 py-3">
            <CheckCircle2
              className="h-5 w-5 shrink-0 mt-0.5 text-brand-600 dark:text-brand-400"
              aria-hidden="true"
            />
            <div className="flex flex-col gap-1">
              <p className="text-sm font-semibold text-foreground">
                예약이 확정되었습니다.
              </p>
              <p className="text-2xs text-muted-foreground break-keep-all leading-relaxed">
                일시: <strong>{formatSlotLabel(selected.startAt)}</strong>
                {lastBooking?.consumedTimeSlot && (
                  <>
                    <br />
                    차감 슬롯: <strong>{TIME_SLOT_LABELS[lastBooking.consumedTimeSlot]}</strong>
                  </>
                )}
                <br />
                예약 24시간 전까지 <Link href="/consulting/my-bookings" className="underline">내 예약</Link> 에서 취소할 수 있어요.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/consulting/my-bookings"
              className="text-sm text-brand-600 dark:text-brand-400 underline-offset-2 hover:underline"
            >
              내 예약 보기
            </Link>
            <button
              type="button"
              onClick={resetAfterSuccess}
              className="text-sm text-muted-foreground underline-offset-2 hover:underline"
            >
              다른 시간으로 추가 예약
            </button>
          </div>
        </div>
      ) : (
        <div className="border-t border-border pt-5 flex flex-col gap-3">
          <div className="rounded-lg bg-brand-50/60 dark:bg-brand-950/30 border border-brand-200/60 dark:border-brand-800/40 px-3 py-2 text-2xs text-foreground">
            선택한 시간: <strong>{formatSlotLabel(selected.startAt)}</strong>
          </div>
          <ApplicationForm
            onValidSubmit={onSubmit}
            disabled={submitState === "submitting"}
            submitError={submitError}
          />
        </div>
      )}
    </div>
  );
}
