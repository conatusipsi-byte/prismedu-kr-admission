import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Input sizes — Button과 동일한 5단계 정책에 맞춰 정렬.
 *   sm      h-9   (36px) — 인라인·search·chip 컨텍스트
 *   default h-10  (40px) — 폼 안 일반 입력
 *   lg      h-11  (44px) — 모바일 표준 입력 (touch target 권장 최소)
 *   xl      h-12  (48px) — hero/CTA 옆 입력, primary 폼 필드
 */
const SIZE_CLASS = {
  sm: "h-9 text-sm",
  default: "h-10 text-base md:text-sm",
  lg: "h-11 text-base md:text-sm",
  xl: "h-12 text-base",
} as const;

export type InputSize = keyof typeof SIZE_CLASS;

export interface InputProps extends Omit<React.ComponentProps<"input">, "size"> {
  size?: InputSize;
  error?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, size = "default", error, ...props }, ref) => {
    return (
      <input
        type={type}
        aria-invalid={error || undefined}
        className={cn(
          // Base
          "flex w-full rounded-md border border-input bg-background px-3 py-2 ring-offset-background",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          "placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
          // Brand focus glow
          "outline-none transition-shadow duration-200 ease-toss",
          "focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/20 focus-visible:shadow-glow-sm",
          // Error state
          error && "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20",
          SIZE_CLASS[size],
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
