/**
 * / — 랜딩 페이지 (Server Component)
 *
 * 메인 플로우 진입점: 가입 → 온보딩 → 첫 분석 → 결제 → 상세 분석.
 * SEO 우선 (JSON-LD: Organization + WebSite + FAQPage). 비로그인 노출 가능.
 *
 * 구조: Hero → Trust(3 metric) → How it works(3 step) → Personas → FAQ → Footer CTA.
 * prismedu.kr 패턴 골격 유지, 한국 입시 도메인 카피·플로우로 교체. 의존 컴포넌트는
 * UI 프리미티브(Card/Button/Accordion)만 사용 — landing/* 컴포넌트 미포팅 시점 우회.
 */

import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Bot,
  CheckCircle2,
  GraduationCap,
  School,
  ShieldCheck,
  Sparkles,
  Target,
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
  },
  {
    icon: BarChart3,
    title: "학과별 합격률 분석",
    desc: "1,000여 학과를 Safety·Match·Reach로 분류. 표본 부족 학과는 솔직히 '데이터 없음'으로 표시해요.",
  },
  {
    icon: Bot,
    title: "AI 카운슬러 상담",
    desc: "내 프로필을 기억하는 챗봇이 수시 6장·정시 가나다군 전략을 같이 짜요.",
  },
] as const;

const PERSONAS = [
  {
    label: "고2 학생",
    title: "수시 6장, 정시 3장 어떻게 채우지?",
    body: "내 등급으로 학종 / 교과 / 논술을 어떻게 섞을지 막막했는데, 학과별 가능성과 전형별 비교를 한 화면에서 봤어요.",
  },
  {
    label: "고3 학부모",
    title: "원서 접수 전 마지막 점검",
    body: "9월 모의 결과 반영해서 정시 가나다군 슬롯 시뮬레이션. 가군에 안정·나군에 적정·다군에 상향 — 뭘 빼고 뭘 넣을지 명확해졌어요.",
  },
  {
    label: "재외국민 지원자",
    title: "특례 전형 자격이 되나?",
    body: "해외 재학 기간·국적 조건을 자가진단 후 자격 충족 학과만 모아 보고, 일반 분석에 끌려가지 않아 시간을 아꼈어요.",
  },
] as const;

const TRUST = [
  { value: "1,000+", label: "분석 가능 학과" },
  { value: "전형별", label: "수시·정시 분리" },
  { value: "표본 정직성", label: "부족 시 비공개" },
] as const;

export default function LandingPage(): React.ReactElement {
  return (
    <div className="relative min-h-dvh bg-gradient-to-b from-mint-50/60 via-background to-background dark:from-mint-950/40 dark:via-background dark:to-background">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* SEO 본문 — 시각적으로 숨김. 크롤러용 정형 콘텐츠. */}
      <section className="sr-only" aria-label="conatusipsi 서비스 소개">
        <h2>conatusipsi — 한국 대학 입시 AI 추천</h2>
        <p>
          내신·수능·생기부 정보를 입력하면 1,000여 한국 대학 학과의 합격 가능성을 AI가
          분석합니다. 수시(학생부종합·학생부교과·논술·실기)·정시(가/나/다군)·재외국민
          전형을 모두 지원합니다.
        </p>
        <h3>주요 기능</h3>
        <ul>
          <li>학과별 합격률 분석 — Safety / Match / Reach 분류</li>
          <li>모집요강·입시정보 조회 — 대학·학과 단위</li>
          <li>AI 입시 카운슬러 — 내 프로필 기반 실시간 상담</li>
          <li>What-if 시뮬레이터 — 수능 등급·내신 가정 실험</li>
          <li>자동 입시 플래너 — 원서접수·면접·논술 일정 관리</li>
        </ul>
      </section>

      <div className="mx-auto w-full max-w-content-wide px-gutter-sm md:px-gutter lg:px-gutter-lg py-12 lg:py-20">
        {/* ═══ Hero ═══ */}
        <header className="flex flex-col items-center text-center gap-5 lg:gap-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-mint-200 dark:border-mint-800 bg-mint-50 dark:bg-mint-950/60 px-4 py-1.5">
            <Sparkles className="h-4 w-4 text-mint-600 dark:text-mint-400" />
            <span className="text-xs font-semibold text-mint-700 dark:text-mint-300">
              2026 수시·정시 시즌 준비
            </span>
          </div>

          <h1 className="text-4xl lg:text-5xl font-extrabold tracking-tight text-foreground text-balance break-keep-all max-w-[20ch] lg:max-w-none">
            내 성적으로 갈 수 있는 학과,
            <br className="hidden sm:block" />
            <span className="text-mint-600 dark:text-mint-400">3초면 알 수 있어요</span>
          </h1>

          <p className="text-base lg:text-lg text-muted-foreground leading-relaxed text-balance break-keep-all max-w-[40ch] lg:max-w-2xl">
            전국 1,000여 학과 모집요강·합격 사례를 학습한 AI가
            내신·수능·생기부에 맞는 수시 6장 + 정시 가나다군 전략을 정리해드려요.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 mt-3 w-full sm:w-auto">
            <Button
              asChild
              size="2xl"
              className="bg-mint-500 hover:bg-mint-600 text-white shadow-lg shadow-mint-500/30"
            >
              <Link href="/login?returnUrl=/onboarding">
                지금 무료로 분석 시작
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="2xl" variant="outline">
              <Link href="/admissions">학과 둘러보기</Link>
            </Button>
          </div>

          {/* Trust metrics */}
          <ul
            aria-label="신뢰 지표"
            className="grid grid-cols-3 gap-3 sm:gap-6 mt-8 w-full max-w-2xl"
          >
            {TRUST.map((t) => (
              <li
                key={t.label}
                className="flex flex-col items-center gap-1 rounded-2xl bg-card/70 dark:bg-card/40 border border-border/60 p-4 backdrop-blur-sm"
              >
                <span className="text-lg sm:text-2xl font-bold text-mint-600 dark:text-mint-400 tabular-nums">
                  {t.value}
                </span>
                <span className="text-2xs sm:text-xs text-muted-foreground text-center break-keep-all leading-tight">
                  {t.label}
                </span>
              </li>
            ))}
          </ul>
        </header>

        {/* ═══ How it works ═══ */}
        <section aria-label="이용 방법" className="mt-section-lg lg:mt-24">
          <h2 className="text-center text-2xl lg:text-3xl font-bold text-foreground mb-8">
            3단계로 시작해요
          </h2>
          <ol className="grid gap-4 md:grid-cols-3">
            {STEPS.map((s, idx) => {
              const Icon = s.icon;
              return (
                <li
                  key={s.title}
                  className="relative rounded-2xl bg-card border border-border/60 p-card-lg shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="absolute -top-3 left-5 inline-flex items-center justify-center w-7 h-7 rounded-full bg-mint-500 text-white text-xs font-bold tabular-nums">
                    {idx + 1}
                  </div>
                  <div className="w-11 h-11 rounded-xl bg-mint-50 dark:bg-mint-950/60 text-mint-600 dark:text-mint-400 flex items-center justify-center mb-4">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-semibold text-foreground mb-1.5">
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
        <section className="mt-section-lg lg:mt-24">
          <div className="rounded-2xl border border-mint-200 dark:border-mint-800 bg-mint-50/60 dark:bg-mint-950/40 p-card-lg flex flex-col md:flex-row items-start gap-4">
            <div className="w-11 h-11 rounded-xl bg-mint-500/15 text-mint-600 dark:text-mint-400 flex items-center justify-center shrink-0">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-foreground mb-1.5">
                모르는 건 모른다고 말합니다
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed break-keep-all">
                표본이 부족한 학과는 합격 확률을 임의로 만들지 않고 비공개로 표시합니다.
                AI 카운슬러도 추측 수치를 답변에 넣지 않습니다 — 진학사·대학어디가가 아닌,
                <span className="font-medium text-foreground"> 정직한 데이터로만 답하는</span>
                서비스를 만들고 있어요.
              </p>
            </div>
          </div>
        </section>

        {/* ═══ Personas ═══ */}
        <section aria-label="이런 분들께 추천" className="mt-section-lg lg:mt-24">
          <h2 className="text-center text-2xl lg:text-3xl font-bold text-foreground mb-8">
            이런 분들이 쓰고 있어요
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            {PERSONAS.map((p) => (
              <article
                key={p.label}
                className="rounded-2xl bg-card border border-border/60 p-card-lg shadow-sm flex flex-col gap-3"
              >
                <span className="self-start text-2xs font-semibold rounded-full px-2.5 py-1 bg-mint-100 text-mint-700 dark:bg-mint-900/60 dark:text-mint-300">
                  {p.label}
                </span>
                <h3 className="text-base font-semibold text-foreground leading-snug break-keep-all">
                  {p.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed break-keep-all">
                  &ldquo;{p.body}&rdquo;
                </p>
              </article>
            ))}
          </div>
        </section>

        {/* ═══ Feature highlights ═══ */}
        <section aria-label="핵심 기능" className="mt-section-lg lg:mt-24">
          <div className="grid gap-4 md:grid-cols-2">
            <FeatureCard
              icon={<Target className="h-5 w-5" />}
              title="학과 단위 합격률 분석"
              body="같은 대학이라도 학과마다 일정·등급·반영비가 다릅니다. 학과 단위로 쪼개 분석해 진짜 정확도를 만들어요."
            />
            <FeatureCard
              icon={<School className="h-5 w-5" />}
              title="전형별 분리 (수시·정시·논술·실기)"
              body="학생부종합·학생부교과·논술·실기·정시 가나다군까지 — 전형별로 별도 카드로 비교 가능."
            />
            <FeatureCard
              icon={<Bot className="h-5 w-5" />}
              title="내 프로필 기억하는 카운슬러"
              body="매번 같은 정보를 다시 입력할 필요 없어요. 내 성적·의향·이전 대화를 기억하고 답변합니다."
            />
            <FeatureCard
              icon={<CheckCircle2 className="h-5 w-5" />}
              title="시즌 자동 갱신"
              body="모집요강은 7~9월마다 갱신됩니다. 시즌권 사용자는 별도 작업 없이 최신 데이터로 자동 반영돼요."
            />
          </div>
        </section>

        {/* ═══ FAQ ═══ */}
        <section aria-label="자주 묻는 질문" className="mt-section-lg lg:mt-24">
          <h2 className="text-center text-2xl lg:text-3xl font-bold text-foreground mb-8">
            자주 묻는 질문
          </h2>
          <Accordion
            type="single"
            collapsible
            className="max-w-3xl mx-auto rounded-2xl border border-border/60 bg-card divide-y divide-border/60"
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

        {/* ═══ Footer CTA ═══ */}
        <section className="mt-section-lg lg:mt-24">
          <div className="rounded-3xl bg-gradient-to-br from-mint-500 to-mint-700 dark:from-mint-700 dark:to-mint-900 text-white p-card-lg lg:p-10 text-center">
            <h2 className="text-2xl lg:text-3xl font-bold mb-3 break-keep-all">
              올해 입시, 막막함 대신 데이터로 시작해요
            </h2>
            <p className="text-sm lg:text-base text-white/90 mb-6 max-w-xl mx-auto break-keep-all leading-relaxed">
              가입 즉시 무료 분석 20개 학과 + AI 카운슬러 5회 사용 가능.
              결제는 분석을 먼저 보고 결정하세요.
            </p>
            <Button
              asChild
              size="2xl"
              variant="secondary"
              className="bg-white text-mint-700 hover:bg-white/90"
            >
              <Link href="/login?returnUrl=/onboarding">
                무료로 시작하기
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>

        {/* Footer mini */}
        <footer className="mt-section-lg lg:mt-20 pt-8 border-t border-border/60 flex flex-col sm:flex-row gap-3 sm:gap-6 items-center justify-between text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} conatusipsi</span>
          <nav className="flex gap-4 flex-wrap justify-center">
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
        </footer>
      </div>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}): React.ReactElement {
  return (
    <article className="rounded-2xl bg-card border border-border/60 p-card-lg flex gap-4 items-start">
      <div className="w-11 h-11 rounded-xl bg-mint-50 dark:bg-mint-950/60 text-mint-600 dark:text-mint-400 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-foreground mb-1.5">{title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed break-keep-all">
          {body}
        </p>
      </div>
    </article>
  );
}
