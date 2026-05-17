/**
 * /pricing — 요금제 (공개 SEO)
 *
 * Stage 5 재설계 (2026-05):
 * - 3-card grid + featured(시즌권) scale-up + 풀폭 그라디언트 리본
 * - 큰 가격 숫자 (52px) + tabular-nums + 기간 small
 * - 체크 리스트: 원형 brand 백그라운드 + 흰 체크
 * - 비교 테이블 신설 (feature × plan)
 * - 결제수단 카드 2단 분할 (아이콘 + 설명)
 *
 * 데이터: lib/plans.ts PRODUCTS_KR. 가격은 P-014 확정 전 placeholder.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, Sparkles, ShieldCheck, RefreshCw } from "lucide-react";
import { listEnabledProductsKr, type ProductDefKr } from "@/lib/plans";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "요금제 — conatusipsi",
  description:
    "단건 분석 리포트, AI 카운슬러 1회권, 시즌권. 한국 입시 시즌(7~11월) 전용 요금제.",
  openGraph: {
    type: "website",
    locale: "ko_KR",
    title: "요금제 — conatusipsi",
    description: "단건·시즌권 한국 대학 입시 분석 요금제",
    url: "https://conatusipsi.com/pricing",
  },
  alternates: { canonical: "/pricing" },
  robots: { index: true, follow: true },
};

/* ───────────────────────── 비교 테이블 데이터 ───────────────────────── */

const COMPARE_PLANS = [
  { kind: "report_one",   label: "단건 리포트", featured: false },
  { kind: "season_pass",  label: "시즌권",       featured: true  },
  { kind: "consult_one",  label: "단건 상담",   featured: false },
] as const;

type Feature = {
  group: string;
  name: string;
  values: Record<(typeof COMPARE_PLANS)[number]["kind"], string | boolean>;
};

const FEATURES: readonly Feature[] = [
  { group: "분석",   name: "학과별 합격 가능성 분석",     values: { report_one: "1회", season_pass: "무제한", consult_one: "—" } },
  { group: "분석",   name: "전형별 분리 (수시·정시·논술)", values: { report_one: true,  season_pass: true,    consult_one: false } },
  { group: "분석",   name: "재분석·시뮬레이션",            values: { report_one: false, season_pass: true,    consult_one: false } },
  { group: "상담",   name: "AI 카운슬러 채팅",             values: { report_one: "5턴", season_pass: "무제한", consult_one: "1회 세션" } },
  { group: "상담",   name: "프로필 기반 맞춤 답변",        values: { report_one: true,  season_pass: true,    consult_one: true  } },
  { group: "시즌",   name: "모집요강 자동 갱신",           values: { report_one: false, season_pass: true,    consult_one: false } },
  { group: "시즌",   name: "수시·정시 한 사이클",          values: { report_one: false, season_pass: true,    consult_one: false } },
  { group: "지원",   name: "이메일 문의",                  values: { report_one: true,  season_pass: true,    consult_one: true  } },
  { group: "지원",   name: "우선 응답",                    values: { report_one: false, season_pass: true,    consult_one: false } },
] as const;

/* ───────────────────────── 결제수단 ───────────────────────── */

const PAYMENT_METHODS = [
  { name: "신용카드", short: "VISA·Master·국내 카드" },
  { name: "토스",     short: "토스페이" },
  { name: "카카오",   short: "카카오페이" },
  { name: "네이버",   short: "네이버페이" },
  { name: "계좌이체", short: "실시간 계좌이체" },
] as const;

/* ───────────────────────── 더미 후기 ───────────────────────── */

const TESTIMONIALS = [
  {
    name: "고3 학부모 · 박**",
    plan: "시즌권",
    body: "9월 모의 직후 정시 가나다군 슬롯 시뮬레이션을 5회 돌려보고 결정. 다른 사이트보다 학과 단위 분리가 명확해서 큰 도움.",
  },
  {
    name: "고2 학생 · 김**",
    plan: "단건 리포트",
    body: "처음에 단건으로 써보고 만족해서 시즌권으로 업그레이드. AI 카운슬러가 같이 전략 잡아주는 게 특히 좋아요.",
  },
] as const;

export default function PricingPage(): React.ReactElement {
  const allProducts = listEnabledProductsKr();
  // primary 3-card grid 에 노출할 핵심 상품
  const PRIMARY_KINDS = ["report_one", "season_pass", "consult_one"] as const;
  const primary = PRIMARY_KINDS
    .map((k) => allProducts.find((p) => p.kind === k))
    .filter((p): p is ProductDefKr => Boolean(p));
  const subscription = allProducts.filter((p) => p.kind === "subscription_pro" || p.kind === "subscription_elite");

  return (
    <div className="relative">
      {/* 배경 mesh — 옅게 */}
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[60vh] overflow-hidden" aria-hidden>
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 h-[40rem] w-[80rem] rounded-full bg-gradient-to-b from-brand-200/40 via-iris/15 to-transparent blur-3xl dark:from-brand-700/15 dark:via-iris/10" />
      </div>

      <div className="mx-auto max-w-content-wide px-gutter-sm md:px-gutter lg:px-gutter-lg py-16 lg:py-24">
        {/* Header */}
        <header className="text-center max-w-2xl mx-auto mb-14 lg:mb-20 flex flex-col items-center gap-4">
          <Badge variant="pill-brand" size="md">
            <Sparkles className="h-3 w-3" />
            출시 전 임시 가격
          </Badge>
          <h1 className="font-display text-4xl lg:text-6xl font-extrabold tracking-tighter text-foreground break-keep-all leading-[1.05]">
            내 입시 시즌에 맞춰 결제하세요
          </h1>
          <p className="text-base lg:text-lg text-muted-foreground leading-relaxed break-keep-all">
            한 번만 쓰면 되는 분이라면 <strong className="text-foreground">단건권</strong>,
            수시·정시 사이클 전체를 활용한다면 <strong className="text-foreground">시즌권</strong>이 유리해요.
          </p>
        </header>

        {/* Primary 3-card grid */}
        <div className="grid gap-5 md:gap-6 md:grid-cols-3 max-w-5xl mx-auto items-stretch">
          {primary.map((p) => (
            <PricingCard key={p.kind} product={p} featured={p.kind === "season_pass"} />
          ))}
        </div>

        {/* Subscription row */}
        {subscription.length > 0 && (
          <section className="mt-16 max-w-5xl mx-auto">
            <div className="mb-6 flex items-center gap-3">
              <Badge variant="pill-iris" size="md">정기 구독</Badge>
              <span className="text-sm text-muted-foreground">더 자주 쓰신다면</span>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              {subscription.map((p) => (
                <PricingCard key={p.kind} product={p} compact />
              ))}
            </div>
          </section>
        )}

        {/* Comparison table */}
        <section className="mt-20 lg:mt-28 max-w-5xl mx-auto">
          <div className="mb-8 flex flex-col items-center text-center gap-3">
            <Badge variant="pill-iris" size="md">비교</Badge>
            <h2 className="font-display text-3xl lg:text-4xl font-extrabold tracking-tighter">
              어떤 게 나에게 맞을까요
            </h2>
          </div>

          <div className="overflow-hidden rounded-3xl border border-border bg-card/80 backdrop-blur-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-5 py-4 font-semibold">기능</th>
                  {COMPARE_PLANS.map((p) => (
                    <th
                      key={p.kind}
                      className={cn(
                        "px-3 py-4 font-semibold text-center break-keep-all",
                        p.featured && "text-brand-700 dark:text-brand-300",
                      )}
                    >
                      <div className="flex flex-col items-center gap-1">
                        <span>{p.label}</span>
                        {p.featured && <Badge variant="pill-brand" size="sm">추천</Badge>}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FEATURES.map((f, idx) => {
                  const prevGroup = idx > 0 ? FEATURES[idx - 1].group : null;
                  const showGroupLabel = prevGroup !== f.group;
                  return (
                    <tr key={f.name} className={cn("border-b border-border/60", showGroupLabel && idx > 0 && "border-t-2 border-t-border")}>
                      <td className="px-5 py-3.5 align-top">
                        {showGroupLabel && (
                          <span className="block text-2xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">{f.group}</span>
                        )}
                        <span className="text-foreground break-keep-all">{f.name}</span>
                      </td>
                      {COMPARE_PLANS.map((p) => {
                        const v = f.values[p.kind];
                        return (
                          <td
                            key={p.kind}
                            className={cn(
                              "px-3 py-3.5 text-center align-middle font-numeric tabular-nums text-sm",
                              p.featured && "bg-brand-50/40 dark:bg-brand-950/20",
                            )}
                          >
                            {v === true ? (
                              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-white">
                                <Check className="h-3 w-3" strokeWidth={3} />
                              </span>
                            ) : v === false ? (
                              <span className="text-muted-foreground/40">—</span>
                            ) : (
                              <span className="text-foreground">{v}</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Payment + trust card */}
        <section className="mt-20 lg:mt-28 max-w-5xl mx-auto">
          <div className="grid gap-5 lg:grid-cols-2 rounded-3xl overflow-hidden border border-border bg-card">
            {/* Left: payment methods */}
            <div className="p-7 lg:p-9 border-b lg:border-b-0 lg:border-r border-border bg-muted/20">
              <h3 className="text-lg font-bold mb-1">결제 수단</h3>
              <p className="text-sm text-muted-foreground mb-6">토스페이먼츠로 안전하게 처리됩니다.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {PAYMENT_METHODS.map((m) => (
                  <div
                    key={m.name}
                    className="flex flex-col items-start gap-1 rounded-xl border border-border bg-background px-3 py-2.5"
                  >
                    <span className="text-sm font-semibold">{m.name}</span>
                    <span className="text-2xs text-muted-foreground">{m.short}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: trust + info */}
            <div className="p-7 lg:p-9 flex flex-col gap-4">
              <h3 className="text-lg font-bold mb-1">결제 안내</h3>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li className="flex items-start gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-300">
                    <Check className="h-4 w-4" strokeWidth={2.5} />
                  </span>
                  <span className="break-keep-all leading-relaxed">결제 즉시 권한 활성화 · 영수증 이메일 자동 발송</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-300">
                    <RefreshCw className="h-4 w-4" />
                  </span>
                  <span className="break-keep-all leading-relaxed">
                    7일 이내 미사용 시 전액 환불 ·{" "}
                    <Link href="/refund" className="text-brand-700 dark:text-brand-300 underline decoration-brand-300/60 underline-offset-2">환불 정책</Link>
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300">
                    <ShieldCheck className="h-4 w-4" />
                  </span>
                  <span className="break-keep-all leading-relaxed">
                    표본 부족 학과는 확률 비공개 (정직성 원칙) — 정확하지 않은 추정치를 만들지 않습니다.
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* Testimonials */}
        <section className="mt-20 lg:mt-28 max-w-5xl mx-auto">
          <div className="mb-10 flex flex-col items-center text-center gap-3">
            <Badge variant="pill-violet" size="md">사용자 후기</Badge>
            <h2 className="font-display text-3xl lg:text-4xl font-extrabold tracking-tighter">
              실제로 어떻게 쓰고 있을까요
            </h2>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            {TESTIMONIALS.map((t) => (
              <article
                key={t.name}
                className="group flex flex-col gap-4 rounded-3xl border border-border bg-card p-7 transition-all hover:-translate-y-0.5 hover:border-foreground/15"
              >
                <p className="text-base leading-relaxed text-foreground/90 break-keep-all">
                  &ldquo;{t.body}&rdquo;
                </p>
                <div className="flex items-center justify-between border-t border-border/60 pt-4">
                  <span className="text-sm font-semibold">{t.name}</span>
                  <Badge variant="pill-brand" size="sm">{t.plan}</Badge>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="mt-20 lg:mt-28 text-center max-w-2xl mx-auto">
          <h3 className="font-display text-2xl lg:text-3xl font-extrabold tracking-tight mb-3">
            어떤 게 맞을지 망설여진다면
          </h3>
          <p className="text-base text-muted-foreground mb-6 break-keep-all">
            가입 후 무료 샘플 분석을 먼저 보고 결정하세요. 결제는 결과를 확인한 다음에 진행해도 늦지 않아요.
          </p>
          <Button asChild size="2xl" variant="primary" className="shadow-glow-brand">
            <Link href="/login?returnUrl=/onboarding">
              무료로 시작하기
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </section>
      </div>
    </div>
  );
}

/* ───────────────────────── PricingCard ───────────────────────── */

function PricingCard({
  product,
  featured = false,
  compact = false,
}: {
  product: ProductDefKr;
  featured?: boolean;
  compact?: boolean;
}): React.ReactElement {
  const periodLabel =
    product.period === "once"
      ? product.durationDays
        ? `${product.durationDays}일 사용`
        : "1회"
      : "/ 월";

  return (
    <article
      className={cn(
        "group relative flex flex-col gap-5 rounded-3xl bg-card border transition-all overflow-hidden",
        featured
          ? "border-brand-500/60 dark:border-brand-400/60 shadow-xl shadow-brand-500/15 md:scale-[1.03] md:-mt-3 ring-1 ring-brand-500/10"
          : "border-border hover:border-foreground/15 hover:-translate-y-0.5 hover:shadow-md",
        compact ? "p-6" : "p-7 lg:p-8",
      )}
    >
      {/* Featured ribbon — top full-width gradient */}
      {featured && (
        <div className="absolute inset-x-0 top-0 flex items-center justify-center bg-gradient-to-r from-brand-500 via-iris to-violet-500 py-1.5 text-2xs font-bold uppercase tracking-widest text-white">
          가장 인기 있는 선택
        </div>
      )}

      <header className={cn("flex flex-col gap-1", featured && "mt-6")}>
        <h2 className="text-base font-bold text-foreground">{product.displayName}</h2>
        <p className="text-xs text-muted-foreground break-keep-all leading-relaxed">
          {product.shortDescription}
        </p>
      </header>

      {/* Price */}
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline gap-2">
          <span className="font-numeric tabular-nums text-5xl font-extrabold tracking-tightest text-foreground leading-none">
            ₩{product.priceKrw.toLocaleString("ko-KR")}
          </span>
          <span className="text-xs font-medium text-muted-foreground">{periodLabel}</span>
        </div>
        {product.isPricePlaceholder && (
          <p className="text-2xs text-amber-700 dark:text-amber-400 font-numeric tabular-nums">
            ⚠️ 임시 가격 — 출시 시 변경
          </p>
        )}
      </div>

      {/* Highlights */}
      <ul className="flex flex-col gap-2.5 flex-1">
        {product.highlights.map((h) => (
          <li key={h} className="flex items-start gap-2.5 text-sm">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white shadow-sm shadow-brand-500/30 mt-0.5">
              <Check className="h-3 w-3" strokeWidth={3} />
            </span>
            <span className="text-foreground/90 break-keep-all leading-relaxed">{h}</span>
          </li>
        ))}
      </ul>

      <Button
        asChild
        size="xl"
        variant={featured ? "primary" : "outline"}
        className={cn("w-full", featured && "shadow-glow-brand")}
      >
        <Link href="/payment">
          결제하러 가기
          <ArrowRight className="h-4 w-4" />
        </Link>
      </Button>
    </article>
  );
}
