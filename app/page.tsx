/**
 * / — 랜딩 페이지 (Server Component)
 *
 * 첫인상이 가장 중요한 페이지. Hero/Trust/How/Personas/Features/FAQ/Footer CTA.
 * SEO JSON-LD: Organization + WebSite + FAQPage.
 *
 * 디자인:
 *   - Floating prismatic orbs (mint·violet·amber 3개)
 *   - Sticky transparent nav
 *   - Hero typography: 5xl/6xl + animated highlight
 *   - Section alternating bg (subtle)
 *   - 모든 카드 hover lift + shadow glow
 */

import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Bot,
  CheckCircle2,
  Clock,
  GraduationCap,
  School,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
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

const STEPS = [
  {
    icon: GraduationCap,
    title: "성적·생기부 입력",
    desc: "내신·수능/모의·세특·비교과를 한 번 입력하면 분석에 그대로 사용돼요.",
    color: "from-mint-400 to-mint-600",
  },
  {
    icon: BarChart3,
    title: "학과별 합격률 분석",
    desc: "1,000여 학과를 Safety·Match·Reach로 분류. 표본 부족 학과는 솔직히 '데이터 없음'으로 표시해요.",
    color: "from-blue-400 to-indigo-600",
  },
  {
    icon: Bot,
    title: "AI 카운슬러 상담",
    desc: "내 프로필을 기억하는 챗봇이 수시 6장·정시 가나다군 전략을 같이 짜요.",
    color: "from-violet-400 to-purple-600",
  },
] as const;

const PERSONAS = [
  {
    label: "고2 학생",
    avatar: "🧑‍🎓",
    title: "수시 6장, 정시 3장 어떻게 채우지?",
    body: "내 등급으로 학종 / 교과 / 논술을 어떻게 섞을지 막막했는데, 학과별 가능성과 전형별 비교를 한 화면에서 봤어요.",
  },
  {
    label: "고3 학부모",
    avatar: "👨‍👩‍👦",
    title: "원서 접수 전 마지막 점검",
    body: "9월 모의 결과 반영해서 정시 가나다군 슬롯 시뮬레이션. 가군에 안정·나군에 적정·다군에 상향 — 뭘 빼고 뭘 넣을지 명확해졌어요.",
  },
  {
    label: "재외국민 지원자",
    avatar: "🌍",
    title: "특례 전형 자격이 되나?",
    body: "해외 재학 기간·국적 조건을 자가진단 후 자격 충족 학과만 모아 보고, 일반 분석에 끌려가지 않아 시간을 아꼈어요.",
  },
] as const;

const TRUST = [
  {
    icon: School,
    value: "1,000+",
    label: "분석 가능 학과",
    sub: "전국 주요 대학",
  },
  {
    icon: TrendingUp,
    value: "전형별",
    label: "수시·정시 분리",
    sub: "학종·교과·논술·정시",
  },
  {
    icon: ShieldCheck,
    value: "정직",
    label: "표본 부족 비공개",
    sub: "추측 수치 X",
  },
] as const;

export default function LandingPage(): React.ReactElement {
  return (
    <div className="relative min-h-dvh bg-background overflow-x-hidden">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* 배경 floating orbs — 시각적 깊이 */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
        <div className="absolute top-[-10%] left-[-10%] h-[40rem] w-[40rem] rounded-full bg-gradient-to-br from-mint-300/40 to-mint-500/20 blur-3xl dark:from-mint-700/30 dark:to-mint-900/20" />
        <div className="absolute top-[20%] right-[-15%] h-[35rem] w-[35rem] rounded-full bg-gradient-to-bl from-violet-300/30 to-blue-400/20 blur-3xl dark:from-violet-700/20 dark:to-blue-800/15" />
        <div className="absolute bottom-[-15%] left-[20%] h-[30rem] w-[30rem] rounded-full bg-gradient-to-tr from-amber-200/25 to-orange-300/15 blur-3xl dark:from-amber-700/15 dark:to-orange-800/10" />
      </div>

      {/* SEO 본문 — 시각적으로 숨김 */}
      <section className="sr-only" aria-label="conatusipsi 서비스 소개">
        <h2>conatusipsi — 한국 대학 입시 AI 추천</h2>
        <p>
          내신·수능·생기부 정보를 입력하면 1,000여 한국 대학 학과의 합격 가능성을 AI가
          분석합니다. 수시(학생부종합·학생부교과·논술·실기)·정시(가/나/다군)·재외국민
          전형을 모두 지원합니다.
        </p>
      </section>

      <div className="relative">
        {/* ═══ Hero ═══ */}
        <section className="mx-auto w-full max-w-content-wide px-gutter-sm md:px-gutter lg:px-gutter-lg pt-12 pb-16 lg:pt-20 lg:pb-24">
          <header className="flex flex-col items-center text-center gap-6 lg:gap-8">
            <div
              className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-mint-200 dark:border-mint-800 bg-mint-50/80 dark:bg-mint-950/60 px-4 py-1.5 backdrop-blur-sm"
              style={{ animationDelay: "0.05s" }}
            >
              <Sparkles className="h-3.5 w-3.5 text-mint-600 dark:text-mint-400" />
              <span className="text-xs font-semibold text-mint-700 dark:text-mint-300">
                2027학년도 시즌 준비
              </span>
            </div>

            <h1
              className="animate-fade-up text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-extrabold tracking-tight text-foreground text-balance break-keep-all max-w-[20ch] lg:max-w-[24ch] leading-[1.05]"
              style={{ animationDelay: "0.15s" }}
            >
              내 성적으로 갈 수 있는 학과,
              <br className="hidden sm:block" />
              <span className="bg-gradient-to-r from-mint-500 via-mint-600 to-emerald-600 bg-clip-text text-transparent">
                3초면
              </span>{" "}
              알 수 있어요
            </h1>

            <p
              className="animate-fade-up text-base sm:text-lg lg:text-xl text-muted-foreground leading-relaxed text-balance break-keep-all max-w-[40ch] lg:max-w-2xl"
              style={{ animationDelay: "0.25s" }}
            >
              전국 1,000여 학과 모집요강·합격 사례를 학습한 AI가
              <br className="hidden md:block" />
              내신·수능·생기부에 맞는 수시 6장 + 정시 가나다군 전략을 정리해드려요.
            </p>

            <div
              className="animate-fade-up flex flex-col sm:flex-row gap-3 mt-2 w-full sm:w-auto"
              style={{ animationDelay: "0.35s" }}
            >
              <Button
                asChild
                size="2xl"
                className="bg-mint-500 hover:bg-mint-600 text-white shadow-xl shadow-mint-500/40 hover:shadow-2xl hover:shadow-mint-500/50 hover:-translate-y-0.5 transition-all"
              >
                <Link href="/login?returnUrl=/onboarding">
                  지금 무료로 분석 시작
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="2xl"
                variant="outline"
                className="border-2 hover:bg-muted/50 backdrop-blur-sm"
              >
                <Link href="/admissions">학과 둘러보기</Link>
              </Button>
            </div>

            {/* Trust metrics */}
            <ul
              aria-label="신뢰 지표"
              className="animate-fade-up grid grid-cols-3 gap-3 sm:gap-6 mt-12 w-full max-w-3xl"
              style={{ animationDelay: "0.45s" }}
            >
              {TRUST.map((t) => {
                const Icon = t.icon;
                return (
                  <li
                    key={t.label}
                    className="group relative flex flex-col items-center gap-2 rounded-2xl bg-card/80 border border-border/60 p-4 sm:p-5 backdrop-blur-sm hover:shadow-lg hover:border-mint-300 dark:hover:border-mint-700 transition-all"
                  >
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-mint-50 to-mint-100 dark:from-mint-950 dark:to-mint-900 text-mint-600 dark:text-mint-400 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="text-base sm:text-2xl font-bold text-foreground tabular-nums leading-none">
                      {t.value}
                    </span>
                    <span className="text-2xs sm:text-xs text-foreground font-medium text-center break-keep-all leading-tight">
                      {t.label}
                    </span>
                    <span className="text-2xs text-muted-foreground hidden sm:block break-keep-all">
                      {t.sub}
                    </span>
                  </li>
                );
              })}
            </ul>
          </header>
        </section>

        {/* ═══ How it works ═══ */}
        <section className="mx-auto w-full max-w-content-wide px-gutter-sm md:px-gutter lg:px-gutter-lg py-16 lg:py-24">
          <div className="text-center mb-10 lg:mb-14">
            <p className="text-xs font-semibold uppercase tracking-wider text-mint-600 dark:text-mint-400 mb-2">
              How it works
            </p>
            <h2 className="text-3xl lg:text-4xl font-bold text-foreground tracking-tight">
              3단계로 시작해요
            </h2>
          </div>
          <ol className="grid gap-5 md:grid-cols-3">
            {STEPS.map((s, idx) => {
              const Icon = s.icon;
              return (
                <li
                  key={s.title}
                  className="group relative rounded-3xl bg-card border border-border/60 p-6 lg:p-7 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
                >
                  <div className="absolute -top-3 left-6 inline-flex items-center justify-center w-8 h-8 rounded-full bg-foreground text-background text-xs font-bold tabular-nums">
                    {idx + 1}
                  </div>
                  <div
                    className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${s.color} text-white flex items-center justify-center mb-5 shadow-lg group-hover:scale-110 transition-transform`}
                  >
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="text-lg font-bold text-foreground mb-2">
                    {s.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed break-keep-all">
                    {s.desc}
                  </p>
                </li>
              );
            })}
          </ol>
        </section>

        {/* ═══ Honesty note ═══ */}
        <section className="mx-auto w-full max-w-content px-gutter-sm md:px-gutter lg:px-gutter-lg py-12 lg:py-16">
          <div className="relative overflow-hidden rounded-3xl border border-mint-200 dark:border-mint-800 bg-gradient-to-br from-mint-50 via-mint-50/50 to-emerald-50 dark:from-mint-950/60 dark:via-mint-950/30 dark:to-emerald-950/40 p-8 lg:p-10">
            <div className="absolute top-0 right-0 -translate-y-1/3 translate-x-1/4 w-64 h-64 rounded-full bg-mint-300/30 blur-3xl" />
            <div className="relative flex flex-col md:flex-row items-start gap-5">
              <div className="w-14 h-14 rounded-2xl bg-mint-500 text-white flex items-center justify-center shrink-0 shadow-lg shadow-mint-500/30">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-xl lg:text-2xl font-bold text-foreground mb-2">
                  모르는 건 모른다고 말합니다
                </h3>
                <p className="text-sm lg:text-base text-muted-foreground leading-relaxed break-keep-all max-w-2xl">
                  표본이 부족한 학과는 합격 확률을 임의로 만들지 않고 비공개로
                  표시합니다. AI 카운슬러도 추측 수치를 답변에 넣지 않습니다 — 진학사·
                  대학어디가가 아닌,{" "}
                  <span className="font-semibold text-foreground">
                    정직한 데이터로만 답하는
                  </span>{" "}
                  서비스를 만들고 있어요.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ Personas ═══ */}
        <section className="mx-auto w-full max-w-content-wide px-gutter-sm md:px-gutter lg:px-gutter-lg py-16 lg:py-24">
          <div className="text-center mb-10 lg:mb-14">
            <p className="text-xs font-semibold uppercase tracking-wider text-mint-600 dark:text-mint-400 mb-2">
              누가 쓰나요
            </p>
            <h2 className="text-3xl lg:text-4xl font-bold text-foreground tracking-tight">
              이런 분들이 쓰고 있어요
            </h2>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {PERSONAS.map((p) => (
              <article
                key={p.label}
                className="group relative rounded-3xl bg-card border border-border/60 p-6 lg:p-7 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col gap-4"
              >
                <div className="flex items-center gap-3">
                  <div className="text-3xl">{p.avatar}</div>
                  <span className="text-2xs font-bold tracking-wider uppercase rounded-full px-2.5 py-1 bg-mint-100 text-mint-700 dark:bg-mint-900/60 dark:text-mint-300">
                    {p.label}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-foreground leading-snug break-keep-all">
                  {p.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed break-keep-all flex-1">
                  &ldquo;{p.body}&rdquo;
                </p>
              </article>
            ))}
          </div>
        </section>

        {/* ═══ Feature highlights ═══ */}
        <section className="mx-auto w-full max-w-content-wide px-gutter-sm md:px-gutter lg:px-gutter-lg py-16 lg:py-24">
          <div className="text-center mb-10 lg:mb-14">
            <p className="text-xs font-semibold uppercase tracking-wider text-mint-600 dark:text-mint-400 mb-2">
              핵심 기능
            </p>
            <h2 className="text-3xl lg:text-4xl font-bold text-foreground tracking-tight">
              왜 conatusipsi인가
            </h2>
          </div>
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-2 max-w-5xl mx-auto">
            <FeatureCard
              icon={<Target className="h-5 w-5" />}
              gradient="from-blue-400 to-indigo-600"
              title="학과 단위 합격률 분석"
              body="같은 대학이라도 학과마다 일정·등급·반영비가 다릅니다. 학과 단위로 쪼개 분석해 진짜 정확도를 만들어요."
            />
            <FeatureCard
              icon={<School className="h-5 w-5" />}
              gradient="from-mint-400 to-emerald-600"
              title="전형별 분리 (수시·정시·논술·실기)"
              body="학생부종합·학생부교과·논술·실기·정시 가나다군까지 — 전형별로 별도 카드로 비교 가능."
            />
            <FeatureCard
              icon={<Bot className="h-5 w-5" />}
              gradient="from-violet-400 to-purple-600"
              title="내 프로필 기억하는 카운슬러"
              body="매번 같은 정보를 다시 입력할 필요 없어요. 내 성적·의향·이전 대화를 기억하고 답변합니다."
            />
            <FeatureCard
              icon={<Clock className="h-5 w-5" />}
              gradient="from-amber-400 to-orange-600"
              title="시즌 자동 갱신"
              body="모집요강은 7~9월마다 갱신됩니다. 시즌권 사용자는 별도 작업 없이 최신 데이터로 자동 반영돼요."
            />
          </div>
        </section>

        {/* ═══ FAQ ═══ */}
        <section className="mx-auto w-full max-w-content px-gutter-sm md:px-gutter lg:px-gutter-lg py-16 lg:py-24">
          <div className="text-center mb-10 lg:mb-14">
            <p className="text-xs font-semibold uppercase tracking-wider text-mint-600 dark:text-mint-400 mb-2">
              FAQ
            </p>
            <h2 className="text-3xl lg:text-4xl font-bold text-foreground tracking-tight">
              자주 묻는 질문
            </h2>
          </div>
          <Accordion
            type="single"
            collapsible
            className="rounded-3xl border border-border/60 bg-card/80 backdrop-blur-sm divide-y divide-border/60 shadow-sm"
          >
            {LANDING_FAQS.map((f) => (
              <AccordionItem key={f.id} value={f.id} className="border-0 px-6 lg:px-7">
                <AccordionTrigger className="text-left text-sm lg:text-base font-semibold text-foreground hover:no-underline py-5 lg:py-6">
                  {f.question}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-relaxed break-keep-all pb-5 lg:pb-6">
                  {f.plainAnswer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        {/* ═══ Footer CTA ═══ */}
        <section className="mx-auto w-full max-w-content-wide px-gutter-sm md:px-gutter lg:px-gutter-lg py-16 lg:py-24">
          <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-mint-500 via-mint-600 to-emerald-700 text-white p-10 lg:p-16 text-center shadow-2xl shadow-mint-500/30">
            {/* decorative orbs */}
            <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/4 w-72 h-72 rounded-full bg-white/10 blur-3xl" />
            <div className="absolute bottom-0 left-0 translate-y-1/2 -translate-x-1/4 w-64 h-64 rounded-full bg-emerald-300/20 blur-3xl" />

            <div className="relative">
              <p className="text-xs font-semibold uppercase tracking-widest text-white/80 mb-3">
                지금 시작하세요
              </p>
              <h2 className="text-3xl lg:text-5xl font-bold mb-4 break-keep-all max-w-2xl mx-auto leading-tight">
                올해 입시, 막막함 대신
                <br className="hidden sm:block" />
                데이터로 시작해요
              </h2>
              <p className="text-base lg:text-lg text-white/90 mb-8 max-w-xl mx-auto break-keep-all leading-relaxed">
                가입 즉시 무료 분석 + AI 카운슬러 사용 가능. 결제는 분석을 먼저 보고
                결정하세요.
              </p>
              <Button
                asChild
                size="2xl"
                className="bg-white text-mint-700 hover:bg-white/95 hover:scale-105 shadow-xl transition-all"
              >
                <Link href="/login?returnUrl=/onboarding">
                  무료로 시작하기
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Footer mini */}
        <footer className="mx-auto w-full max-w-content-wide px-gutter-sm md:px-gutter lg:px-gutter-lg py-8 lg:py-10 border-t border-border/40">
          <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-mint-500/10 text-mint-600 dark:text-mint-400">
                <GraduationCap className="h-3.5 w-3.5" />
              </div>
              <span>© {new Date().getFullYear()} conatusipsi</span>
            </div>
            <nav className="flex gap-5 flex-wrap justify-center" aria-label="푸터 메뉴">
              <Link href="/pricing" className="hover:text-foreground transition-colors">
                요금제
              </Link>
              <Link href="/terms" className="hover:text-foreground transition-colors">
                이용약관
              </Link>
              <Link href="/privacy" className="hover:text-foreground transition-colors">
                개인정보처리방침
              </Link>
              <Link href="/refund" className="hover:text-foreground transition-colors">
                환불 정책
              </Link>
              <Link href="/help" className="hover:text-foreground transition-colors">
                고객센터
              </Link>
            </nav>
          </div>
        </footer>
      </div>
    </div>
  );
}

function FeatureCard({
  icon,
  gradient,
  title,
  body,
}: {
  icon: React.ReactNode;
  gradient: string;
  title: string;
  body: string;
}): React.ReactElement {
  return (
    <article className="group rounded-3xl bg-card border border-border/60 p-6 lg:p-7 flex gap-5 items-start shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
      <div
        className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${gradient} text-white flex items-center justify-center shrink-0 shadow-lg group-hover:scale-110 transition-transform`}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <h3 className="text-base lg:text-lg font-bold text-foreground mb-2">
          {title}
        </h3>
        <p className="text-sm text-muted-foreground leading-relaxed break-keep-all">
          {body}
        </p>
      </div>
    </article>
  );
}
