/**
 * /consulting — 1:1 입시 컨설팅 예약 페이지.
 *
 * Day 4 (현재): 캘린더 + 신청서 + 예약 확정 (RPC) + 시기 슬롯 안내 배너.
 *
 * 권한 흐름:
 *   - 미로그인 → /consulting/layout.tsx 가 /login redirect.
 *   - entitlement 미보유 → 본 페이지에서 /pricing#consulting redirect (my-bookings 가 같은
 *     layout 아래라 entitlement 게이트를 layout 에 두면 이력 조회까지 막힘).
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { getRouteSupabase } from "@/lib/supabase-server";
import {
  getConsultingEntitlement,
  getCalendarEntitlementSummary,
} from "@/lib/consulting/entitlement";
import { TIME_SLOT_LABELS } from "@/lib/plans";
import { ConsultantProfile } from "@/components/consulting/ConsultantProfile";
import { ConsultingBookingSection } from "./BookingSection";
import { Card } from "@/components/ui/card";
import { Info, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "1:1 입시 컨설팅 예약 | 코나투스 입시",
  description:
    "코나투스 입시 컨설턴트와 1:1 한국 대학 입시 컨설팅 (60분). 정시·수시·학종 전 영역 맞춤 상담.",
};

export default async function ConsultingPage() {
  const sb = await getRouteSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/login?returnUrl=/consulting");

  const ent = await getConsultingEntitlement(user.id);
  if (!ent.hasAccess && ent.pendingFutureSlots.length === 0) {
    redirect("/pricing#consulting");
  }
  const calendarEnt = await getCalendarEntitlementSummary(user.id);

  return (
    <div className="container max-w-5xl py-section flex flex-col gap-section">
      <header className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <p className="text-2xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-400">
              컨설팅
            </p>
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground tracking-tight">
              1:1 입시 컨설팅 예약
            </h1>
          </div>
          <Link
            href="/consulting/my-bookings"
            className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 dark:text-brand-400 hover:underline"
          >
            내 예약 보기
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <p className="text-sm text-muted-foreground break-keep-all">
          원하는 시간을 선택하면 컨설턴트가 확정 알림을 보내드려요. 세션은 60분, 화상 또는 대면으로 진행합니다.
        </p>
      </header>

      {/* 보유 컨설팅 안내 */}
      <EntitlementBanner ent={ent} />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-card">
        <ConsultantProfile />
        <Card className="p-card-lg">
          <ConsultingBookingSection calendarEntitlement={calendarEnt} />
        </Card>
      </div>
    </div>
  );
}

interface EntBannerProps {
  ent: {
    remainingCredits: number;
    pendingFutureSlots: Array<{
      timeSlot: keyof typeof TIME_SLOT_LABELS;
      validFrom: string;
      orderId: string;
    }>;
  };
}

function EntitlementBanner({ ent }: EntBannerProps): React.ReactElement {
  const hasPending = ent.pendingFutureSlots.length > 0;
  if (!hasPending) {
    return (
      <div
        data-component="entitlement-banner"
        data-variant="simple"
        className="flex items-center gap-2 rounded-lg border border-brand-200/60 dark:border-brand-800/40 bg-brand-50/60 dark:bg-brand-950/30 px-3 py-2 text-sm"
      >
        <Info className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" aria-hidden />
        <span className="text-foreground">
          보유 컨설팅: <strong className="font-numeric tabular-nums">{ent.remainingCredits}회</strong>
        </span>
      </div>
    );
  }

  return (
    <div
      data-component="entitlement-banner"
      data-variant="detailed"
      className="flex flex-col gap-2 rounded-lg border border-iris/30 bg-iris/5 dark:bg-iris/10 px-4 py-3 text-sm"
    >
      <div className="flex items-center gap-2">
        <Info className="h-4 w-4 shrink-0 text-iris" aria-hidden />
        <span className="font-semibold text-foreground">보유 컨설팅 정보</span>
      </div>
      <ul className="space-y-1 text-sm text-foreground/90 ml-6">
        <li className="flex items-baseline justify-between gap-3">
          <span>즉시 예약 가능</span>
          <strong className="font-numeric tabular-nums">{ent.remainingCredits}회</strong>
        </li>
        {ent.pendingFutureSlots.map((s) => (
          <li key={`${s.orderId}-${s.timeSlot}`} className="flex items-baseline justify-between gap-3 text-muted-foreground">
            <span>{TIME_SLOT_LABELS[s.timeSlot]} 예약 가능</span>
            <span className="text-2xs">
              {s.validFrom.slice(0, 10)} 부터
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
