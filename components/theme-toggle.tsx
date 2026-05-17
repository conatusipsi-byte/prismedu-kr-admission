"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

type ThemeToggleProps = {
  className?: string;
  size?: "sm" | "md";
};

export function ThemeToggle({ className, size = "md" }: ThemeToggleProps): React.ReactElement {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === "dark";
  const dimension = size === "sm" ? "h-8 w-8" : "h-9 w-9";
  const iconSize = size === "sm" ? "h-4 w-4" : "h-[18px] w-[18px]";

  return (
    <button
      type="button"
      aria-label={isDark ? "라이트 모드로 전환" : "다크 모드로 전환"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={cn(
        "relative inline-flex items-center justify-center rounded-full border border-border bg-background/60 text-foreground/80 backdrop-blur transition-all hover:bg-background hover:text-foreground hover:border-foreground/20 active:scale-95",
        dimension,
        className,
      )}
    >
      {/* mount 전: 양쪽 아이콘 모두 숨김 (서버↔클라 깜빡임 방지) */}
      <Sun
        className={cn(
          iconSize,
          "transition-all",
          mounted ? (isDark ? "scale-0 opacity-0 -rotate-90" : "scale-100 opacity-100 rotate-0") : "scale-0 opacity-0",
        )}
      />
      <Moon
        className={cn(
          iconSize,
          "absolute transition-all",
          mounted ? (isDark ? "scale-100 opacity-100 rotate-0" : "scale-0 opacity-0 rotate-90") : "scale-0 opacity-0",
        )}
      />
    </button>
  );
}
