/**
 * /help — 고객센터·도움말 (공개 SEO)
 *
 * LANDING_FAQS를 그대로 노출하되, 추가 카테고리(시작하기·결제·계정·기술 문제)와
 * 연락처를 포함. 본 페이지는 출시 전 임시 — 시즌 진입 후 실제 사용자 문의 패턴을
 * 보고 FAQ를 갱신.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, CreditCard, Mail, ShieldQuestion, User } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card } from "@/components/ui/card";
import { LANDING_FAQS } from "@/lib/landing-faq";

export const metadata: Metadata = {
  title: "고객센터 — conatusipsi",
  description: "자주 묻는 질문, 시작 가이드, 결제 문의, 기술 지원",
  alternates: { canonical: "/help" },
  robots: { index: true, follow: true },
};

const QUICK_LINKS = [
  {
    icon: BookOpen,
    title: "시작하기",
    body: "가입부터 첫 분석까지 5분 가이드",
    href: "/onboarding",
  },
  {
    icon: CreditCard,
    title: "결제·요금제",
    body: "단건권·시즌권 안내와 결제 방법",
    href: "/pricing",
  },
  {
    icon: User,
    title: "계정·프로필",
    body: "성적·생기부 입력값 수정·회원 탈퇴",
    href: "/profile",
  },
  {
    icon: ShieldQuestion,
    title: "환불·문의",
    body: "환불 정책과 고객센터 연락처",
    href: "/refund",
  },
] as const;

export default function HelpPage(): React.ReactElement {
  return (
    <div className="mx-auto max-w-content px-gutter-sm md:px-gutter py-10 lg:py-14 space-y-10">
      <header className="text-center max-w-2xl mx-auto">
        <h1 className="text-2xl lg:text-3xl font-bold text-foreground">
          무엇을 도와드릴까요?
        </h1>
        <p className="mt-2 text-sm text-muted-foreground break-keep-all">
          자주 묻는 질문을 먼저 확인해보시고, 답을 찾지 못하셨다면 아래 고객센터로
          연락주세요.
        </p>
      </header>

      <section aria-label="빠른 링크">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {QUICK_LINKS.map((q) => {
            const Icon = q.icon;
            return (
              <Link
                key={q.title}
                href={q.href}
                className="group rounded-2xl border border-border/60 bg-card p-card-lg shadow-sm hover:shadow-md hover:border-brand-300 dark:hover:border-brand-700 transition-all flex flex-col gap-3"
              >
                <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-950/60 text-brand-600 dark:text-brand-400 flex items-center justify-center">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    {q.title}
                    <ArrowRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 break-keep-all leading-relaxed">
                    {q.body}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section aria-label="자주 묻는 질문">
        <h2 className="text-lg font-semibold text-foreground mb-4">
          자주 묻는 질문
        </h2>
        <Accordion
          type="single"
          collapsible
          className="rounded-2xl border border-border/60 bg-card divide-y divide-border/60"
        >
          {LANDING_FAQS.map((f) => (
            <AccordionItem key={f.id} value={f.id} className="border-0 px-card-lg">
              <AccordionTrigger className="text-left text-sm font-semibold text-foreground hover:no-underline py-5">
                {f.question}
              </AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground leading-relaxed break-keep-all pb-5">
                {f.plainAnswer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      <Card variant="accent" className="p-card-lg">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-brand-500/15 text-brand-600 dark:text-brand-400 flex items-center justify-center shrink-0">
            <Mail className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0 space-y-1">
            <p className="text-sm font-semibold text-foreground">
              답을 찾지 못하셨나요?
            </p>
            <p className="text-xs text-muted-foreground break-keep-all leading-relaxed">
              <strong>support@conatusipsi.com</strong>으로 문의해주세요. 영업일 기준
              3일 이내 답변드립니다 (운영 시간: 평일 10:00 ~ 18:00).
            </p>
            <p className="text-2xs text-muted-foreground">
              ⚠️ 이메일 주소는 출시 전 임시입니다.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
