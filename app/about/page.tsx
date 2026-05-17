import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, GraduationCap, ShieldCheck, Sparkles, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "회사 소개 — conatusipsi",
  description: "정직한 데이터로 한국 대학 입시를 설계합니다.",
  alternates: { canonical: "/about" },
};

const PRINCIPLES = [
  {
    icon: ShieldCheck,
    title: "정직한 데이터",
    body: "표본이 부족한 학과는 임의 수치를 만들지 않고 비공개로 표시합니다. AI 카운슬러도 추측 수치를 답변에 넣지 않아요.",
  },
  {
    icon: TrendingUp,
    title: "학과 단위 분석",
    body: "같은 대학이라도 학과마다 일정·등급·반영비가 다릅니다. 학과 단위로 쪼개 분석해 진짜 정확도를 만들어요.",
  },
  {
    icon: GraduationCap,
    title: "시즌 자동 갱신",
    body: "모집요강은 매년 7~9월 시즌마다 갱신. 시즌권은 별도 작업 없이 항상 최신 데이터로 자동 반영돼요.",
  },
] as const;

export default function AboutPage(): React.ReactElement {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[50vh] overflow-hidden" aria-hidden>
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 h-[36rem] w-[80rem] rounded-full bg-gradient-to-b from-brand-200/30 via-iris/15 to-transparent blur-3xl dark:from-brand-700/15" />
      </div>

      <div className="mx-auto max-w-content px-gutter-sm md:px-gutter lg:px-gutter-lg py-16 lg:py-24">
        <header className="mb-12 flex flex-col items-start gap-4">
          <Badge variant="pill-brand" size="md">
            <Sparkles className="h-3 w-3" />
            About
          </Badge>
          <h1 className="font-display text-4xl lg:text-5xl font-extrabold tracking-tighter break-keep-all">
            정직한 데이터로<br/>입시를 설계합니다
          </h1>
          <p className="text-base lg:text-lg text-muted-foreground leading-relaxed break-keep-all max-w-2xl">
            conatusipsi는 1,000여 한국 대학 학과의 모집요강·합격 사례를 학습한 AI가 학생 개인의 내신·수능·생기부에 맞는 입시 전략을 정리해드리는 서비스입니다.
          </p>
        </header>

        <section className="mb-16">
          <h2 className="text-base font-bold tracking-tight mb-6">우리가 지키는 원칙</h2>
          <div className="grid gap-5 md:grid-cols-3">
            {PRINCIPLES.map((p) => (
              <article
                key={p.title}
                className="rounded-3xl border border-border bg-card p-6 flex flex-col gap-4"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-50 to-iris/10 text-brand-600 ring-1 ring-brand-200/50 dark:from-brand-950/60 dark:to-iris/15 dark:text-brand-300 dark:ring-brand-800/40">
                  <p.icon className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <h3 className="text-lg font-bold">{p.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed break-keep-all">{p.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-8 lg:p-10 flex flex-col gap-5">
          <Badge variant="pill-iris" size="md" className="self-start">2026 베타</Badge>
          <h2 className="font-display text-2xl lg:text-3xl font-extrabold tracking-tight break-keep-all">
            지금은 베타 운영 중입니다
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed break-keep-all max-w-xl">
            정식 출시는 <span className="font-numeric tabular-nums font-semibold text-foreground">2026년 9월</span>. 베타 기간에는 일부 학과 데이터부터 순차 공개하며, 사용자 피드백을 반영해 정식 출시 전에 모든 기능을 다듬습니다.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button asChild size="lg" variant="primary">
              <Link href="/admissions">
                학과 둘러보기
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/contact">문의·제안</Link>
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
