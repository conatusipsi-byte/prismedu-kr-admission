/**
 * / — 랜딩 페이지 (Server Component)
 *
 * Stage 4 재설계 (2026-05): hero+mockup / trust marquee / bento 3-pillar /
 * timeline / quote / personas / bento features / FAQ / Final CTA.
 *
 * 클라이언트 인터랙션은 MotionSection/HeroMockup으로 격리. 서버 컴포넌트로
 * 메타데이터·JSON-LD를 정적 렌더하면서 motion 영역만 hydrate.
 */

import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Bot,
  CheckCircle2,
  Clock,
  Database,
  GraduationCap,
  LineChart,
  Quote,
  School,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HeroMockup } from "@/components/marketing/HeroMockup";
import { MotionSection, MotionItem } from "@/components/marketing/MotionSection";
import { LANDING_FAQS } from "@/lib/landing-faq";

export const metadata: Metadata = {
  title: "conatusipsi — 한국 대학 입시 AI 추천",
  description:
    "전국 1,000여 학과 모집요강·전형 정보를 한곳에서. 내 내신·수능·생기부로 합격 가능성을 AI가 학과 단위로 분석합니다.",
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: "conatusipsi",
    title: "conatusipsi — 한국 대학 입시 AI 추천",
    description:
      "내 성적으로 갈 수 있는 학과, 3초면 알 수 있어요. 수시·정시·재외국민 전형 모두 지원.",
    url: "https://conatusipsi.com",
  },
  twitter: {
    card: "summary_large_image",
    title: "conatusipsi — 한국 대학 입시 AI 추천",
    description: "전국 1,000여 학과 합격률 분석",
  },
  alternates: { canonical: "https://conatusipsi.com" },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://conatusipsi.com/#organization",
      name: "conatusipsi",
      url: "https://conatusipsi.com",
      logo: "https://conatusipsi.com/icon.svg",
      description: "한국 대학 입시 AI 추천 서비스. 학과 단위 합격률 분석과 맞춤 카운슬러.",
      sameAs: [],
    },
    {
      "@type": "WebSite",
      "@id": "https://conatusipsi.com/#website",
      url: "https://conatusipsi.com",
      name: "conatusipsi",
      description: "AI가 분석하는 1,000여 한국 대학 학과 합격 확률.",
      publisher: { "@id": "https://conatusipsi.com/#organization" },
      inLanguage: "ko-KR",
    },
    {
      "@type": "FAQPage",
      "@id": "https://conatusipsi.com/#faq",
      mainEntity: LANDING_FAQS.map((f) => ({
        "@type": "Question",
        name: f.question,
        acceptedAnswer: { "@type": "Answer", text: f.plainAnswer },
      })),
    },
  ],
};

const PERSONAS = [
  {
    label: "고2 학생",
    avatarBg: "from-brand-400 to-iris",
    initial: "S",
    title: "수시 6장, 정시 3장 어떻게 채우지?",
    body: "내 등급으로 학종 / 교과 / 논술을 어떻게 섞을지 막막했는데, 학과별 가능성과 전형별 비교를 한 화면에서 봤어요.",
  },
  {
    label: "고3 학부모",
    avatarBg: "from-iris to-violet-500",
    initial: "P",
    title: "원서 접수 전 마지막 점검",
    body: "9월 모의 결과 반영해서 정시 가나다군 슬롯 시뮬레이션. 가군에 안정·나군에 적정·다군에 상향 — 뭘 빼고 뭘 넣을지 명확해졌어요.",
  },
  {
    label: "재외국민",
    avatarBg: "from-amber-400 to-brand-500",
    initial: "G",
    title: "특례 전형 자격이 되나?",
    body: "해외 재학 기간·국적 조건을 자가진단 후 자격 충족 학과만 모아 보고, 일반 분석에 끌려가지 않아 시간을 아꼈어요.",
  },
] as const;

const TRUST_KEYWORDS = [
  "전국 주요 대학 모집요강 학습",
  "KAIST·POSTECH·SKY 포함",
  "수시 6장 · 정시 가나다군 분리",
  "재외국민·특례 전형 지원",
  "매년 7~9월 모집요강 자동 갱신",
];

export default function LandingPage(): React.ReactElement {
  return (
    <div className="relative bg-background overflow-x-hidden">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* 배경 mesh — 시각적 깊이. 페이지 전체에 fixed. */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
        <div className="absolute -top-[10%] -left-[10%] h-[40rem] w-[40rem] rounded-full bg-gradient-to-br from-brand-300/35 to-brand-500/15 blur-3xl dark:from-brand-700/25 dark:to-brand-900/15" />
        <div className="absolute top-[15%] -right-[15%] h-[35rem] w-[35rem] rounded-full bg-gradient-to-bl from-iris/30 to-violet-400/15 blur-3xl dark:from-iris/20 dark:to-violet-800/10" />
        <div className="absolute bottom-[-15%] left-[20%] h-[30rem] w-[30rem] rounded-full bg-gradient-to-tr from-amber-200/20 to-orange-300/10 blur-3xl dark:from-amber-700/12 dark:to-orange-900/8" />
      </div>

      {/* SEO 본문 */}
      <section className="sr-only" aria-label="conatusipsi 서비스 소개">
        <h2>conatusipsi — 한국 대학 입시 AI 추천</h2>
        <p>
          내신·수능·생기부 정보를 입력하면 1,000여 한국 대학 학과의 합격 가능성을 AI가
          분석합니다. 수시(학생부종합·학생부교과·논술·실기)·정시(가/나/다군)·재외국민
          전형을 모두 지원합니다.
        </p>
      </section>

      {/* ═══ Hero ═══ */}
      <section className="mx-auto w-full max-w-content-wide px-gutter-sm md:px-gutter lg:px-gutter-lg pt-12 pb-20 lg:pt-20 lg:pb-32">
        <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-10">
          {/* Left — copy */}
          <header className="lg:col-span-6 flex flex-col items-start gap-5 lg:gap-7">
            <Badge variant="pill-brand" size="md" className="animate-fade-up">
              <Sparkles className="h-3 w-3" />
              2027학년도 시즌 준비
            </Badge>

            <h1
              className="animate-fade-up font-display text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-extrabold tracking-tightest text-foreground text-balance break-keep-all leading-[1.04]"
              style={{ animationDelay: "0.1s" }}
            >
              내 성적으로 갈 수 있는 학과,
              <br className="hidden sm:block" />
              <span
                className="bg-clip-text text-transparent animate-text-shimmer"
                style={{
                  backgroundImage:
                    "linear-gradient(90deg, hsl(160 84% 39%), hsl(243 91% 73%), hsl(160 84% 39%))",
                  backgroundSize: "200% auto",
                }}
              >
                3초면
              </span>{" "}
              알 수 있어요
            </h1>

            <p
              className="animate-fade-up text-base sm:text-lg text-muted-foreground leading-relaxed text-balance break-keep-all max-w-[44ch]"
              style={{ animationDelay: "0.2s" }}
            >
              전국 주요 대학의 모집요강을 학습한 AI가
              내신·수능·생기부에 맞는 <span className="font-semibold text-foreground/90">수시 6장 + 정시 가나다군</span> 전략을 정리해드려요.
            </p>

            <div
              className="animate-fade-up flex flex-col sm:flex-row gap-3 w-full sm:w-auto"
              style={{ animationDelay: "0.3s" }}
            >
              <Button asChild size="2xl" variant="primary" className="shadow-glow-brand">
                <Link href="/signup?returnUrl=/onboarding">
                  무료 가입하고 분석 받기
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="2xl" variant="outline">
                <Link href="/admissions">학과 둘러보기</Link>
              </Button>
            </div>

            <p
              className="animate-fade-up text-2xs text-muted-foreground"
              style={{ animationDelay: "0.4s" }}
            >
              가입 30초 · 카드 정보 불필요 · 결제는 결과 확인 후 결정
            </p>
          </header>

          {/* Right — product mockup */}
          <div className="lg:col-span-6 lg:pl-4">
            <HeroMockup className="max-w-xl mx-auto lg:ml-auto lg:mr-0" />
          </div>
        </div>
      </section>

      {/* ═══ Trust marquee ═══ */}
      <section className="border-y border-border/40 bg-background/60 backdrop-blur-sm">
        <div className="mx-auto w-full max-w-content-wide px-gutter-sm md:px-gutter lg:px-gutter-lg py-6">
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-2xs sm:text-xs font-medium text-muted-foreground">
            {TRUST_KEYWORDS.map((kw, idx) => (
              <span key={kw} className="flex items-center gap-2">
                {idx > 0 && <span className="h-1 w-1 rounded-full bg-border" aria-hidden />}
                <span className="font-numeric tabular-nums">{kw}</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ 3 Pillar Bento ═══ */}
      <MotionSection
        className="mx-auto w-full max-w-content-wide px-gutter-sm md:px-gutter lg:px-gutter-lg py-20 lg:py-28"
        stagger={80}
      >
        <MotionItem className="mb-12 lg:mb-16 flex flex-col items-center text-center gap-3">
          <Badge variant="pill-iris" size="md">데이터 · 분류 · 정직</Badge>
          <h2 className="font-display text-3xl lg:text-5xl font-extrabold tracking-tighter">
            왜 conatusipsi 인가
          </h2>
        </MotionItem>

        <div className="grid gap-5 md:grid-cols-3">
          <MotionItem
            as="article"
            className="group relative overflow-hidden rounded-3xl border border-border bg-card p-7 lg:p-8 transition-all duration-300 hover:-translate-y-1 hover:border-brand-300 hover:shadow-glow-brand dark:hover:border-brand-700"
          >
            <Database className="h-10 w-10 text-brand-600 dark:text-brand-300 mb-6" strokeWidth={1.5} />
            <h3 className="text-lg font-bold mb-2">1,000+ 학과 데이터</h3>
            <p className="text-sm text-muted-foreground leading-relaxed break-keep-all">
              전국 주요 대학의 모집요강·전형별 등급·합격 사례를 학과 단위로 분리해 학습했어요.
            </p>
            <SparkBar className="mt-6" values={[2, 3, 5, 4, 7, 6, 9]} tone="brand" />
          </MotionItem>

          <MotionItem
            as="article"
            className="group relative overflow-hidden rounded-3xl border border-border bg-card p-7 lg:p-8 transition-all duration-300 hover:-translate-y-1 hover:border-iris-300 hover:shadow-glow-iris"
          >
            <LineChart className="h-10 w-10 text-iris-500 mb-6" strokeWidth={1.5} />
            <h3 className="text-lg font-bold mb-2">전형별 분리 분석</h3>
            <p className="text-sm text-muted-foreground leading-relaxed break-keep-all">
              학생부종합·교과·논술·실기·정시 가나다군까지 — 같은 학과여도 전형별로 분리해 비교해드려요.
            </p>
            <CategoryDots className="mt-6" />
          </MotionItem>

          <MotionItem
            as="article"
            className="group relative overflow-hidden rounded-3xl border border-border bg-card p-7 lg:p-8 transition-all duration-300 hover:-translate-y-1 hover:border-amber-300 hover:shadow-glow-violet"
          >
            <ShieldCheck className="h-10 w-10 text-amber-500 mb-6" strokeWidth={1.5} />
            <h3 className="text-lg font-bold mb-2">정직한 비공개</h3>
            <p className="text-sm text-muted-foreground leading-relaxed break-keep-all">
              표본이 부족한 학과는 합격 확률을 임의로 만들지 않고 비공개로 표시해요.
            </p>
            <HonestyHint className="mt-6" />
          </MotionItem>
        </div>
      </MotionSection>

      {/* ═══ 3-step timeline ═══ */}
      <MotionSection
        className="mx-auto w-full max-w-content-wide px-gutter-sm md:px-gutter lg:px-gutter-lg py-20 lg:py-28"
        stagger={120}
      >
        <MotionItem className="mb-12 lg:mb-16 flex flex-col items-center text-center gap-3">
          <Badge variant="pill-iris" size="md">How it works</Badge>
          <h2 className="font-display text-3xl lg:text-5xl font-extrabold tracking-tighter">
            3단계로 시작해요
          </h2>
        </MotionItem>

        {/* Desktop timeline */}
        <ol className="hidden md:grid grid-cols-3 gap-4 relative">
          {/* dashed connector */}
          <svg className="absolute top-16 left-[12%] right-[12%] h-1 z-0 pointer-events-none" preserveAspectRatio="none" viewBox="0 0 100 1" aria-hidden>
            <line x1="0" y1="0.5" x2="100" y2="0.5" stroke="currentColor" strokeWidth="0.4" strokeDasharray="2 2" className="text-border" />
          </svg>
          {[
            { icon: GraduationCap, tone: "brand",   title: "성적·생기부 입력", desc: "내신·수능/모의·세특·비교과를 한 번 입력하면 분석에 그대로 사용돼요." },
            { icon: BarChart3,     tone: "iris",    title: "학과별 합격률 분석", desc: "1,000여 학과를 Safety·Match·Reach로 분류. 표본 부족 학과는 '데이터 없음'으로 표시." },
            { icon: Bot,           tone: "violet",  title: "AI 카운슬러 상담", desc: "내 프로필을 기억하는 챗봇이 수시 6장·정시 가나다군 전략을 같이 짜요." },
          ].map((s, idx) => (
            <MotionItem
              as="li"
              key={s.title}
              className="relative flex flex-col items-center text-center gap-4 z-10"
            >
              <div className={`relative flex h-16 w-16 items-center justify-center rounded-2xl bg-card border border-border shadow-sm ${TONE_GLOW[s.tone as keyof typeof TONE_GLOW]}`}>
                <s.icon className={`h-7 w-7 ${TONE_FG[s.tone as keyof typeof TONE_FG]}`} strokeWidth={1.5} />
                <span className="absolute -top-2 -right-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-background text-2xs font-bold font-numeric tabular-nums">
                  {idx + 1}
                </span>
              </div>
              <div>
                <h3 className="text-lg font-bold mb-1.5">{s.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed break-keep-all max-w-xs mx-auto">{s.desc}</p>
              </div>
            </MotionItem>
          ))}
        </ol>

        {/* Mobile vertical */}
        <ol className="md:hidden flex flex-col gap-6">
          {[
            { icon: GraduationCap, tone: "brand",  title: "성적·생기부 입력", desc: "한 번 입력하면 분석에 그대로 사용돼요." },
            { icon: BarChart3,     tone: "iris",   title: "합격률 분석",       desc: "Safety·Match·Reach 자동 분류." },
            { icon: Bot,           tone: "violet", title: "AI 카운슬러",        desc: "수시 6장 + 정시 가나다군 전략." },
          ].map((s, idx) => (
            <MotionItem as="li" key={s.title} className="flex gap-4">
              <div className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-card border border-border shadow-sm ${TONE_GLOW[s.tone as keyof typeof TONE_GLOW]}`}>
                <s.icon className={`h-5 w-5 ${TONE_FG[s.tone as keyof typeof TONE_FG]}`} />
                <span className="absolute -top-1.5 -right-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-background text-2xs font-bold font-numeric tabular-nums">
                  {idx + 1}
                </span>
              </div>
              <div>
                <h3 className="text-base font-bold mb-1">{s.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed break-keep-all">{s.desc}</p>
              </div>
            </MotionItem>
          ))}
        </ol>
      </MotionSection>

      {/* ═══ Quote ═══ */}
      <MotionSection className="mx-auto w-full max-w-content px-gutter-sm md:px-gutter lg:px-gutter-lg py-16 lg:py-24">
        <MotionItem
          as="article"
          className="relative overflow-hidden rounded-[2rem] border-2 border-dashed border-brand-300/60 dark:border-brand-700/60 bg-brand-50/30 dark:bg-brand-950/30 px-8 py-10 md:px-12 md:py-14 backdrop-blur-sm"
        >
          <Quote className="absolute -left-3 -top-3 h-20 w-20 text-brand-200 dark:text-brand-900 rotate-180" strokeWidth={1.5} aria-hidden />
          <blockquote className="relative max-w-2xl">
            <p className="font-display text-2xl md:text-3xl lg:text-4xl font-bold tracking-tight leading-snug break-keep-all">
              모르는 건 모른다고 말합니다.
            </p>
            <p className="mt-5 text-base text-muted-foreground leading-relaxed break-keep-all">
              표본이 부족한 학과는 합격 확률을 임의로 만들지 않고 비공개로 표시합니다.
              AI 카운슬러도 추측 수치를 답변에 넣지 않습니다 — 진학사·대학어디가가 아닌,
              <span className="font-semibold text-foreground"> 정직한 데이터로만 답하는</span> 서비스를 만들고 있어요.
            </p>
          </blockquote>
        </MotionItem>
      </MotionSection>

      {/* ═══ Personas ═══ */}
      <MotionSection
        className="mx-auto w-full max-w-content-wide px-gutter-sm md:px-gutter lg:px-gutter-lg py-20 lg:py-28"
        stagger={100}
      >
        <MotionItem className="mb-12 flex flex-col items-center text-center gap-3">
          <Badge variant="pill-violet" size="md">사용자</Badge>
          <h2 className="font-display text-3xl lg:text-5xl font-extrabold tracking-tighter">
            이런 분들이 쓰고 있어요
          </h2>
        </MotionItem>

        <div className="grid gap-5 md:grid-cols-3">
          {PERSONAS.map((p) => (
            <MotionItem
              as="article"
              key={p.label}
              className="group relative flex flex-col gap-5 rounded-3xl border border-border bg-card p-7 lg:p-8 transition-all duration-300 hover:-translate-y-1 hover:border-foreground/15 hover:shadow-lg"
            >
              <div className="flex items-center gap-3">
                <span className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${p.avatarBg} text-white font-bold text-lg shadow-sm`}>
                  {p.initial}
                </span>
                <Badge variant="pill-ink" size="sm">{p.label}</Badge>
              </div>
              <h3 className="text-lg font-bold leading-snug break-keep-all">{p.title}</h3>
              <p className="text-base text-muted-foreground leading-relaxed break-keep-all flex-1">
                &ldquo;{p.body}&rdquo;
              </p>
            </MotionItem>
          ))}
        </div>
      </MotionSection>

      {/* ═══ Bento features ═══ */}
      <MotionSection
        className="mx-auto w-full max-w-content-wide px-gutter-sm md:px-gutter lg:px-gutter-lg py-20 lg:py-28"
        stagger={80}
      >
        <MotionItem className="mb-12 flex flex-col items-center text-center gap-3">
          <Badge variant="pill-brand" size="md">핵심 기능</Badge>
          <h2 className="font-display text-3xl lg:text-5xl font-extrabold tracking-tighter">
            데이터 + AI + 시즌 자동화
          </h2>
        </MotionItem>

        {/* Bento: 첫 카드는 col-span-2 + viz, 나머지 3개 small */}
        <div className="grid gap-5 md:grid-cols-3 md:grid-rows-2">
          <MotionItem
            as="article"
            className="md:col-span-2 md:row-span-1 group relative overflow-hidden rounded-3xl border border-border bg-card p-7 lg:p-9"
          >
            <Badge variant="pill-brand" size="sm" className="absolute right-5 top-5">코어</Badge>
            <Target className="h-9 w-9 text-brand-600 dark:text-brand-300 mb-5" strokeWidth={1.5} />
            <h3 className="text-xl lg:text-2xl font-bold mb-2 tracking-tight">학과 단위 합격률 분석</h3>
            <p className="text-sm md:text-base text-muted-foreground leading-relaxed break-keep-all max-w-md">
              같은 대학이라도 학과마다 일정·등급·반영비가 다릅니다. 학과 단위로 쪼개 분석해 진짜 정확도를 만들어요.
            </p>
            {/* mini bar chart */}
            <div className="mt-7 flex items-end gap-1.5">
              {[40, 55, 30, 70, 50, 85, 60, 75].map((h, i) => (
                <div
                  key={i}
                  className="w-full rounded-md bg-gradient-to-t from-brand-500 to-brand-300"
                  style={{ height: `${h * 0.6}px`, opacity: 0.4 + (h / 100) * 0.6 }}
                />
              ))}
            </div>
          </MotionItem>

          <MotionItem
            as="article"
            className="group relative rounded-3xl border border-border bg-card p-7"
          >
            <School className="h-8 w-8 text-iris-500 mb-4" strokeWidth={1.5} />
            <h3 className="text-lg font-bold mb-2">전형별 분리</h3>
            <p className="text-sm text-muted-foreground leading-relaxed break-keep-all">
              학종·교과·논술·실기·정시 가나다군까지 별도 카드로 비교.
            </p>
          </MotionItem>

          <MotionItem
            as="article"
            className="group relative rounded-3xl border border-border bg-card p-7"
          >
            <Bot className="h-8 w-8 text-violet-500 mb-4" strokeWidth={1.5} />
            <h3 className="text-lg font-bold mb-2">내 프로필 기억</h3>
            <p className="text-sm text-muted-foreground leading-relaxed break-keep-all">
              같은 정보를 다시 입력할 필요 없어요. 이전 대화 그대로 이어집니다.
            </p>
          </MotionItem>

          <MotionItem
            as="article"
            className="group relative overflow-hidden rounded-3xl border border-border bg-card p-7"
          >
            <Badge variant="pill-amber" size="sm" className="absolute right-5 top-5">시즌</Badge>
            <Clock className="h-8 w-8 text-amber-500 mb-4" strokeWidth={1.5} />
            <h3 className="text-lg font-bold mb-2">7~9월 자동 갱신</h3>
            <p className="text-sm text-muted-foreground leading-relaxed break-keep-all">
              모집요강은 매년 시즌마다 갱신. 시즌권은 별도 작업 없이 최신.
            </p>
          </MotionItem>
        </div>
      </MotionSection>

      {/* ═══ FAQ ═══ */}
      <MotionSection className="mx-auto w-full max-w-content px-gutter-sm md:px-gutter lg:px-gutter-lg py-20 lg:py-28">
        <MotionItem className="mb-12 flex flex-col items-center text-center gap-3">
          <Badge variant="pill-iris" size="md">FAQ</Badge>
          <h2 className="font-display text-3xl lg:text-5xl font-extrabold tracking-tighter">
            자주 묻는 질문
          </h2>
        </MotionItem>

        <Accordion
          type="single"
          collapsible
          className="rounded-3xl border border-border bg-card/80 backdrop-blur-sm divide-y divide-border shadow-sm overflow-hidden"
        >
          {LANDING_FAQS.map((f) => (
            <AccordionItem
              key={f.id}
              value={f.id}
              className="border-0 px-6 lg:px-7 group transition-colors data-[state=open]:bg-brand-50/40 dark:data-[state=open]:bg-brand-950/20"
            >
              <AccordionTrigger className="text-left text-sm lg:text-base font-semibold text-foreground hover:no-underline py-5 lg:py-6 group-data-[state=open]:text-brand-700 dark:group-data-[state=open]:text-brand-300">
                {/* 좌측 vertical bar — 열렸을 때만 표시 */}
                <span className="absolute -left-0.5 top-1/2 -translate-y-1/2 h-0 group-data-[state=open]:h-1/2 w-0.5 bg-brand-500 transition-all duration-200 rounded-full" aria-hidden />
                {f.question}
              </AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground leading-relaxed break-keep-all pb-5 lg:pb-6">
                {f.plainAnswer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </MotionSection>

      {/* ═══ Final CTA — dark ink ═══ */}
      <MotionSection className="mx-auto w-full max-w-content-wide px-gutter-sm md:px-gutter lg:px-gutter-lg py-20 lg:py-28">
        <MotionItem
          className="relative overflow-hidden rounded-[2.5rem] bg-ink-950 dark:bg-ink-900 text-white p-10 md:p-16 lg:p-20"
        >
          {/* mesh gradient overlay */}
          <div className="absolute inset-0 -z-0 opacity-80" aria-hidden>
            <div className="absolute top-[-20%] left-[10%] h-96 w-96 rounded-full bg-brand-500/40 blur-3xl" />
            <div className="absolute top-[20%] right-[5%] h-80 w-80 rounded-full bg-iris/35 blur-3xl" />
            <div className="absolute bottom-[-20%] left-[40%] h-72 w-72 rounded-full bg-violet-500/25 blur-3xl" />
          </div>
          {/* dot grid */}
          <div
            className="absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)",
              backgroundSize: "24px 24px",
            }}
            aria-hidden
          />

          <div className="relative z-10 flex flex-col items-center text-center gap-6 lg:gap-8">
            <Badge variant="pill-brand" size="md" className="bg-brand-500/15 border-brand-400/30 text-brand-200">
              지금 시작
            </Badge>
            <h2 className="font-display text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tightest leading-tight max-w-3xl break-keep-all">
              올해 입시, 막막함 대신
              <br className="hidden sm:block" />
              {/* 그라디언트 중간 명도 보장: brand-300 → cyan 250 → iris-300
                  단순 2-stop 은 중간색이 어두워 어두운 배경에서 가독성 저하 (P0-06). */}
              <span
                className="bg-clip-text text-transparent"
                style={{
                  backgroundImage:
                    "linear-gradient(90deg, hsl(156 72% 72%), hsl(180 80% 75%), hsl(243 91% 78%))",
                }}
              >
                데이터로 시작
              </span>
              해요
            </h2>
            <p className="text-base lg:text-lg text-white/70 max-w-xl break-keep-all leading-relaxed">
              가입 즉시 무료 분석 + AI 카운슬러 사용 가능. 결제는 분석을 먼저 보고 결정하세요.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 mt-2 w-full sm:w-auto">
              {/* variant=ghost 로 default bg-brand-600 클래스 충돌 차단 후 dark-bg 위 white 토큰 명시.
                  P0-06 audit: 이전엔 default variant 의 dark:bg-brand-500 와 className 의 bg-white 가 동시 적용. */}
              <Button
                asChild
                size="2xl"
                variant="ghost"
                className="bg-white text-ink-950 hover:bg-white/90 shadow-xl focus-visible:ring-white"
              >
                <Link href="/signup?returnUrl=/onboarding">
                  무료 가입하고 분석 받기
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="2xl" variant="ghost" className="text-white hover:bg-white/10 border border-white/20">
                <Link href="/pricing">요금제 보기</Link>
              </Button>
            </div>

            {/* Floating mini-cards (decorative) */}
            <div className="hidden lg:block absolute -left-4 top-1/3 -rotate-6 animate-float-sm">
              <FloatingMini icon={<CheckCircle2 className="h-4 w-4 text-brand-400" />} label="Safety 87%" sub="한국외대 AI융합" />
            </div>
            <div className="hidden lg:block absolute -right-4 bottom-1/4 rotate-6 animate-float-sm" style={{ animationDelay: "0.6s" }}>
              <FloatingMini icon={<Sparkles className="h-4 w-4 text-iris-300" />} label="AI 카운슬러" sub="실시간 응답" />
            </div>
          </div>
        </MotionItem>
      </MotionSection>
    </div>
  );
}

/* ───────────────────────── helpers (server-rendered SVG) ───────────────────────── */

const TONE_GLOW = {
  brand:  "shadow-glow-brand",
  iris:   "shadow-glow-iris",
  violet: "shadow-glow-violet",
} as const;
const TONE_FG = {
  brand:  "text-brand-600 dark:text-brand-300",
  iris:   "text-iris-500",
  violet: "text-violet-500",
} as const;

function SparkBar({ values, tone, className }: { values: number[]; tone: "brand"; className?: string }): React.ReactElement {
  const max = Math.max(...values);
  return (
    <div className={`flex items-end gap-1 h-12 ${className ?? ""}`} aria-hidden>
      {values.map((v, i) => (
        <span
          key={i}
          className={`w-full rounded-sm ${tone === "brand" ? "bg-brand-400/70 dark:bg-brand-500/70" : "bg-iris-400/70"}`}
          style={{ height: `${(v / max) * 100}%` }}
        />
      ))}
    </div>
  );
}

function CategoryDots({ className }: { className?: string }): React.ReactElement {
  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`} aria-hidden>
      {([
        ["bg-cat-safety", "Safety"],
        ["bg-cat-target", "Match"],
        ["bg-cat-hard",   "Hard"],
        ["bg-cat-reach",  "Reach"],
      ] as const).map(([bg, label]) => (
        <span key={label} className="flex items-center gap-1.5 text-2xs text-muted-foreground">
          <span className={`h-2 w-2 rounded-full ${bg}`} />
          {label}
        </span>
      ))}
    </div>
  );
}

function HonestyHint({ className }: { className?: string }): React.ReactElement {
  return (
    <div className={`flex items-center gap-2 rounded-lg border border-dashed border-amber-300/60 dark:border-amber-700/40 bg-amber-50/40 dark:bg-amber-950/20 px-3 py-2 ${className ?? ""}`} aria-hidden>
      <ShieldCheck className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <span className="text-2xs text-muted-foreground">표본 부족 → 확률 비공개</span>
    </div>
  );
}

function FloatingMini({ icon, label, sub }: { icon: React.ReactNode; label: string; sub: string }): React.ReactElement {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-white/15 bg-ink-900/80 backdrop-blur-md px-3 py-2 shadow-xl">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5">{icon}</span>
      <div className="flex flex-col leading-tight text-left">
        <span className="text-xs font-semibold text-white">{label}</span>
        <span className="text-2xs text-white/60">{sub}</span>
      </div>
    </div>
  );
}
