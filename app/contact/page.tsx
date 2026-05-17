import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Mail, MessageSquare, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "문의 — conatusipsi",
  description: "기능 제안·버그 신고·일반 문의는 이메일로 연락 주세요.",
  alternates: { canonical: "/contact" },
};

const TOPICS = [
  { label: "기능 제안",    body: "써보다가 \"이게 있으면 좋겠다\" 싶은 부분을 알려주세요." },
  { label: "버그 신고",    body: "원하는 동작과 실제 동작을 함께 적어주시면 빠르게 확인할 수 있어요." },
  { label: "데이터 오류",  body: "특정 학과의 모집요강·전형 정보가 잘못된 경우 학과명과 함께 알려주세요." },
  { label: "결제·환불",    body: "결제 영수증 이메일과 함께 보내주시면 답변이 빨라요." },
] as const;

export default function ContactPage(): React.ReactElement {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[50vh] overflow-hidden" aria-hidden>
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 h-[36rem] w-[80rem] rounded-full bg-gradient-to-b from-brand-200/30 via-iris/15 to-transparent blur-3xl dark:from-brand-700/15" />
      </div>

      <div className="mx-auto max-w-content px-gutter-sm md:px-gutter lg:px-gutter-lg py-16 lg:py-24">
        <header className="mb-12 flex flex-col items-start gap-4">
          <Badge variant="pill-brand" size="md">
            <Sparkles className="h-3 w-3" />
            Contact
          </Badge>
          <h1 className="font-display text-4xl lg:text-5xl font-extrabold tracking-tighter break-keep-all">
            연락 주세요
          </h1>
          <p className="text-base lg:text-lg text-muted-foreground leading-relaxed break-keep-all max-w-2xl">
            지금은 이메일로만 받습니다. 영업일 기준 3일 이내에 답변드려요.
          </p>
        </header>

        <section className="mb-12 rounded-3xl border border-border bg-card p-8 lg:p-10 flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-brand-50 to-iris/10 text-brand-600 ring-1 ring-brand-200/50 dark:from-brand-950/60 dark:to-iris/15 dark:text-brand-300 dark:ring-brand-800/40">
              <Mail className="h-5 w-5" />
            </span>
            <div>
              <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Email</p>
              <p className="font-mono text-base font-semibold">support@conatusipsi.com</p>
            </div>
          </div>
          <div className="flex flex-col gap-1.5 text-xs text-muted-foreground border-l-2 border-brand-300 pl-3">
            <span><span className="font-semibold text-foreground">운영 시간</span> · 평일 10:00 ~ 18:00 (KST)</span>
            <span><span className="font-semibold text-foreground">답변 기한</span> · 영업일 기준 3일 이내</span>
            <span><span className="font-semibold text-foreground">주말·공휴일</span> · 다음 영업일 처리</span>
          </div>
          <p className="text-2xs text-amber-700 dark:text-amber-400">
            ⚠️ 베타 운영 중 — 정식 출시(2026년 9월) 전까지 응답이 다소 늦어질 수 있어요.
          </p>
          <Button asChild variant="primary" size="xl" className="self-start mt-2 shadow-glow-brand">
            <a href="mailto:support@conatusipsi.com">
              이메일 보내기
              <ArrowRight className="h-4 w-4" />
            </a>
          </Button>
        </section>

        <section className="mb-12">
          <div className="mb-6 flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-bold tracking-tight">어떤 내용을 보내주시면 좋을까요</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {TOPICS.map((t) => (
              <article
                key={t.label}
                className="rounded-2xl border border-border bg-card p-5 flex flex-col gap-2"
              >
                <Badge variant="pill-ink" size="sm" className="self-start">{t.label}</Badge>
                <p className="text-sm text-muted-foreground leading-relaxed break-keep-all">{t.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-dashed border-border bg-muted/20 p-6 text-center">
          <p className="text-sm text-muted-foreground break-keep-all leading-relaxed">
            먼저 <Link href="/help" className="font-semibold text-brand-700 dark:text-brand-300 underline underline-offset-2">고객센터(FAQ)</Link>에서 비슷한 질문이 있는지 확인해보세요. 답을 찾지 못하셨다면 위 이메일로 연락 주세요.
          </p>
        </section>
      </div>
    </div>
  );
}
