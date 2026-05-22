"use client";

/**
 * BookingSection — /consulting 페이지의 캘린더 클라이언트 래퍼.
 *
 * Day 2 단계는 단순히 BookingCalendar 만 노출. Day 3 에서 선택된 slot 을 신청서 폼과
 * 결합 (BookingCalendar.onSelect → 폼 활성화 → POST /api/consulting/bookings).
 */

import * as React from "react";
import { BookingCalendar, type AvailableSlot } from "@/components/consulting/BookingCalendar";

export function ConsultingBookingSection(): React.ReactElement {
  const [_selected, setSelected] = React.useState<AvailableSlot | null>(null);
  return <BookingCalendar onSelect={setSelected} />;
}
