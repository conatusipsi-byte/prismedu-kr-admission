/**
 * /consulting — 1:1 입시 컨설팅 예약 페이지.
 *
 * Day 2 of consulting 계약 — 페이지 구조 + 캘린더 + 신청서 skeleton.
 * 좌측: ConsultantProfile (placeholder), 우측: BookingCalendar.
 * 하단: 신청서 폼 자리 — Day 3 에서 구현.
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
    "방준현 대표와 1:1 한국 대학 입시 컨설팅 (60분). 정시·수시·학종 전 영역 맞춤 상담.",
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

      <Card className="p-card-lg" aria-label="컨설팅 신청서 (Day 3 에서 구현)">
        <div className="flex flex-col gap-2">
          <h2 className="text-base font-semibold text-foreground">컨설팅 신청서</h2>
          <p className="text-sm text-muted-foreground break-keep-all">
            예약 시간을 먼저 선택한 뒤, 학생 정보·상담 주제·질문을 입력하면 컨설턴트에게 사전 공유됩니다.
          </p>
          <div
            role="note"
            className="rounded-lg border border-dashed border-border/80 bg-muted/40 px-4 py-6 text-center text-2xs text-muted-foreground"
          >
            신청서 폼은 곧 추가됩니다 — 우선 위에서 예약 시간을 선택해주세요.
          </div>
        </div>
      </Card>
    </div>
  );
}
