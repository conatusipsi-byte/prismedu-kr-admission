import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Badge variants.
 *
 * - default/secondary/destructive/outline: 표준 shadcn 시리즈. legacy 사용처 호환.
 * - pill-*: 히어로 eyebrow / 카테고리 칩 / accent 강조 칩. tinted background + 보더.
 *   spec: "모든 그린 액센트 텍스트(eyebrow)는 작은 칩(pill) 형태로 변경 — bare 그린 텍스트 금지"
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 [&>svg]:size-3 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary:
          "border border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "border border-input text-foreground",
        // ─── Pill accents — eyebrow / 카테고리 / 신규·시즌 안내 ───
        "pill-brand":
          "border border-brand-200/70 bg-brand-50 text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-300",
        "pill-iris":
          "border border-iris-100 bg-iris-soft text-iris-700 dark:border-iris-500/30 dark:bg-iris-500/10 dark:text-iris-300",
        "pill-violet":
          "border border-violet-200/70 bg-violet-50 text-violet-700 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300",
        "pill-amber":
          "border border-amber-200/70 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
        "pill-rose":
          "border border-rose-200/70 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300",
        "pill-ink":
          "border border-ink-200 bg-ink-50 text-ink-700 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-200",
      },
      size: {
        sm: "h-5 px-2 text-2xs",
        md: "h-6 px-2.5 text-xs",
        lg: "h-7 px-3 text-xs",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant, size }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
