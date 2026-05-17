/**
 * /help — 고객센터·도움말 (공개 SEO, Stage 8 재설계)
 *
 * - 큰 hero 검색바 (placeholder, 데모용 — 실 검색 X)
 * - 카테고리 카드 4개 (article count 배지)
 * - FAQ accordion (홈 동일 컴포넌트 재사용)
 * - 컨택 카드: 좌 일러스트 + 우 텍스트 2단
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, CreditCard, Mail, Search, ShieldQuestion, Sparkles, User } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LANDING_FAQS } from "@/lib/landing-faq";

export const metadata: Metadata = {
  title: "고객센터 — conatusipsi",
  description: "자주 묻는 질문, 시작 가이드, 결제 문의, 기술 지원",
  alternates: { canonical: "/help" },
  robots: { index: true, follow: true },
};

const QUICK_LINKS = [
  { icon: BookOpen,       title: "시작하기",   body: "가입부터 첫 분석까지 5분 가이드",      href: "/onboarding", articles: 8 },
  { icon: CreditCard,     title: "결제·요금제", body: "단건권·시즌권 안내와 결제 방법",        href: "/pricing",    articles: 5 },
  { icon: User,           title: "계정·프로필", body: "성적·생기부 입력값 수정·회원 탈퇴",   href: "/profile",    articles: 6 },
  { icon: ShieldQuestion, title: "환불·문의",   body: "환불 정책과 고객센터 연락처",            href: "/refund",     articles: 4 },
] as const;

export default function HelpPage(): React.ReactElement {
  return (
    <div className="relative">
      {/* 배경 mesh */}
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[55vh] overflow-hidden" aria-hidden>
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 h-[36rem] w-[80rem] rounded-full bg-gradient-to-b from-brand-200/30 via-iris/15 to-transparent blur-3xl dark:from-brand-700/15" />
      </div>

      <div className="mx-auto max-w-content px-gutter-sm md:px-gutter lg:px-gutter-lg py-16 lg:py-24">
        {/* Hero with large search */}
        <header className="mb-16 lg:mb-20 text-center flex flex-col items-center gap-5">
          <Badge variant="pill-brand" size="md">
            <Sparkles className="h-3 w-3" />
            고객센터
          </Badge>
          <h1 className="font-display text-4xl lg:text-6xl font-extrabold tracking-tighter break-keep-all max-w-2xl">
            무엇을 도와드릴까요?
          </h1>
          <p className="text-base lg:text-lg text-muted-foreground leading-relaxed break-keep-all max-w-xl">
            자주 묻는 질문을 먼저 확인하시고, 답을 찾지 못하셨다면 아래 이메일로 연락 주세요.
          </p>

          {/* Algolia-style big search bar */}
          <form
            className="mt-4 w-full max-w-xl flex items-center gap-2 rounded-2xl border border-border bg-card pl-5 pr-2 py-2 shadow-sm focus-within:shadow-glow-brand focus-within:border-brand-400 transition-all"
            action="#"
            onSubmit={(e) => e.preventDefault()}
          >
            <Search className="h-5 w-5 text-muted-foreground" aria-hidden />
            <input
              type="search"
              placeholder="어떤 도움이 필요하세요?"
              aria-label="도움말 검색"
              className="flex-1 bg-transparent text-base placeholder:text-muted-foreground outline-none py-2"
            />
            <span className="hidden md:inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-1 text-2xs text-muted-foreground font-numeric">
              ⌘ K
            </span>
          </form>
          <p className="text-2xs text-muted-foreground">검색 기능은 출시 직전 활성화 — 지금은 아래 카테고리·FAQ를 이용해주세요.</p>
        </header>

        {/* Quick links 4-card grid */}
        <section aria-label="카테고리" className="mb-20 lg:mb-28">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {QUICK_LINKS.map((q) => {
              const Icon = q.icon;
              return (
                <Link
                  key={q.title}
                  href={q.href}
                  className="group flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md dark:hover:border-brand-700"
                >
                  <div className="flex items-start justify-between">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-50 to-iris/10 text-brand-600 ring-1 ring-brand-200/50 group-hover:rotate-3 transition-transform dark:from-brand-950/60 dark:to-iris/15 dark:text-brand-300 dark:ring-brand-800/40">
                      <Icon className="h-5 w-5" strokeWidth={1.75} />
                    </span>
                    <Badge variant="pill-ink" size="sm">{q.articles}개</Badge>
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-foreground flex items-center gap-1.5">
                      {q.title}
                      <ArrowRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground break-keep-all leading-relaxed">{q.body}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* FAQ */}
        <section aria-label="자주 묻는 질문" className="mb-20 lg:mb-28">
          <div className="mb-8 flex flex-col items-center text-center gap-3">
            <Badge variant="pill-iris" size="md">FAQ</Badge>
            <h2 className="font-display text-3xl lg:text-4xl font-extrabold tracking-tighter">자주 묻는 질문</h2>
          </div>
          <Accordion
            type="single"
            collapsible
            className="rounded-3xl border border-border bg-card/80 backdrop-blur-sm divide-y divide-border overflow-hidden shadow-sm"
          >
            {LANDING_FAQS.map((f) => (
              <AccordionItem
                key={f.id}
                value={f.id}
                className="border-0 px-6 lg:px-7 group data-[state=open]:bg-brand-50/30 dark:data-[state=open]:bg-brand-950/15 transition-colors"
              >
                <AccordionTrigger className="text-left text-sm lg:text-base font-semibold text-foreground hover:no-underline py-5 lg:py-6 group-data-[state=open]:text-brand-700 dark:group-data-[state=open]:text-brand-300">
                  {f.question}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-relaxed break-keep-all pb-5 lg:pb-6">
                  {f.plainAnswer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        {/* Contact card — 2-col split */}
        <section aria-label="문의 안내">
          <div className="grid gap-0 lg:grid-cols-[1fr_1fr] overflow-hidden rounded-3xl border border-border bg-card">
            {/* Left — illustration */}
            <div className="relative flex items-center justify-center bg-gradient-to-br from-brand-50 via-iris/10 to-violet-50 dark:from-brand-950/40 dark:via-iris/8 dark:to-violet-950/30 p-10 lg:p-14 min-h-[200px]">
              {/* Abstract astronaut-like illustration */}
              <svg viewBox="0 0 200 200" aria-hidden className="w-44 h-44">
                {/* Background stars */}
                <circle cx="30" cy="40" r="1.5" fill="hsl(160 84% 39%)" opacity="0.6" />
                <circle cx="170" cy="60" r="1.5" fill="hsl(243 91% 73%)" opacity="0.6" />
                <circle cx="40" cy="160" r="1.5" fill="hsl(38 92% 50%)" opacity="0.6" />
                <circle cx="160" cy="150" r="1.5" fill="hsl(160 84% 39%)" opacity="0.6" />
                {/* Envelope body */}
                <rect x="50" y="80" width="100" height="60" rx="8" fill="white" stroke="hsl(160 84% 39%)" strokeWidth="2" />
                {/* Envelope flap */}
                <path d="M50 80 L100 115 L150 80" fill="none" stroke="hsl(160 84% 39%)" strokeWidth="2" strokeLinejoin="round" />
                {/* Heart sticker */}
                <path d="M100 60 C97 55, 90 55, 90 62 C90 68, 100 75, 100 75 C100 75, 110 68, 110 62 C110 55, 103 55, 100 60 Z" fill="hsl(243 91% 73%)" />
                {/* Trail */}
                <path d="M30 110 Q 40 105, 50 110" stroke="hsl(160 84% 39%)" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.5" strokeDasharray="3 3" />
              </svg>
            </div>

            {/* Right — content */}
            <div className="p-7 lg:p-10 flex flex-col gap-5">
              <Badge variant="pill-brand" size="md" className="self-start">
                <Mail className="h-3 w-3" />
                직접 문의
              </Badge>
              <h3 className="font-display text-2xl lg:text-3xl font-extrabold tracking-tight break-keep-all">
                답을 찾지 못하셨나요?
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed break-keep-all">
                <span className="font-mono text-foreground font-semibold">support@conatusipsi.com</span>{" "}
                으로 문의해주세요. 영업일 기준 3일 이내 답변드립니다.
              </p>
              <div className="flex flex-col gap-1.5 text-xs text-muted-foreground border-l-2 border-brand-300 pl-3">
                <span><span className="font-semibold text-foreground">운영 시간</span> · 평일 10:00 ~ 18:00 (KST)</span>
                <span><span className="font-semibold text-foreground">주말·공휴일</span> · 다음 영업일 처리</span>
              </div>
              <p className="text-2xs text-amber-700 dark:text-amber-400">
                ⚠️ 이메일 주소는 출시 전 임시입니다.
              </p>
              <Button asChild variant="primary" size="lg" className="self-start mt-2">
                <a href="mailto:support@conatusipsi.com">
                  이메일 보내기
                  <ArrowRight className="h-4 w-4" />
                </a>
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
