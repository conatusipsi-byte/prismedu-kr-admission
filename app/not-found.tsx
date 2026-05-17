/**
 * 전역 404 페이지 — 브랜드 일관성 적용
 *
 * - notFound() 호출 또는 매칭 안 되는 라우트에 자동 노출
 * - 메인 메뉴 / 학과 검색 / 도움말로 우회 안내
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Compass, Home, LifeBuoy } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "페이지를 찾을 수 없어요 — conatusipsi",
  robots: { index: false, follow: false },
};

const SUGGESTIONS = [
  {
    href: "/",
    icon: Home,
    title: "홈으로",
    desc: "랜딩 페이지에서 다시 시작하기",
  },
  {
    href: "/admissions",
    icon: Compass,
    title: "학과 둘러보기",
    desc: "전국 1,000여 학과 모집요강 검색",
  },
  {
    href: "/help",
    icon: LifeBuoy,
    title: "고객센터",
    desc: "FAQ + 문의 받기",
  },
] as const;

export default function NotFound(): React.ReactElement {
  return (
    <div className="relative min-h-[calc(100dvh-4rem)] flex items-center justify-center px-gutter-sm md:px-gutter py-12">
      {/* 배경 orb */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute top-[20%] left-[10%] h-96 w-96 rounded-full bg-brand-300/20 blur-3xl dark:bg-brand-700/20" />
        <div className="absolute bottom-[10%] right-[10%] h-80 w-80 rounded-full bg-violet-300/15 blur-3xl dark:bg-violet-800/15" />
      </div>

      <div className="relative max-w-2xl mx-auto text-center">
        <p className="text-9xl lg:text-[10rem] font-extrabold tracking-tight bg-gradient-to-br from-brand-500 to-emerald-600 bg-clip-text text-transparent leading-none">
          404
        </p>
        <h1 className="mt-4 text-2xl lg:text-3xl font-bold text-foreground">
          페이지를 찾을 수 없어요
        </h1>
        <p className="mt-3 text-sm lg:text-base text-muted-foreground break-keep-all max-w-md mx-auto leading-relaxed">
          요청하신 주소가 사라졌거나, 입력한 URL이 정확하지 않을 수 있어요.
          아래 메뉴에서 원하는 페이지로 이동해보세요.
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-3 max-w-2xl mx-auto">
          {SUGGESTIONS.map((s) => {
            const Icon = s.icon;
            return (
              <Link
                key={s.href}
                href={s.href}
                className="group rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm p-5 text-left shadow-sm hover:shadow-lg hover:-translate-y-0.5 hover:border-brand-300 dark:hover:border-brand-700 transition-all"
              >
                <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-950/60 text-brand-600 dark:text-brand-400 flex items-center justify-center mb-3">
                  <Icon className="h-4 w-4" />
                </div>
                <p className="text-sm font-semibold text-foreground flex items-center gap-1">
                  {s.title}
                  <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                </p>
                <p className="text-2xs text-muted-foreground mt-1 break-keep-all leading-relaxed">
                  {s.desc}
                </p>
              </Link>
            );
          })}
        </div>

        <div className="mt-8">
          <Button
            asChild
            size="lg"
            className="bg-brand-600 hover:bg-brand-700 text-white shadow-lg shadow-brand-500/25"
          >
            <Link href="/">
              홈으로 돌아가기
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
