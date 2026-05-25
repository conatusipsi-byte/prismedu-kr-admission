/**
 * /consulting/my-bookings — 본인 예약 이력 (Day 4, 2026-05-25).
 *
 * 탭: 예정 / 완료 / 취소 — server-side 분류 (route GET 응답 그대로 사용).
 * 인증·세션 확인은 부모 layout (app/consulting/layout.tsx) 이 처리하지만, 본 페이지는
 * entitlement.hasAccess=false 인 사용자도 접근 가능해야 함 (과거 예약 이력 조회).
 *
 * → app/consulting/my-bookings/layout.tsx 가 entitlement 검사 우회.
 */

import { redirect } from "next/navigation";
import { getRouteSupabase } from "@/lib/supabase-server";
import { MyBookingsView } from "./MyBookingsView";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "내 컨설팅 예약 | 코나투스 입시",
  description: "예정·완료·취소 컨설팅 예약 이력. 24시간 전까지 취소 가능.",
};

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

interface BookingsRow {
  id: string;
  time_slot_id: string;
  application_id: string | null;
  status: BookingItem["status"];
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
  consulting_time_slots: {
    id: string;
    start_at: string;
    end_at: string;
    duration_minutes: number;
  };
  consulting_applications: {
    id: string;
    student_name: string;
    student_grade: 1 | 2 | 3;
    consultation_topics: string[];
  } | null;
}

export default async function MyBookingsPage() {
  const sb = await getRouteSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/login?returnUrl=/consulting/my-bookings");

  // 본인 예약 — RLS 가 본인 row 만 허용하므로 routeClient 로 그대로 조회.
  const { data, error } = await sb
    .from("consulting_bookings")
    .select(`
      id, time_slot_id, application_id, status, cancelled_at, cancellation_reason, created_at,
      consulting_time_slots!inner ( id, start_at, end_at, duration_minutes ),
      consulting_applications ( id, student_name, student_grade, consultation_topics )
    `)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const rows = ((data ?? []) as unknown as BookingsRow[]) ?? [];
  const items: BookingItem[] = rows.map((r) => ({
    id: r.id,
    status: r.status,
    slotStartAt: r.consulting_time_slots.start_at,
    slotEndAt: r.consulting_time_slots.end_at,
    durationMinutes: r.consulting_time_slots.duration_minutes,
    application: r.consulting_applications
      ? {
          id: r.consulting_applications.id,
          studentName: r.consulting_applications.student_name,
          studentGrade: r.consulting_applications.student_grade,
          consultationTopics: r.consulting_applications.consultation_topics,
        }
      : null,
    cancelledAt: r.cancelled_at,
    cancellationReason: r.cancellation_reason,
    createdAt: r.created_at,
  }));

  const now = Date.now();
  const upcoming = items.filter((i) => i.status === "confirmed" && Date.parse(i.slotStartAt) > now);
  const past = items.filter(
    (i) =>
      (i.status === "confirmed" && Date.parse(i.slotStartAt) <= now) ||
      i.status === "completed" ||
      i.status === "no_show",
  );
  const cancelled = items.filter((i) => i.status === "cancelled");

  return (
    <MyBookingsView
      upcoming={upcoming}
      past={past}
      cancelled={cancelled}
      loadError={error?.message ?? null}
    />
  );
}
