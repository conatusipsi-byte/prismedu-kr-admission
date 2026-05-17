/**
 * 전역 404 (Stage 10 재설계)
 *
 * - 그라디언트 텍스트 "404" (brand→iris)
 * - 추상 글리치 SVG 일러스트 (overlapping shapes)
 * - 추천 카드 3개 + 홈 CTA
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Compass, Home, LifeBuoy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "페이지를 찾을 수 없어요 — conatusipsi",
  robots: { index: false, follow: false },
};

const SUGGESTIONS = [
  { href: "/",           icon: Home,     title: "홈으로",         desc: "랜딩 페이지에서 다시 시작" },
  { href: "/admissions", icon: Compass,  title: "학과 둘러보기",  desc: "전국 1,000여 학과 모집요강" },
  { href: "/help",       icon: LifeBuoy, title: "고객센터",        desc: "FAQ + 이메일 문의" },
] as const;

export default function NotFound(): React.ReactElement {
  return (
    <div className="relative min-h-[calc(100dvh-4rem)] flex items-center justify-center px-gutter-sm md:px-gutter py-16">
      {/* 배경 mesh */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute top-[15%] left-[10%] h-96 w-96 rounded-full bg-brand-300/25 blur-3xl dark:bg-brand-700/15" />
        <div className="absolute bottom-[10%] right-[10%] h-80 w-80 rounded-full bg-iris/20 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-200/15 blur-3xl" />
      </div>

      <div className="relative max-w-3xl mx-auto text-center flex flex-col items-center">
        <Badge variant="pill-amber" size="md" className="mb-6">
          404 NOT FOUND
        </Badge>

        {/* 글리치 404 */}
        <div className="relative inline-block mb-6">
          <span
            className="font-display text-[8rem] sm:text-[10rem] lg:text-[12rem] font-extrabold tracking-tightest leading-none bg-clip-text text-transparent select-none"
            style={{
              backgroundImage: "linear-gradient(135deg, hsl(160 84% 39%) 0%, hsl(243 91% 73%) 50%, hsl(265 84% 65%) 100%)",
            }}
            aria-hidden
          >
            404
          </span>
          {/* 글리치 레이어 — 살짝 offset된 outline */}
          <span
            className="absolute inset-0 font-display text-[8rem] sm:text-[10rem] lg:text-[12rem] font-extrabold tracking-tightest leading-none text-transparent select-none mix-blend-overlay"
            style={{
              WebkitTextStrokeWidth: "1px",
              WebkitTextStrokeColor: "hsl(243 91% 73% / 0.3)",
              transform: "translate(2px, 2px)",
            }}
            aria-hidden
          >
            404
          </span>
          <span className="sr-only">404 페이지를 찾을 수 없습니다.</span>
        </div>

        {/* 추상 SVG 글리치 도형 */}
        <svg
          viewBox="0 0 200 60"
          aria-hidden
          className="h-14 w-48 mb-8 text-muted-foreground/50"
          fill="none"
        >
          <rect x="20" y="20" width="40" height="20" rx="4" fill="currentColor" opacity="0.15" />
          <rect x="60" y="25" width="40" height="15" rx="3" fill="hsl(160 84% 39%)" opacity="0.4" />
          <rect x="105" y="22" width="30" height="18" rx="3" fill="hsl(243 91% 73%)" opacity="0.4" />
          <rect x="140" y="28" width="40" height="12" rx="3" fill="hsl(38 92% 50%)" opacity="0.4" />
          <line x1="0" y1="50" x2="200" y2="50" stroke="currentColor" strokeWidth="0.8" strokeDasharray="4 4" />
        </svg>

        <h1 className="font-display text-3xl lg:text-4xl font-extrabold tracking-tighter mb-3 break-keep-all">
          페이지를 찾을 수 없어요
        </h1>
        <p className="text-base text-muted-foreground break-keep-all max-w-md leading-relaxed mb-10">
          요청하신 주소가 사라졌거나, 입력한 URL이 정확하지 않을 수 있어요. 아래에서 원하는 페이지로 이동해보세요.
        </p>

        {/* 추천 카드 3개 */}
        <div className="grid gap-3 sm:grid-cols-3 max-w-2xl w-full mb-10">
          {SUGGESTIONS.map((s) => {
            const Icon = s.icon;
            return (
              <Link
                key={s.href}
                href={s.href}
                className="group rounded-2xl border border-border bg-card/80 backdrop-blur-sm p-5 text-left transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md dark:hover:border-brand-700"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-50 to-iris/10 text-brand-600 ring-1 ring-brand-200/50 mb-3 dark:from-brand-950/60 dark:to-iris/15 dark:text-brand-300 dark:ring-brand-800/40">
                  <Icon className="h-4 w-4" />
                </span>
                <p className="text-sm font-semibold text-foreground flex items-center gap-1">
                  {s.title}
                  <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                </p>
                <p className="text-2xs text-muted-foreground mt-1 break-keep-all leading-relaxed">
                  {s.desc}
                </p>
              </Link>
            );
          })}
        </div>

        <Button asChild size="2xl" variant="primary" className="shadow-glow-brand">
          <Link href="/">
            홈으로 돌아가기
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
