"use client";

import * as React from "react";
import Link from "next/link";
import { GraduationCap, ShieldCheck, TrendingUp, Sparkles } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Badge } from "@/components/ui/badge";

/**
 * SplitScreenAuth — /login · /signup 공용 레이아웃.
 *
 * - 좌측 50% 다크 브랜드 패널 (모바일에선 상단 압축 버전)
 * - 우측 50% 폼 영역
 * - 좌측 패널: 로고 + 카피 + 신뢰 포인트 + 미니 product mockup
 */
export function SplitScreenAuth({
  children,
  mode,
}: {
  children: React.ReactNode;
  mode: "login" | "signup";
}): React.ReactElement {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* Left — brand panel */}
      <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-ink-950 dark:bg-ink-900 text-white p-10 xl:p-14">
        {/* mesh */}
        <div className="absolute inset-0 -z-0" aria-hidden>
          <div className="absolute -top-20 -left-10 h-96 w-96 rounded-full bg-brand-500/35 blur-3xl" />
          <div className="absolute top-1/3 right-0 h-80 w-80 rounded-full bg-iris/30 blur-3xl" />
          <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-violet-500/25 blur-3xl" />
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

        <div className="relative z-10 flex flex-col gap-8">
          {/* Logo */}
          <Link href="/" className="inline-flex items-center gap-2.5 self-start">
            <Logo className="h-9 w-9" />
            <span className="font-display text-base font-bold tracking-tight text-white">conatusipsi</span>
          </Link>

          {/* Copy */}
          <div className="flex flex-col gap-4 max-w-md">
            <Badge variant="pill-brand" size="md" className="self-start bg-brand-500/15 border-brand-400/30 text-brand-200">
              <Sparkles className="h-3 w-3" />
              {mode === "signup" ? "30초 가입" : "다시 만나서 반가워요"}
            </Badge>
            <h2 className="font-display text-3xl xl:text-4xl font-extrabold tracking-tighter leading-[1.1] break-keep-all">
              {mode === "signup" ? (
                <>정직한 데이터로<br/>입시 설계 시작</>
              ) : (
                <>오늘 분석<br/>이어서 시작</>
              )}
            </h2>
            <p className="text-sm text-white/70 leading-relaxed break-keep-all">
              {mode === "signup"
                ? "내신·수능·생기부만 입력하면 1,000여 학과 중 나에게 맞는 수시 6장 + 정시 가나다군 전략을 받아볼 수 있어요."
                : "이전 분석·시뮬레이션 그대로 이어집니다. AI 카운슬러도 이전 대화 기억해요."}
            </p>
          </div>
        </div>

        {/* Trust points */}
        <div className="relative z-10 flex flex-col gap-3">
          {[
            { icon: TrendingUp, label: "1,000+ 학과 데이터 학습 · 수시·정시 전형별 분리" },
            { icon: ShieldCheck, label: "표본 부족 학과는 확률 비공개 · 정직성 원칙" },
            { icon: GraduationCap, label: "재외국민·특례 전형 자가진단 지원" },
          ].map((t) => (
            <div key={t.label} className="flex items-center gap-3 text-xs text-white/75">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/5 ring-1 ring-white/10">
                <t.icon className="h-3.5 w-3.5 text-brand-400" />
              </span>
              <span className="break-keep-all leading-relaxed">{t.label}</span>
            </div>
          ))}
        </div>
      </aside>

      {/* Right — form */}
      <section className="relative flex flex-col items-center justify-center px-gutter-sm md:px-gutter py-8 lg:py-12">
        {/* 모바일 — 상단 압축 브랜드 헤더 */}
        <div className="lg:hidden w-full max-w-md mb-6 flex flex-col items-center gap-3 text-center">
          <Link href="/" className="inline-flex items-center gap-2">
            <Logo className="h-8 w-8" />
            <span className="font-display text-sm font-bold tracking-tight">conatusipsi</span>
          </Link>
          <Badge variant="pill-brand" size="sm">
            {mode === "signup" ? "30초 가입" : "다시 만나서 반가워요"}
          </Badge>
        </div>

        <div className="w-full max-w-md">{children}</div>

        {/* Footer mini — 약관·정책 */}
        <div className="w-full max-w-md mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-2xs text-muted-foreground">
          <Link href="/terms" className="hover:text-foreground transition-colors">이용약관</Link>
          <span aria-hidden>·</span>
          <Link href="/privacy" className="hover:text-foreground transition-colors">개인정보처리방침</Link>
          <span aria-hidden>·</span>
          <Link href="/help" className="hover:text-foreground transition-colors">고객센터</Link>
        </div>
      </section>
    </div>
  );
}
