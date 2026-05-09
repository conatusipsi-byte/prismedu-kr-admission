"use client";

import * as React from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { cn } from "@/lib/utils";

/**
 * SegmentedControl — iOS-style 분절 토글.
 *
 * Radix RadioGroup 기반 → 키보드 ↑↓/←→ 자동 이동, roving tabindex, aria-checked 관리.
 * 이전: pricing 페이지의 월간/연간 토글이 raw <button> + state 조합이라 키보드 내비·접근성 drift.
 *
 * 사용:
 *   <SegmentedControl value={billing} onValueChange={setBilling} aria-label="결제 주기">
 *     <SegmentedControlItem value="monthly">월간</SegmentedControlItem>
 *     <SegmentedControlItem value="yearly" trailing={<Badge>38% 할인</Badge>}>연간</SegmentedControlItem>
 *   </SegmentedControl>
 */

type SegmentedControlProps = React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>;

export const SegmentedControl = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Root>,
  SegmentedControlProps
>(({ className, ...props }, ref) => (
  <RadioGroupPrimitive.Root
    ref={ref}
    className={cn(
      "flex items-center gap-1 bg-muted/50 rounded-xl p-1",
      className
    )}
    {...props}
  />
));
SegmentedControl.displayName = "SegmentedControl";

type SegmentedControlItemProps =
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item> & {
    /** 우측 부착 요소 (할인 배지 등) */
    trailing?: React.ReactNode;
  };

export const SegmentedControlItem = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  SegmentedControlItemProps
>(({ className, children, trailing, ...props }, ref) => (
  <RadioGroupPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all",
      "text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
      "data-[state=checked]:bg-white dark:data-[state=checked]:bg-card data-[state=checked]:shadow-sm data-[state=checked]:text-foreground",
      "disabled:opacity-50 disabled:cursor-not-allowed",
      className
    )}
    {...props}
  >
    {children}
    {trailing}
  </RadioGroupPrimitive.Item>
));
SegmentedControlItem.displayName = "SegmentedControlItem";
