"use client";

/**
 * PublicNav — sticky 상단 네비.
 *
 * - 스크롤 ≥ 16px 에서 blur·border 강화 (Linear/Vercel 스타일)
 * - 로고: 모노그램 'c' + 미니 학사모, brand→iris 그라디언트
 * - 메뉴: 학과 검색 · 요금제 · 도움말 · 변경 사항
 * - CTA: outline(로그인) + filled(무료로 시작)
 * - 다크모드 토글: 우측 ThemeToggle
 * - 모바일: 햄버거 → 풀스크린 시트 (framer-motion)
 *
 * /admin/* 와 /login 에선 자체 헤더가 있으므로 nav 숨김.
 */

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { LayoutDashboard, LogOut, Menu, User as UserIcon, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/brand/Logo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/admissions", label: "학과 검색" },
  { href: "/pricing", label: "요금제" },
  { href: "/changelog", label: "변경 사항" },
  { href: "/help", label: "도움말" },
] as const;

export function PublicNav(): React.ReactElement | null {
  const { user, profile, loading, logout } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);

  // 스크롤 감지 — passive listener, threshold 16px
  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // 라우트 변경 시 시트 자동 닫힘
  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  if (pathname?.startsWith("/admin") || pathname === "/login" || pathname === "/signup") {
    return null;
  }

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-40 w-full transition-[background-color,border-color,backdrop-filter] duration-200 ease-toss",
          scrolled
            ? "border-b border-border/60 bg-background/70 backdrop-blur-xl supports-[backdrop-filter]:bg-background/55"
            : "border-b border-transparent bg-background/0",
        )}
      >
        <nav
          aria-label="메인 메뉴"
          className="mx-auto flex h-16 max-w-content-wide items-center justify-between gap-4 px-gutter-sm md:px-gutter lg:px-gutter-lg"
        >
          {/* Logo */}
          <Link
            href="/"
            aria-label="Conatus 홈"
            className="group flex items-center transition-opacity hover:opacity-90"
          >
            {/* 아이콘만 PNG 에서 크롭 + "Conatus" 워드마크는 HTML 텍스트 — 작은 사이즈에서 PNG
                안의 워드마크가 흐릿해지는 문제 해소. 아이콘 자체는 h-10 (40px) 유지. */}
            <Logo variant="icon-with-text" className="h-10" priority />
          </Link>

          {/* Desktop nav */}
          <ul className="hidden md:flex items-center gap-0.5">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "text-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* Right side */}
          <div className="hidden md:flex items-center gap-2">
            <ThemeToggle size="sm" />
            {!loading && (
              <>
                {user ? (
                  <>
                    <Button asChild size="sm" variant="outline">
                      <Link href="/dashboard">대시보드</Link>
                    </Button>
                    <UserMenu
                      name={profile?.name ?? (user.user_metadata?.name as string | undefined) ?? "내 계정"}
                      email={user.email ?? null}
                      plan={profile?.plan}
                      onLogout={logout}
                    />
                  </>
                ) : (
                  <>
                    <Button asChild size="sm" variant="outline">
                      <Link href="/login">로그인</Link>
                    </Button>
                    <Button asChild size="sm" variant="primary">
                      <Link href="/login?returnUrl=/onboarding">무료로 시작</Link>
                    </Button>
                  </>
                )}
              </>
            )}
          </div>

          {/* Mobile toggle */}
          <div className="md:hidden flex items-center gap-1">
            <ThemeToggle size="sm" />
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-label={open ? "메뉴 닫기" : "메뉴 열기"}
              aria-expanded={open}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background/60 text-foreground/80 backdrop-blur transition-colors hover:bg-background"
            >
              {open ? <X className="h-[18px] w-[18px]" /> : <Menu className="h-[18px] w-[18px]" />}
            </button>
          </div>
        </nav>
      </header>

      {/* Mobile full-screen sheet */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="mobile-sheet"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="md:hidden fixed inset-0 z-30 bg-background/95 backdrop-blur-xl pt-16"
            onClick={() => setOpen(false)}
          >
            <motion.ul
              initial="hidden"
              animate="show"
              variants={{
                hidden: {},
                show: { transition: { staggerChildren: 0.04, delayChildren: 0.05 } },
              }}
              className="flex flex-col gap-1 px-gutter-sm py-6"
              onClick={(e) => e.stopPropagation()}
            >
              {NAV_ITEMS.map((item) => (
                <motion.li
                  key={item.href}
                  variants={{
                    hidden: { opacity: 0, x: 8 },
                    show: { opacity: 1, x: 0 },
                  }}
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                >
                  <Link
                    href={item.href}
                    className="block rounded-xl px-4 py-3 text-lg font-semibold text-foreground hover:bg-muted"
                  >
                    {item.label}
                  </Link>
                </motion.li>
              ))}
              <motion.li
                variants={{
                  hidden: { opacity: 0, y: 8 },
                  show: { opacity: 1, y: 0 },
                }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                className="mt-4 border-t border-border/60 pt-4"
              >
                {!loading && (
                  <div className="flex flex-col gap-2">
                    {user ? (
                      <>
                        <Button asChild size="xl" variant="primary" className="w-full">
                          <Link href="/dashboard">대시보드</Link>
                        </Button>
                        <Button asChild size="xl" variant="outline" className="w-full">
                          <Link href="/profile">프로필</Link>
                        </Button>
                        <Button
                          type="button"
                          size="xl"
                          variant="ghost"
                          className="w-full"
                          onClick={() => logout()}
                        >
                          <LogOut className="h-4 w-4" />
                          로그아웃
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button asChild size="xl" variant="outline" className="w-full">
                          <Link href="/login">로그인</Link>
                        </Button>
                        <Button asChild size="xl" variant="primary" className="w-full">
                          <Link href="/login?returnUrl=/onboarding">무료로 시작</Link>
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </motion.li>
            </motion.ul>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/**
 * UserMenu — 로그인 상태 우상단 아바타·드롭다운.
 *
 * 진입점: 프로필 / (마스터 시) 운영자 대시보드 / 로그아웃.
 * 발견성 개선 — 이전엔 로그아웃 진입이 /profile 안에 묻혀 있었음.
 */
function UserMenu({
  name,
  email,
  plan,
  onLogout,
}: {
  name: string;
  email: string | null;
  plan?: string;
  onLogout: () => void;
}): React.ReactElement {
  const initial = (name?.[0] ?? "?").toUpperCase();
  const planLabel = plan === "elite" ? "Elite" : plan === "pro" ? "Pro" : "Free";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="사용자 메뉴"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-iris text-white text-xs font-bold shadow-sm hover:opacity-90 transition-opacity"
        >
          {initial}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold">{name}</span>
            {email && <span className="text-2xs text-muted-foreground truncate">{email}</span>}
            <span className="text-2xs text-brand-700 dark:text-brand-300 font-medium">
              {planLabel} 플랜
            </span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/dashboard">
            <LayoutDashboard className="h-4 w-4" />
            <span>대시보드</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/profile">
            <UserIcon className="h-4 w-4" />
            <span>프로필</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onLogout()} className="text-destructive focus:text-destructive">
          <LogOut className="h-4 w-4" />
          <span>로그아웃</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
