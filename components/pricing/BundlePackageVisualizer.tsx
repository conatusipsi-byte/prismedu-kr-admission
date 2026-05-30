/**
 * BundlePackageVisualizer — 번들 = 시즌권 + 컨설팅 조합 시각화 (BUG-021, 2026-05-25).
 *
 * 카드 영역 5개 vs 비교표 컬럼 3개 갭 해소:
 *   - 비교표는 단순 유지 (단건 / 시즌권 / 컨설팅 3개)
 *   - 본 컴포넌트가 번들 = 단건 조합 + 절약 시각화
 *
 * P-002 정직성:
 *   - 단건 합산 (line-through) + 번들 가격 (강조) 동시 노출
 *   - 절약액은 calculateBundleSavings 단일 진실 재사용 (BUG-017)
 *   - 얼리버드 종료 후 음수 절약은 자동 숨김
 *   - season_consult_3 시기 슬롯 라벨 노출
 */

import { Check, ArrowRight } from "lucide-react";
import Link from "next/link";
import {
  getProductKr,
  getEffectivePriceKrw,
  calculateBundleSavings,
  TIME_SLOT_LABELS,
  type ProductDefKr,
  type ProductBundleContent,
} from "@/lib/plans";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const BUNDLE_KINDS = ["season_consult_1", "season_consult_3"] as const;

export function BundlePackageVisualizer(): React.ReactElement | null {
  const bundles = BUNDLE_KINDS.map((k) => getProductKr(k)).filter(
    (p): p is ProductDefKr => Boolean(p?.enabled),
  );
  if (bundles.length === 0) return null;

  return (
    <section
      data-component="bundle-package-visualizer"
      className="mt-16 lg:mt-24 max-w-5xl mx-auto"
    >
      <div className="mb-8 flex flex-col items-center text-center gap-3">
        <Badge variant="pill-iris" size="md">패키지 구성</Badge>
        <h2 className="font-display text-2xl lg:text-3xl font-extrabold tracking-tighter">
          번들 = 단건의 조합
        </h2>
        <p className="text-sm text-muted-foreground break-keep-all max-w-md">
          시즌권과 1:1 컨설팅을 묶어 단건 합산보다 저렴한 패키지로 제공합니다.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {bundles.map((bundle) => (
          <BundleCard key={bundle.kind} bundle={bundle} />
        ))}
      </div>
    </section>
  );
}

function BundleCard({ bundle }: { bundle: ProductDefKr }): React.ReactElement {
  const savings = calculateBundleSavings(bundle);
  const effectivePrice = getEffectivePriceKrw(bundle);

  return (
    <article
      data-component="bundle-visualizer-card"
      data-product-kind={bundle.kind}
      className="rounded-3xl border border-iris/30 bg-card/80 backdrop-blur-sm p-6 lg:p-7 flex flex-col gap-4"
    >
      <header className="flex items-start justify-between gap-2 flex-wrap">
        <h3 className="text-base font-bold text-foreground break-keep-all">
          {bundle.displayName}
        </h3>
      </header>

      {/* 구성 — 시즌권 / 컨설팅 N회 */}
      <ul className="flex flex-col gap-2.5">
        {(bundle.bundleContents ?? []).map((part: ProductBundleContent, i: number) => (
          <li
            key={i}
            data-element="bundle-part"
            data-part-kind={part.kind}
            className="flex items-start gap-2.5 text-sm"
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-iris/15 text-iris mt-0.5">
              <Check className="h-3 w-3" strokeWidth={3} />
            </span>
            <div className="flex flex-col gap-0.5">
              <span className="text-foreground font-medium break-keep-all">
                {part.kind === "subscription" && "2027대입 시즌권 분석 무제한"}
                {part.kind === "consulting" && `1:1 컨설팅 ${part.count}회 (각 60분)`}
              </span>
              {part.timeSlots && part.timeSlots.length > 0 && (
                <span
                  data-element="bundle-time-slots"
                  className="text-2xs text-muted-foreground"
                >
                  시기: {part.timeSlots.map((t) => TIME_SLOT_LABELS[t]).join(" · ")}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>

      {/* 가격 비교 — 단건 합산 line-through + 번들 effective */}
      {savings && (
        <div
          data-element="bundle-price-comparison"
          className="rounded-2xl bg-muted/30 px-4 py-3 flex flex-col gap-1"
        >
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-muted-foreground">단건 합산</span>
            <span className="font-numeric tabular-nums text-muted-foreground line-through">
              ₩{savings.individualTotal.toLocaleString("ko-KR")}
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-semibold text-foreground">패키지 가격</span>
            <span className="font-numeric tabular-nums text-2xl font-extrabold text-foreground">
              ₩{effectivePrice.toLocaleString("ko-KR")}
            </span>
          </div>
          {savings.savings > 0 && (
            <p
              data-element="bundle-savings-line"
              className="text-2xs font-semibold text-iris font-numeric tabular-nums text-right"
            >
              ₩{savings.savings.toLocaleString("ko-KR")} 절약
            </p>
          )}
        </div>
      )}

      <Button asChild size="lg" variant="outline" className="w-full">
        <Link href="/payment">
          결제하러 가기
          <ArrowRight className="h-4 w-4" />
        </Link>
      </Button>
    </article>
  );
}
