"use client";

/**
 * PublicNav — 비로그인·로그인 공통 상단 nav (sticky)
 *
 * - 로고 + 메인 메뉴 + Auth CTA
 * - 모바일: 햄버거 menu (Sheet)
 * - 사용자 로그인 시 우측 메뉴를 "대시보드" 로 변경
 *
 * /admin/* 페이지에선 AdminShell이 자체 nav를 가지므로 본 컴포넌트 미사용.
 */

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GraduationCap, Menu, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/admissions", label: "학과 검색" },
  { href: "/pricing", label: "요금제" },
  { href: "/help", label: "도움말" },
] as const;

export function PublicNav(): React.ReactElement | null {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  // admin/login 페이지에선 자체 헤더가 있으므로 nav 숨김
  if (pathname?.startsWith("/admin") || pathname === "/login") {
    return null;
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/40 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
      <nav
        aria-label="메인 메뉴"
        className="mx-auto flex h-16 max-w-content-wide items-center justify-between gap-4 px-gutter-sm md:px-gutter lg:px-gutter-lg"
      >
        {/* Logo */}
        <Link
          href="/"
          className="flex items-center gap-2 text-base font-bold text-foreground transition-opacity hover:opacity-80"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-mint-400 to-mint-600 text-white shadow-md shadow-mint-500/25">
            <GraduationCap className="h-4 w-4" />
          </div>
          <span className="tracking-tight">conatusipsi</span>
        </Link>

        {/* Desktop nav */}
        <ul className="hidden md:flex items-center gap-1">
          {NAV_ITEMS.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>

        {/* Right side CTA */}
        <div className="hidden md:flex items-center gap-2">
          {!loading && (
            <>
              {user ? (
                <Button asChild size="sm" className="bg-mint-600 hover:bg-mint-700 text-white">
                  <Link href="/dashboard">대시보드 →</Link>
                </Button>
              ) : (
                <>
                  <Button asChild size="sm" variant="ghost">
                    <Link href="/login">로그인</Link>
                  </Button>
                  <Button asChild size="sm" className="bg-mint-600 hover:bg-mint-700 text-white shadow-sm shadow-mint-500/30">
                    <Link href="/login?returnUrl=/onboarding">무료로 시작</Link>
                  </Button>
                </>
              )}
            </>
          )}
        </div>

        {/* Mobile toggle */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label="메뉴 열기/닫기"
          aria-expanded={open}
          className="md:hidden inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>

      {/* Mobile drawer */}
      <div
        className={cn(
          "md:hidden border-t border-border/40 bg-background overflow-hidden transition-[max-height,opacity] duration-300 ease-toss",
          open ? "max-h-96 opacity-100" : "max-h-0 opacity-0",
        )}
      >
        <ul className="flex flex-col gap-1 p-3">
          {NAV_ITEMS.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted"
              >
                {item.label}
              </Link>
            </li>
          ))}
          <li className="mt-2 border-t border-border/40 pt-2">
            {!loading && (
              <>
                {user ? (
                  <Link
                    href="/dashboard"
                    onClick={() => setOpen(false)}
                    className="block rounded-lg bg-mint-500 px-3 py-2.5 text-center text-sm font-semibold text-white"
                  >
                    대시보드 →
                  </Link>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <Link
                      href="/login"
                      onClick={() => setOpen(false)}
                      className="block rounded-lg px-3 py-2.5 text-center text-sm font-medium text-foreground hover:bg-muted"
                    >
                      로그인
                    </Link>
                    <Link
                      href="/login?returnUrl=/onboarding"
                      onClick={() => setOpen(false)}
                      className="block rounded-lg bg-mint-500 px-3 py-2.5 text-center text-sm font-semibold text-white"
                    >
                      무료로 시작
                    </Link>
                  </div>
                )}
              </>
            )}
          </li>
        </ul>
      </div>
    </header>
  );
}
