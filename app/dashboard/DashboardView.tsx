"use client";

/**
 * DashboardView — /dashboard 본체 (Client)
 *
 * 사이트맵 §2.3 매핑:
 *   - TodayFocusCard: 다음 D-Day(수시 원서접수·수능·정시 원서접수)를 한 카드에
 *   - SusiSlotProgress: 수시 6장 채움 상태
 *   - JeongsiSlotProgress: 정시 가/나/다군 슬롯 상태
 *   - 빠른 액션: 첫 분석·학과 둘러보기·카운슬러
 *
 * GET /api/user/dashboard 한 번 호출로 specs/intent를 묶어 받는다 (현재 stub).
 * stub 응답이어도 페이지는 빈 상태 카드로 동작 — 라우트 본체 PR 후 자동 활성화.
 *
 * 수능·원서접수 일정은 2027학년도 기준 (현재 고3이 응시할 일정). 시즌이 바뀌면
 * MILESTONES 상수만 갱신하면 된다 — 매년 7~9월 데이터 갱신 작업의 일부.
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  Bot,
  Calendar,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  Compass,
  GitCompare,
  Lightbulb,
  Loader2,
  Pencil,
  Sparkles,
  Target,
  Wand2,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { fetchWithAuth, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** 2027학년도 입시 주요 일정. 매년 7~9월에 갱신. */
const MILESTONES = [
  {
    id: "susi_apply",
    label: "수시 원서접수 시작",
    date: "2026-09-09",
    hint: "한국대학교육협의회 공식 일정 기준",
  },
  {
    id: "csat",
    label: "2027학년도 수능",
    date: "2026-11-12",
    hint: "수능 D-Day",
  },
  {
    id: "jeongsi_apply",
    label: "정시 원서접수 시작",
    date: "2026-12-29",
    hint: "가/나/다군 동일",
  },
] as const;

const SUSI_TOTAL = 6;
const JEONGSI_GROUPS = ["가", "나", "다"] as const;

interface DashboardData {
  /** GET /api/user/dashboard 응답. 현재 stub이라 todo 필드만 옴. */
  todo?: string;
  intent?: {
    susi?: Array<{ universityId: string; departmentId: string; trackName: string }>;
    jeongsi?: { ga?: unknown; na?: unknown; da?: unknown };
  };
  specs?: { latest?: { asOf?: { schoolYear: number; semester: number } } };
  /** 추가 필드는 라우트 본체 PR에서 정의. */
}

export function DashboardView(): React.ReactElement {
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();
  const [data, setData] = React.useState<DashboardData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // 비로그인 → /login으로 우회 (middleware는 /admin/*만 가드)
  React.useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login?returnUrl=/dashboard");
    }
  }, [authLoading, user, router]);

  React.useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchWithAuth<DashboardData>("/api/user/dashboard");
        if (!cancelled) setData(res);
      } catch (e) {
        if (cancelled) return;
        setError(
          e instanceof ApiError ? e.message : (e as Error).message,
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (authLoading || !user) {
    return <DashboardSkeleton />;
  }

  const displayName = profile?.name || (user.user_metadata?.name as string | undefined) || "학생";
  const susiCount = data?.intent?.susi?.length ?? 0;
  const jeongsiFilled = {
    ga: !!data?.intent?.jeongsi?.ga,
    na: !!data?.intent?.jeongsi?.na,
    da: !!data?.intent?.jeongsi?.da,
  };
  const hasSpec = !!data?.specs?.latest;

  return (
    <div className="flex flex-col gap-8">
      {/* Header — gradient background card */}
      <header className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-brand-50 via-background to-emerald-50/50 dark:from-brand-950/40 dark:via-background dark:to-emerald-950/30 p-6 lg:p-8">
        <div className="absolute top-0 right-0 -translate-y-1/4 translate-x-1/4 w-48 h-48 rounded-full bg-brand-300/20 blur-3xl" aria-hidden="true" />
        <div className="relative flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-400 mb-1.5">
              안녕하세요 👋
            </p>
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground tracking-tight">
              {displayName}님의 입시 대시보드
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              오늘도 한 걸음씩, 차근차근 진행해요.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button asChild size="default" variant="outline" className="backdrop-blur-sm bg-background/50">
              <Link href="/profile">
                <Pencil className="h-3.5 w-3.5" />
                프로필
              </Link>
            </Button>
            <Button asChild size="default" className="bg-brand-600 hover:bg-brand-700 text-white shadow-lg shadow-brand-500/30">
              <Link href="/analysis">
                분석 시작
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Spec 미작성 안내 (P-002 정직성 — 빈 데이터에 가짜 진행도 표시 X) */}
      {!loading && !hasSpec && (
        <Card variant="accent">
          <CardContent className="flex flex-col sm:flex-row sm:items-center gap-3 p-card-lg">
            <div className="w-10 h-10 rounded-xl bg-brand-500/15 text-brand-600 dark:text-brand-400 flex items-center justify-center shrink-0">
              <ClipboardList className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">
                먼저 입시 프로필부터 채워주세요
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 break-keep-all">
                내신·수능·생기부를 한 번 입력하면 합격률 분석·What-if·카운슬러가
                같은 데이터로 동작해요.
              </p>
            </div>
            <Button asChild size="sm" className="bg-brand-600 hover:bg-brand-700">
              <Link href="/onboarding">
                프로필 만들기
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* TodayFocusCard — D-Day 그리드 */}
      <section aria-label="입시 일정 D-Day">
        <SectionHeader
          icon={<Calendar className="h-4 w-4" />}
          title="다가오는 일정"
          hint="2027학년도 기준"
        />
        <div className="grid gap-3 sm:grid-cols-3">
          {MILESTONES.map((m) => (
            <DDayCard key={m.id} milestone={m} />
          ))}
        </div>
      </section>

      {/* Slot Progress: 수시 + 정시 */}
      <section aria-label="원서 슬롯 진행도" className="grid gap-3 lg:grid-cols-2">
        <SusiSlotProgress filled={susiCount} />
        <JeongsiSlotProgress filled={jeongsiFilled} />
      </section>

      {/* Quick actions — 기본 도구 */}
      <section aria-label="기본 도구">
        <SectionHeader
          icon={<Sparkles className="h-4 w-4" />}
          title="다음에 할 일"
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ActionCard
            href="/analysis"
            icon={<BarChart3 className="h-5 w-5" />}
            title="합격률 분석"
            body="내 성적으로 학과별 가능성 보기"
          />
          <ActionCard
            href="/admissions"
            icon={<Compass className="h-5 w-5" />}
            title="학과 둘러보기"
            body="모집요강·전형·일정 비교"
          />
          <ActionCard
            href="/chat"
            icon={<Bot className="h-5 w-5" />}
            title="AI 카운슬러"
            body="수시 6장·정시 전략 상담"
          />
          <ActionCard
            href="/orders"
            icon={<Target className="h-5 w-5" />}
            title="결제 내역"
            body="단건 분석권·시즌권 관리"
          />
        </div>
      </section>

      {/* Pro 도구 — Free 사용자엔 ProGate 잠금이 노출됨 (페이지에서 처리) */}
      <section aria-label="Pro 도구">
        <SectionHeader
          icon={<Sparkles className="h-4 w-4" />}
          title="Pro 도구"
          hint="요금제 가입 시 활성화"
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ActionCard
            href="/planner"
            icon={<CalendarCheck className="h-5 w-5" />}
            title="입시 플래너"
            body="원서·면접·논술·수능 task 자동 생성"
          />
          <ActionCard
            href="/spec-analysis"
            icon={<Lightbulb className="h-5 w-5" />}
            title="스펙 분석"
            body="비교과 영역별 강·약점 AI 분석"
          />
          <ActionCard
            href="/what-if"
            icon={<Wand2 className="h-5 w-5" />}
            title="What-If 시뮬"
            body="등급 조정 → 합격률 변화 확인"
          />
          <ActionCard
            href="/compare"
            icon={<GitCompare className="h-5 w-5" />}
            title="학과 비교"
            body="2~4개 학과 모집요강·합격률"
          />
        </div>
      </section>

      {error && (
        <p
          role="alert"
          className="text-xs text-muted-foreground border-t pt-3"
        >
          ⚠️ 대시보드 데이터 조회 실패: {error} — 일부 카드가 비어있을 수 있어요.
        </p>
      )}
    </div>
  );
}

function DashboardSkeleton(): React.ReactElement {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
        <Skeleton className="h-7 w-48" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <span className="text-brand-600 dark:text-brand-400">{icon}</span>
        {title}
      </div>
      {hint && <span className="text-2xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

function DDayCard({
  milestone,
}: {
  milestone: { id: string; label: string; date: string; hint: string };
}): React.ReactElement {
  // SSR-safe: 클라이언트 mount 후에만 정확한 D-Day 계산.
  // (Hydration mismatch 방지를 위해 초기 렌더는 날짜 라벨만 노출.)
  const [dday, setDday] = React.useState<number | null>(null);
  React.useEffect(() => {
    const target = new Date(milestone.date + "T00:00:00");
    const now = new Date();
    const diff = Math.ceil(
      (target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );
    setDday(diff);
  }, [milestone.date]);

  const display = dday == null ? "" : formatDDay(dday);
  const isPast = dday != null && dday < 0;

  return (
    <Card
      className={cn(
        "p-card-lg flex flex-col gap-1.5",
        isPast && "opacity-60",
      )}
    >
      <p className="text-xs text-muted-foreground">{milestone.label}</p>
      <p
        className={cn(
          "text-2xl font-bold tabular-nums",
          isPast ? "text-muted-foreground" : "text-brand-600 dark:text-brand-400",
        )}
      >
        {display || <span className="invisible">D-000</span>}
      </p>
      <p className="text-2xs text-muted-foreground">
        {milestone.date} · {milestone.hint}
      </p>
    </Card>
  );
}

function formatDDay(d: number): string {
  if (d === 0) return "D-Day";
  if (d < 0) return `D+${Math.abs(d)}`;
  return `D-${d}`;
}

function SusiSlotProgress({ filled }: { filled: number }): React.ReactElement {
  return (
    <Card className="p-card-lg">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">수시 6장</span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {filled} / {SUSI_TOTAL}
          </span>
        </div>
        <Button asChild size="sm" variant="ghost" className="text-xs">
          <Link href="/analysis">채우기 →</Link>
        </Button>
      </div>
      <ol className="grid grid-cols-6 gap-1.5">
        {Array.from({ length: SUSI_TOTAL }).map((_, i) => (
          <li
            key={i}
            data-state={i < filled ? "filled" : "empty"}
            className={cn(
              "h-8 rounded-md flex items-center justify-center text-2xs font-semibold",
              i < filled
                ? "bg-brand-500 text-white"
                : "bg-muted text-muted-foreground border border-dashed border-border",
            )}
          >
            {i + 1}
          </li>
        ))}
      </ol>
      <p className="mt-2.5 text-2xs text-muted-foreground break-keep-all">
        한국대학교육협의회 규정상 수시 지원은 최대 6개 학과까지 가능합니다.
      </p>
    </Card>
  );
}

function JeongsiSlotProgress({
  filled,
}: {
  filled: { ga: boolean; na: boolean; da: boolean };
}): React.ReactElement {
  const total = Object.values(filled).filter(Boolean).length;
  return (
    <Card className="p-card-lg">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">정시 가/나/다군</span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {total} / 3
          </span>
        </div>
        <Button asChild size="sm" variant="ghost" className="text-xs">
          <Link href="/analysis">채우기 →</Link>
        </Button>
      </div>
      <ol className="grid grid-cols-3 gap-2">
        {JEONGSI_GROUPS.map((g) => {
          const key = g === "가" ? "ga" : g === "나" ? "na" : "da";
          const isFilled = filled[key];
          return (
            <li
              key={g}
              data-state={isFilled ? "filled" : "empty"}
              className={cn(
                "h-14 rounded-lg flex flex-col items-center justify-center gap-0.5 transition-colors",
                isFilled
                  ? "bg-brand-500 text-white"
                  : "bg-muted text-muted-foreground border border-dashed border-border",
              )}
            >
              <span className="text-base font-bold">{g}군</span>
              {isFilled && <CheckCircle2 className="h-3 w-3" />}
            </li>
          );
        })}
      </ol>
      <p className="mt-2.5 text-2xs text-muted-foreground break-keep-all">
        정시는 군별로 한 학과씩만 지원 가능합니다 (가·나·다 각 1).
      </p>
    </Card>
  );
}

function ActionCard({
  href,
  icon,
  title,
  body,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  body: string;
}): React.ReactElement {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-border/60 bg-card p-card-lg shadow-sm hover:shadow-md hover:border-brand-300 dark:hover:border-brand-700 transition-all flex flex-col gap-3"
    >
      <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-950/60 text-brand-600 dark:text-brand-400 flex items-center justify-center">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          {title}
          <ArrowRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
        </p>
        <p className="text-xs text-muted-foreground mt-1 break-keep-all leading-relaxed">
          {body}
        </p>
      </div>
    </Link>
  );
}
