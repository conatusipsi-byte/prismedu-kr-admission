/**
 * /consulting — 1:1 입시 컨설팅 예약 페이지.
 *
 * Day 3 (현재): 좌측 컨설턴트 프로필, 우측 캘린더 + 신청서 (슬롯 선택 시 펼침).
 * Day 4 (예정): 신청서 제출 후 예약 확정 (POST /api/consulting/bookings) — 슬롯 점유 + entitlement 차감.
 *
 * 권한 검증은 app/consulting/layout.tsx 가 처리:
 *   - 미로그인 → /login?returnUrl=/consulting (middleware)
 *   - entitlement 없음 → /pricing#consulting
 */

import { ConsultantProfile } from "@/components/consulting/ConsultantProfile";
import { ConsultingBookingSection } from "./BookingSection";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "1:1 입시 컨설팅 예약 | 코나투스 입시",
  description:
    "코나투스 입시 컨설턴트와 1:1 한국 대학 입시 컨설팅 (60분). 정시·수시·학종 전 영역 맞춤 상담.",
};

export default function ConsultingPage() {
  return (
    <div className="container max-w-5xl py-section flex flex-col gap-section">
      <header className="flex flex-col gap-1.5">
        <p className="text-2xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-400">
          컨설팅
        </p>
        <h1 className="text-2xl lg:text-3xl font-bold text-foreground tracking-tight">
          1:1 입시 컨설팅 예약
        </h1>
        <p className="text-sm text-muted-foreground break-keep-all">
          원하는 시간을 선택하면 컨설턴트가 확정 알림을 보내드려요. 세션은 60분, 화상 또는 대면으로 진행합니다.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-card">
        <ConsultantProfile />
        <Card className="p-card-lg">
          <ConsultingBookingSection />
        </Card>
      </div>
    </div>
  );
}
