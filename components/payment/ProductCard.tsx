"use client";

/**
 * ProductCard — 결제 상품 카드 (단건/구독 공통)
 *
 * lib/plans.ts의 ProductDefKr를 받아 가격·하이라이트·구매 CTA를 표시.
 *
 * 회귀 (P-002 정직성):
 *   - isPricePlaceholder=true 상품은 ⚠️ "임시 가격" 마커 노출
 *   - "확정 합격" 표현 0건
 *
 * 회귀 (P-001):
 *   - blocksOnInsufficientSample=true 상품은 표본 부족 컨텍스트에서 비활성화 (호출자가 결정)
 */

import * as React from "react";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ProductDefKr } from "@/lib/plans";

export interface ProductCardProps {
  product: ProductDefKr;
  /** 결제 진행 중 (호출자가 관리) */
  pending?: boolean;
  /** 비활성화 사유 — 표시용 (P-001 등) */
  disabledReason?: string | null;
  onPurchase?: (kind: ProductDefKr["kind"]) => void;
  className?: string;
}

const PERIOD_LABEL: Record<ProductDefKr["period"], string> = {
  once: "1회 결제",
  monthly: "월간 구독",
  yearly: "연간 구독",
};

export function ProductCard({
  product,
  pending,
  disabledReason,
  onPurchase,
  className,
}: ProductCardProps): React.ReactElement {
  const disabled = !!pending || !!disabledReason;

  return (
    <Card
      data-component="product-card"
      data-product-kind={product.kind}
      data-disabled={disabled}
      className={cn(
        "h-full transition",
        disabledReason ? "opacity-60" : "hover:shadow-md hover:border-mint-300",
        className,
      )}
    >
      <CardContent className="flex h-full flex-col gap-4 py-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-1 min-w-0">
            <h3 className="truncate text-base font-semibold">{product.displayName}</h3>
            <p className="text-xs text-muted-foreground">{product.shortDescription}</p>
          </div>
          <Badge variant="outline" className="shrink-0 text-xs">
            {PERIOD_LABEL[product.period]}
          </Badge>
        </div>

        {/* 가격 */}
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold tabular-nums">
            {product.priceKrw.toLocaleString("ko-KR")}원
          </span>
          {product.period !== "once" && (
            <span className="text-xs text-muted-foreground">/ 월</span>
          )}
          {product.isPricePlaceholder && (
            <Badge
              variant="outline"
              data-element="price-placeholder-badge"
              className="ml-1 border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300"
            >
              <AlertTriangle aria-hidden className="mr-0.5 h-3 w-3" />
              임시 가격
            </Badge>
          )}
        </div>
        {product.isPricePlaceholder && (
          <p className="text-2xs text-muted-foreground">
            ⚠️ 본 가격은 출시 전 임시값입니다 (P-014 정책 확정 전).
          </p>
        )}

        {/* highlights */}
        <ul className="flex flex-col gap-1.5">
          {product.highlights.map((h, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs">
              <Check aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-mint-600" />
              <span>{h}</span>
            </li>
          ))}
        </ul>

        {/* 비활성 사유 */}
        {disabledReason && (
          <div
            data-element="disabled-reason"
            className="rounded-md border border-zinc-300 bg-zinc-50 p-2 text-2xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-300"
          >
            {disabledReason}
          </div>
        )}

        <div className="mt-auto pt-2">
          <Button
            type="button"
            disabled={disabled}
            onClick={() => onPurchase?.(product.kind)}
            className="w-full bg-mint-600 hover:bg-mint-700"
          >
            {pending ? (
              <>
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                결제창 여는 중…
              </>
            ) : (
              "결제하기"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
