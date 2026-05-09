/**
 * /pricing — 요금제 페이지 (공개 SEO)
 *
 * lib/plans.ts 의 PRODUCTS_KR 카탈로그에서 활성 상품을 가져와 카드로 렌더.
 * 결제 자체는 /payment 에서 이루어짐 — 본 페이지는 비교·진입점만.
 *
 * P-002 정직성: 모든 가격에 ⚠️ placeholder 마커 노출 (P-014 확정 전).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { listEnabledProductsKr } from "@/lib/plans";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

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

export default function PricingPage(): React.ReactElement {
  const products = listEnabledProductsKr();

  return (
    <div className="mx-auto max-w-content-wide px-gutter-sm md:px-gutter lg:px-gutter-lg py-10 lg:py-16">
      <header className="text-center max-w-2xl mx-auto mb-10 lg:mb-14">
        <p className="inline-flex items-center gap-2 rounded-full bg-mint-50 dark:bg-mint-950/60 border border-mint-200 dark:border-mint-800 px-4 py-1.5 text-xs font-semibold text-mint-700 dark:text-mint-300 mb-4">
          <Sparkles className="h-3.5 w-3.5" />
          출시 전 임시 가격 (P-014 확정 예정)
        </p>
        <h1 className="text-3xl lg:text-4xl font-bold text-foreground mb-3 break-keep-all">
          내 입시 시즌에 맞춰 결제하세요
        </h1>
        <p className="text-sm lg:text-base text-muted-foreground leading-relaxed break-keep-all">
          시즌 한 번만 쓰면 되는 분이라면 <strong className="text-foreground">단건권</strong>,
          수시·정시 사이클 전체를 활용한다면 <strong className="text-foreground">시즌권</strong>이
          유리해요. 결제 후 즉시 활성화됩니다.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 max-w-5xl mx-auto">
        {products.map((p) => {
          const featured = p.kind === "season_pass";
          return (
            <Card
              key={p.kind}
              className={
                featured
                  ? "p-card-lg flex flex-col gap-4 border-2 border-mint-500 dark:border-mint-400 shadow-lg shadow-mint-500/15 relative"
                  : "p-card-lg flex flex-col gap-4"
              }
            >
              {featured && (
                <span className="absolute -top-3 left-card-lg inline-flex items-center gap-1 rounded-full bg-mint-500 text-white text-2xs font-semibold px-2.5 py-1">
                  추천
                </span>
              )}
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  {p.displayName}
                </h2>
                <p className="text-xs text-muted-foreground mt-1 break-keep-all leading-relaxed">
                  {p.shortDescription}
                </p>
              </div>

              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-bold text-foreground tabular-nums">
                  ₩{p.priceKrw.toLocaleString("ko-KR")}
                </span>
                <span className="text-xs text-muted-foreground">
                  / {p.period === "once" ? `${p.durationDays}일` : "월"}
                </span>
              </div>
              {p.isPricePlaceholder && (
                <p className="text-2xs text-amber-700 dark:text-amber-400">
                  ⚠️ 임시 가격 — 출시 시 변경될 수 있음
                </p>
              )}

              <ul className="space-y-1.5 flex-1">
                {p.highlights.map((h) => (
                  <li
                    key={h}
                    className="flex items-start gap-2 text-xs text-foreground"
                  >
                    <Check className="h-3.5 w-3.5 text-mint-600 dark:text-mint-400 shrink-0 mt-0.5" />
                    <span className="break-keep-all leading-relaxed">{h}</span>
                  </li>
                ))}
              </ul>

              <Button
                asChild
                size="lg"
                className={
                  featured
                    ? "bg-mint-600 hover:bg-mint-700 w-full"
                    : "w-full"
                }
                variant={featured ? "default" : "outline"}
              >
                <Link href="/payment">
                  결제하러 가기
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </Card>
          );
        })}
      </div>

      <section className="mt-12 max-w-3xl mx-auto rounded-2xl bg-card border border-border/60 p-card-lg space-y-3">
        <h3 className="text-sm font-semibold text-foreground">결제 안내</h3>
        <ul className="text-xs text-muted-foreground space-y-2 leading-relaxed break-keep-all">
          <li>• 토스페이먼츠로 신용카드·계좌이체·간편결제(카카오페이·네이버페이)를 지원합니다.</li>
          <li>• 결제 즉시 권한이 활성화되며, 영수증은 등록된 이메일로 자동 발송됩니다.</li>
          <li>
            • 환불 정책은{" "}
            <Link href="/refund" className="text-mint-600 dark:text-mint-400 underline">
              환불 페이지
            </Link>
            에서 확인하세요. 결제 후 7일 이내 미사용 시 전액 환불됩니다.
          </li>
          <li>
            • 표본이 부족한 학과는 합격 확률을 표시하지 않습니다 (정직성 원칙). 시즌권/단건권
            모두 환불 사유에 해당하지 않습니다 — 정확하지 않은 추정치를 만들지 않는 게
            서비스의 핵심입니다.
          </li>
        </ul>
      </section>
    </div>
  );
}
