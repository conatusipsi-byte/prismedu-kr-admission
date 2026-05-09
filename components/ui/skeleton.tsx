import { cn } from "@/lib/utils"

/**
 * Skeleton — brand-tinted shimmer sweep.
 * 기본 muted 배경 위에 primary 색조 글로우가 좌→우로 흐름.
 * (이전 단순 animate-pulse 보다 "premium loading" 느낌)
 */
function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-md shimmer", className)}
      {...props}
    />
  )
}

export { Skeleton }
