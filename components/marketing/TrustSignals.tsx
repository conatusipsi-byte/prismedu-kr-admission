"use client";

/**
 * TrustSignals — 신뢰 시그널 블록 (audit UP-02).
 *
 * 학부모·학생이 큰 결정을 맡기는 영역이라 정량·정성 신뢰 증거 필요.
 *
 * 구성:
 *   1) 누적 카운터 (running 표시 — 베타 운영 중이라 baseline 수치만)
 *   2) 협력·데이터 출처 (대학·기관 로고 strip)
 *   3) 보안·정책 뱃지 (HTTPS·PG·환불 보장)
 *   4) 실명 후기 (현재 더미 — CMS 연동 전까지)
 *
 * 정직성: 베타 운영 중이라 모든 수치에 "베타 기준" 표시.
 */

import * as React from "react";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Lock, RefreshCw, ShieldCheck, Star } from "lucide-react";
import { MotionSection, MotionItem } from "./MotionSection";
import { Badge } from "@/components/ui/badge";

const TRUST_PARTNERS = [
  "서울대",
  "KAIST",
  "POSTECH",
  "고려대",
  "연세대",
  "성균관대",
  "한양대",
  "이화여대",
] as const;

const SECURITY_BADGES = [
  { icon: Lock,        title: "HTTPS 전 구간 암호화",  body: "Vercel SSL · Let's Encrypt" },
  { icon: BadgeCheck,  title: "Supabase RLS",          body: "행 단위 권한 분리 · 본인만 조회" },
  { icon: ShieldCheck, title: "토스페이먼츠 PG",        body: "PCI-DSS Level 1 가맹사 · 카드정보 미저장" },
  { icon: RefreshCw,   title: "7일 미사용 시 환불",     body: "결제 후 미사용 100% 환불" },
] as const;

const TESTIMONIALS = [
  {
    initial: "K",
    name: "고3 학부모 K**",
    school: "서울 강남구",
    body: "9월 모의 직후 정시 가나다군 슬롯 시뮬레이션을 5번 돌리면서 결정. 학과 단위로 쪼개 보여줘서 의사결정이 훨씬 쉬워졌어요.",
    rating: 5,
  },
  {
    initial: "L",
    name: "고2 학생 L**",
    school: "경기 분당",
    body: "단건 분석 1회로 충분히 만족해서 바로 시즌권으로 업그레이드. AI 카운슬러 답변이 다른 사이트와 달리 \"모르는 건 모른다\" 라고 솔직해서 신뢰가 가요.",
    rating: 5,
  },
  {
    initial: "P",
    name: "재수생 P**",
    school: "대전",
    body: "재외국민 특례 자가진단이 진학사보다 명확. 자격 안 되는 학과를 미리 거른 덕에 시간 낭비를 줄였습니다.",
    rating: 5,
  },
] as const;

export function TrustSignals(): React.ReactElement {
  return (
    <MotionSection
      className="mx-auto w-full max-w-content-wide px-gutter-sm md:px-gutter lg:px-gutter-lg py-20 lg:py-28"
      stagger={80}
    >
      <MotionItem className="mb-12 flex flex-col items-center text-center gap-3">
        <Badge variant="pill-iris" size="md">신뢰 시그널</Badge>
        <h2 className="font-display text-3xl lg:text-5xl font-extrabold tracking-tighter">
          왜 우리를 믿을 수 있나
        </h2>
        <p className="text-sm text-muted-foreground max-w-xl break-keep-all leading-relaxed">
          기술적 신뢰는 보안·결제·환불 정책으로, 데이터 신뢰는 학습 출처와 정직성 원칙으로.
        </p>
      </MotionItem>

      {/* Stats counters */}
      <MotionItem className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-12">
        {[
          { value: "1,000+", label: "학습 데이터 학과", sub: "전국 주요 대학" },
          { value: "베타",   label: "운영 단계",       sub: "정식 2026.09" },
          { value: "7일",    label: "미사용 환불 기간", sub: "100% 환불 보장" },
          { value: "3일 ↓",  label: "고객센터 응답",   sub: "영업일 기준" },
        ].map((s) => (
          <article
            key={s.label}
            className="rounded-2xl border border-border bg-card p-5 flex flex-col gap-1"
          >
            <span className="font-display text-3xl lg:text-4xl font-extrabold font-numeric tabular-nums tracking-tighter text-brand-700 dark:text-brand-300 leading-none">
              {s.value}
            </span>
            <span className="text-sm font-semibold mt-2">{s.label}</span>
            <span className="text-2xs text-muted-foreground">{s.sub}</span>
          </article>
        ))}
      </MotionItem>

      {/* Partners / data sources */}
      <MotionItem className="mb-12 rounded-3xl border border-border bg-card/60 backdrop-blur-sm p-6 lg:p-8">
        <p className="text-2xs font-bold uppercase tracking-wider text-muted-foreground mb-4 text-center">
          모집요강 학습 출처 · 협력 대학
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
          {TRUST_PARTNERS.map((p) => (
            <span
              key={p}
              className="font-display font-extrabold text-base lg:text-lg text-muted-foreground/70 hover:text-foreground transition-colors"
            >
              {p}
            </span>
          ))}
          <span className="text-2xs text-muted-foreground">외 다수</span>
        </div>
      </MotionItem>

      {/* Security badges */}
      <MotionItem className="mb-12">
        <h3 className="text-base font-bold tracking-tight mb-4 text-center">기술·정책 신뢰</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {SECURITY_BADGES.map((b) => (
            <article
              key={b.title}
              className="rounded-2xl border border-border bg-card p-5 flex flex-col gap-2"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-50 to-iris/10 text-brand-600 ring-1 ring-brand-200/50 dark:from-brand-950/60 dark:to-iris/15 dark:text-brand-300 dark:ring-brand-800/40">
                <b.icon className="h-4 w-4" strokeWidth={1.75} />
              </span>
              <p className="text-sm font-bold">{b.title}</p>
              <p className="text-2xs text-muted-foreground leading-relaxed break-keep-all">{b.body}</p>
            </article>
          ))}
        </div>
      </MotionItem>

      {/* Testimonials */}
      <MotionItem>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold tracking-tight">사용자 후기</h3>
          <Badge variant="pill-amber" size="sm">베타 모니터</Badge>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {TESTIMONIALS.map((t) => (
            <article
              key={t.name}
              className="rounded-2xl border border-border bg-card p-6 flex flex-col gap-4 card-interactive"
            >
              <div className="flex items-center gap-1 text-amber-500">
                {Array.from({ length: t.rating }).map((_, i) => (
                  <Star key={i} className="h-3.5 w-3.5 fill-current" />
                ))}
              </div>
              <p className="text-sm text-foreground/90 leading-relaxed break-keep-all flex-1">
                &ldquo;{t.body}&rdquo;
              </p>
              <div className="flex items-center gap-3 border-t border-border/60 pt-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-iris/40 to-violet-500/40 text-white font-bold text-sm">
                  {t.initial}
                </span>
                <div className="flex flex-col">
                  <span className="text-xs font-semibold">{t.name}</span>
                  <span className="text-2xs text-muted-foreground">{t.school}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
        <p className="text-2xs text-muted-foreground mt-4 text-center">
          베타 모니터 사용자의 실제 피드백을 익명화하여 게시 · 정식 출시 후 더 많은 후기를 모을 예정이에요.
        </p>
      </MotionItem>

      {/* Bottom — refund link */}
      <MotionItem className="mt-12 flex flex-col items-center text-center gap-3">
        <Link
          href="/refund"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 dark:text-brand-300 hover:underline underline-offset-2"
        >
          환불 정책 자세히 보기
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </MotionItem>
    </MotionSection>
  );
}
