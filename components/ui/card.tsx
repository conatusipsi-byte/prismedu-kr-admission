import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Card variant scale.
 *   default  — 표준 카드 (현재 사용 패턴 유지)
 *   plain    — 테두리/그림자 없는 단순 surface (background 일치 영역)
 *   elevated — brand-tinted glow shadow (강조 카드)
 *   hero     — prismatic 또는 dark gradient hero (대시보드/구독)
 *   glass    — 반투명 + blur (overlay/floating)
 *   accent   — primary/5 배경 + primary 테두리 (추천/CTA 카드)
 *
 * interactive=true → hover lift 적용 (cursor-pointer 추가는 호출자 책임)
 */
const cardVariants = cva(
  "text-card-foreground transition-shadow",
  {
    variants: {
      variant: {
        default: "rounded-lg border bg-card shadow-sm",
        plain: "rounded-2xl bg-card",
        elevated: "rounded-2xl bg-card border-none shadow-glow-md",
        hero: "rounded-2xl bg-card border-none shadow-glow-lg overflow-hidden relative isolate",
        glass: "rounded-2xl glass-card",
        accent: "rounded-2xl bg-primary/5 dark:bg-primary/10 border border-primary/20",
      },
      interactive: {
        true: "hover-lift cursor-pointer active:scale-[0.98] transition-transform",
        false: "",
      },
    },
    defaultVariants: {
      variant: "default",
      interactive: false,
    },
  }
)

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, interactive, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(cardVariants({ variant, interactive }), className)}
      {...props}
    />
  )
)
Card.displayName = "Card"

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "text-2xl font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent, cardVariants }
