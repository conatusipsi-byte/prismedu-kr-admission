/**
 * /pricing — 요금제 (공개 SEO)
 *
 * Stage 5 재설계 (2026-05). QA round 2 ④ (2026-05-25):
 *   - 5 상품 노출 (단건/시즌권/컨설팅 + 번들 2종)
 *   - 얼리버드 가격 강조 (정가 취소선 + ~2027.03까지 배지)
 *   - 컨설턴트 명칭: "코나투스 입시 컨설턴트"
 *   - 비교표 = 단건/시즌권/컨설팅 3-card 기준 유지 (번들은 시즌권+컨설팅 합산)
 *
 * 데이터: lib/plans.ts PRODUCTS_KR. 가격은 P-014 확정 (season_pass·consult·번들 확정).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, Sparkles, ShieldCheck, RefreshCw } from "lucide-react";
import {
  listEnabledProductsKr,
  getProductKr,
  getEffectivePriceKrw,
  isEarlybirdActive,
  calculateBundleSavings,
  TIME_SLOT_LABELS,
  type ProductDefKr,
} from "@/lib/plans";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "요금제 — Conatus",
  description:
    "단건 분석 리포트, 1:1 컨설팅, 시즌권, 시즌+컨설팅 번들. 한국 입시 시즌 전용 요금제.",
  openGraph: {
    type: "website",
    locale: "ko_KR",
    title: "요금제 — Conatus",
    description: "단건·시즌권·번들 한국 대학 입시 요금제",
    url: "https://conatusipsi.com/pricing",
  },
  alternates: { canonical: "/pricing" },
  robots: { index: true, follow: true },
};

/* ───────────────────────── 비교 테이블 데이터 ───────────────────────── */

const COMPARE_PLANS = [
  { kind: "report_one",   label: "단건 리포트", featured: false },
  { kind: "season_pass",  label: "시즌권",       featured: true  },
  { kind: "consult_one",  label: "1:1 컨설팅",   featured: false },
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
  { group: "상담",   name: "AI 카운슬러 채팅",             values: { report_one: "5턴", season_pass: "무제한", consult_one: "—" } },
  { group: "상담",   name: "1:1 컨설팅 (60분)",            values: { report_one: false, season_pass: false,   consult_one: "1회" } },
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
  // PRIMARY: 단건·시즌권·컨설팅 3종 카드 (QA round 2 ④ 자 consult_one 활성화 — 더이상 "출시 예정" X)
  const PRIMARY_KINDS = ["report_one", "season_pass", "consult_one"] as const;
  const primary = PRIMARY_KINDS
    .map((k) => getProductKr(k))
    .filter((p): p is ProductDefKr => Boolean(p));
  // BUNDLE: 시즌권 + 컨설팅 패키지 2종
  const BUNDLE_KINDS = ["season_consult_1", "season_consult_3"] as const;
  const bundles = BUNDLE_KINDS
    .map((k) => getProductKr(k))
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
            얼리버드 가격 (~2027.03)
          </Badge>
          <h1 className="font-display text-4xl lg:text-6xl font-extrabold tracking-tighter text-foreground break-keep-all leading-[1.05]">
            내 입시 시즌에 맞춰 결제하세요
          </h1>
          <p className="text-base lg:text-lg text-muted-foreground leading-relaxed break-keep-all">
            한 번만 쓰면 되는 분이라면 <strong className="text-foreground">단건권</strong>,
            수시·정시 사이클 전체를 활용한다면 <strong className="text-foreground">시즌권</strong>,
            전략 상담까지 받고 싶다면 <strong className="text-foreground">시즌+컨설팅 번들</strong>이 유리해요.
          </p>
        </header>

        {/* Primary 3-card grid */}
        <div className="grid gap-5 md:gap-6 md:grid-cols-3 max-w-5xl mx-auto items-stretch">
          {primary.map((p) => (
            <PricingCard key={p.kind} product={p} featured={p.kind === "season_pass"} />
          ))}
        </div>

        {/* Bundle row — 시즌권 + 컨설팅 패키지 */}
        {bundles.length > 0 && (
          <section className="mt-16 max-w-5xl mx-auto">
            <div className="mb-6 flex items-center gap-3">
              <Badge variant="pill-iris" size="md">패키지</Badge>
              <span className="text-sm text-muted-foreground break-keep-all">
                시즌권 + 1:1 컨설팅 — 단건 합산 대비 절약
              </span>
            </div>
            <div className="grid gap-5 md:grid-cols-2 items-stretch">
              {bundles.map((p) => (
                <PricingCard key={p.kind} product={p} compact />
              ))}
            </div>
          </section>
        )}

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
            <p className="text-sm text-muted-foreground break-keep-all">
              번들 패키지는 시즌권 + 컨설팅 행이 모두 포함됩니다.
            </p>
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

/**
 * 카드 종류:
 *   - enabled=false → "출시 예정" 카드 (BUG-006)
 *   - earlybird 활성 → 정가 취소선 + 얼리버드 가격 강조 + "~earlybirdUntil" 배지 (QA round 2 ④)
 *   - bundle 카드 → 번들 포함 내용 노출 (시즌권 + 컨설팅 N회, 시기 슬롯 라벨)
 */
const COMING_SOON_DATES: Partial<Record<ProductDefKr["kind"], string>> = {
  // QA round 2 ④ — consult_one 활성화. 향후 다른 상품이 비활성으로 들어올 때 본 맵 사용.
};

function PricingCard({
  product,
  featured = false,
  compact = false,
}: {
  product: ProductDefKr;
  featured?: boolean;
  compact?: boolean;
}): React.ReactElement {
  const comingSoon = !product.enabled;
  const comingSoonLabel = COMING_SOON_DATES[product.kind] ?? "출시 예정";
  const earlybird = isEarlybirdActive(product);
  const effectivePrice = getEffectivePriceKrw(product);
  const regularPrice = product.regularPriceKrw ?? product.priceKrw;
  const periodLabel =
    product.period === "once"
      ? product.durationDays
        ? `${product.durationDays}일 사용`
        : "1회"
      : "/ 월";

  return (
    <article
      data-component="pricing-card"
      data-product-kind={product.kind}
      data-coming-soon={comingSoon}
      data-earlybird={earlybird}
      className={cn(
        "group relative flex flex-col gap-5 rounded-3xl bg-card border transition-all overflow-hidden",
        featured
          ? "border-brand-500/60 dark:border-brand-400/60 shadow-xl shadow-brand-500/15 md:scale-[1.03] md:-mt-3 ring-1 ring-brand-500/10"
          : comingSoon
            ? "border-dashed border-zinc-300 dark:border-zinc-700"
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
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-bold text-foreground">{product.displayName}</h2>
          {comingSoon && (
            <Badge variant="pill-amber" size="sm" data-element="coming-soon-badge">
              {comingSoonLabel}
            </Badge>
          )}
          {!comingSoon && earlybird && (
            <Badge variant="pill-brand" size="sm" data-element="earlybird-badge">
              얼리버드 ~{product.earlybirdUntil?.slice(0, 7).replace("-", ".")}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground break-keep-all leading-relaxed">
          {product.shortDescription}
        </p>
      </header>

      {/* Price */}
      <div className="flex flex-col gap-1.5">
        {!comingSoon && product.isPricePlaceholder && (
          <Badge variant="pill-amber" size="sm" className="self-start">베타 임시 가격</Badge>
        )}
        <div className="flex items-baseline gap-2 flex-wrap">
          {comingSoon ? (
            <span className="text-3xl font-extrabold tracking-tight text-muted-foreground/80 leading-none">
              준비 중
            </span>
          ) : (
            <>
              {earlybird && regularPrice !== effectivePrice && (
                <span
                  data-element="regular-price-strikethrough"
                  className="font-numeric tabular-nums text-base font-medium text-muted-foreground line-through"
                >
                  ₩{regularPrice.toLocaleString("ko-KR")}
                </span>
              )}
              <span className="font-numeric tabular-nums text-5xl font-extrabold tracking-tightest text-foreground leading-none">
                ₩{effectivePrice.toLocaleString("ko-KR")}
              </span>
              <span className="text-xs font-medium text-muted-foreground">{periodLabel}</span>
            </>
          )}
        </div>
        {!comingSoon && product.isPricePlaceholder && (
          <p className="text-2xs text-muted-foreground">정식 출시(2026.09) 전 변경될 수 있어요.</p>
        )}
        {!comingSoon && earlybird && product.earlybirdUntil && (
          <p className="text-2xs text-muted-foreground break-keep-all">
            {product.earlybirdUntil} 까지 얼리버드 가격 적용. 이후 정가 ₩{regularPrice.toLocaleString("ko-KR")}.
          </p>
        )}
        {comingSoon && (
          <p className="text-2xs text-muted-foreground break-keep-all">
            상품 안내·가격은 출시일에 맞춰 공개됩니다.
          </p>
        )}
      </div>

      {/* Bundle 포함 내용 */}
      {product.bundleContents && product.bundleContents.length > 0 && (() => {
        // BUG-017: 절약액은 calculateBundleSavings 가 단일 진실. 정적 카피 금지.
        const savings = calculateBundleSavings(product);
        return (
          <div
            data-element="bundle-contents"
            className="rounded-2xl border border-iris/30 bg-iris/5 dark:bg-iris/10 p-3 text-xs"
          >
            <p className="mb-2 text-2xs font-semibold uppercase tracking-wider text-iris">패키지 구성</p>
            <ul className="space-y-1.5">
              {product.bundleContents.map((c, i) => (
                <li key={i} className="flex items-start gap-1.5 text-foreground break-keep-all">
                  <span className="text-iris">·</span>
                  <span>
                    {c.kind === "subscription" && "시즌권 분석 무제한"}
                    {c.kind === "consulting" && `1:1 컨설팅 ${c.count}회`}
                    {c.timeSlots && (
                      <span className="block text-2xs text-muted-foreground mt-0.5">
                        시기: {c.timeSlots.map((t) => TIME_SLOT_LABELS[t]).join(" · ")}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            {savings && savings.savings > 0 && (
              <p
                data-element="bundle-savings"
                className="mt-3 pt-2 border-t border-iris/20 text-2xs text-foreground/80 font-numeric tabular-nums break-keep-all"
              >
                단건 합산 <span className="line-through text-muted-foreground">₩{savings.individualTotal.toLocaleString("ko-KR")}</span>
                {" 대비 "}
                <strong className="text-iris">₩{savings.savings.toLocaleString("ko-KR")} 절약</strong>
              </p>
            )}
          </div>
        );
      })()}

      {/* Highlights */}
      <ul className="flex flex-col gap-2.5 flex-1">
        {product.highlights.map((h) => (
          <li key={h} className="flex items-start gap-2.5 text-sm">
            <span
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white shadow-sm mt-0.5",
                comingSoon ? "bg-zinc-400 shadow-zinc-400/20" : "bg-brand-500 shadow-brand-500/30",
              )}
            >
              <Check className="h-3 w-3" strokeWidth={3} />
            </span>
            <span className="text-foreground/90 break-keep-all leading-relaxed">{h}</span>
          </li>
        ))}
      </ul>

      {comingSoon ? (
        <Button
          type="button"
          size="xl"
          variant="outline"
          disabled
          aria-disabled="true"
          className="w-full cursor-not-allowed opacity-70"
        >
          출시 예정
        </Button>
      ) : (
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
      )}
    </article>
  );
}
