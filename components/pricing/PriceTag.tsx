/**
 * PriceTag — 상품 가격 표시 단일 컴포넌트 (BUG-022, 2026-05-25).
 *
 * /pricing, /payment, BundlePackageVisualizer 등에서 P-014 정책 일관 적용:
 *   - 얼리버드 활성 시 정가 line-through + 얼리버드 강조 + (선택) 배지
 *   - 얼리버드 종료 후 정가만 표시 (자동 분기 via getEffectivePriceKrw)
 *   - earlybirdPriceKrw 미설정 상품은 priceKrw 단일 표시
 *
 * 정직성 (P-002 / P-014):
 *   - 단일 진실 → 가격 표시 정책 변경 시 1곳만 수정
 *   - 부풀린 가격·가짜 할인 차단 (regularPriceKrw 가 effective 와 같으면 line-through 미노출)
 */

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  getEffectivePriceKrw,
  isEarlybirdActive,
  type ProductDefKr,
} from "@/lib/plans";

export interface PriceTagProps {
  product: ProductDefKr;
  /**
   * 크기 토큰 — 호출 컨텍스트에 맞는 가격 글자 크기.
   *   'hero': /pricing 카드 상단 (5xl)
   *   'compact': /payment 카드 (2xl)
   *   'inline': 본문 안내·요약 (base)
   */
  size?: "hero" | "compact" | "inline";
  /**
   * 얼리버드 배지 노출 여부.
   *   /pricing 은 카드 헤더에 별도 배지 있어 false (기본).
   *   /payment 는 가격 옆 직접 노출 true.
   */
  showEarlybirdBadge?: boolean;
  /** 기간 라벨 (예: "/ 월") — 옵션, 호출 측 결정. */
  periodLabel?: string;
  className?: string;
}

const SIZE_CLASS: Record<NonNullable<PriceTagProps["size"]>, string> = {
  hero: "text-5xl font-extrabold tracking-tightest leading-none",
  compact: "text-2xl font-bold tabular-nums",
  inline: "text-base font-semibold tabular-nums",
};

const REGULAR_SIZE_CLASS: Record<NonNullable<PriceTagProps["size"]>, string> = {
  hero: "text-base font-medium",
  compact: "text-sm font-medium",
  inline: "text-xs font-medium",
};

export function PriceTag({
  product,
  size = "compact",
  showEarlybirdBadge = false,
  periodLabel,
  className,
}: PriceTagProps): React.ReactElement {
  const effective = getEffectivePriceKrw(product);
  const regular = product.regularPriceKrw ?? product.priceKrw;
  const earlybirdOn = isEarlybirdActive(product) && regular > effective;

  return (
    <div
      data-component="price-tag"
      data-earlybird={earlybirdOn}
      className={cn("flex items-baseline gap-2 flex-wrap", className)}
    >
      {earlybirdOn && (
        <span
          data-element="regular-price-strikethrough"
          className={cn(
            "font-numeric tabular-nums text-muted-foreground line-through",
            REGULAR_SIZE_CLASS[size],
          )}
        >
          ₩{regular.toLocaleString("ko-KR")}
        </span>
      )}
      <span
        data-element="effective-price"
        className={cn("font-numeric text-foreground", SIZE_CLASS[size])}
      >
        ₩{effective.toLocaleString("ko-KR")}
      </span>
      {periodLabel && (
        <span className="text-xs font-medium text-muted-foreground">{periodLabel}</span>
      )}
      {earlybirdOn && showEarlybirdBadge && (
        // 2026-05-30 클라이언트 요청: 종료 시점 표기 제거 (라벨만 유지).
        //   가격 계산은 getEffectivePriceKrw 가 earlybirdUntil 로 계속 분기.
        <Badge variant="outline" size="sm" data-element="earlybird-badge" className="border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-700 dark:bg-brand-950/40 dark:text-brand-300">
          얼리버드
        </Badge>
      )}
    </div>
  );
}
