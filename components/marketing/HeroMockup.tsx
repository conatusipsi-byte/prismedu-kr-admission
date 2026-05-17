"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { GraduationCap, TrendingUp, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * HeroMockup — 히어로 우측/하단의 제품 프리뷰.
 *
 * - 브라우저 크롬 + 더미 분석 리포트 (3개 학과 카드 + Safety/Match/Reach 배지)
 * - perspective rotateX 8deg + bottom glow
 * - framer-motion stagger fade-in
 *
 * 실제 데이터 X — 시각용 더미. 학생 페르소나의 분석 결과를 illustrate.
 */

type CardData = {
  university: string;
  department: string;
  category: "Safety" | "Match" | "Reach";
  prob: number; // 0-100
  highlight?: string;
};

const CARDS: readonly CardData[] = [
  { university: "고려대 서울", department: "컴퓨터학과", category: "Reach", prob: 32, highlight: "수시 학종" },
  { university: "성균관대",   department: "소프트웨어학",  category: "Match",  prob: 64, highlight: "정시 가군" },
  { university: "한국외대",   department: "AI융합학부",    category: "Safety", prob: 87, highlight: "수시 교과" },
];

const CATEGORY_STYLE: Record<CardData["category"], {
  pill: string;
  bar: string;
  dot: string;
}> = {
  Safety: {
    pill: "border-cat-safety/30 bg-cat-safety-soft text-cat-safety-fg",
    bar:  "bg-cat-safety",
    dot:  "bg-cat-safety",
  },
  Match: {
    pill: "border-cat-target/30 bg-cat-target-soft text-cat-target-fg",
    bar:  "bg-cat-target",
    dot:  "bg-cat-target",
  },
  Reach: {
    pill: "border-cat-reach/30 bg-cat-reach-soft text-cat-reach-fg",
    bar:  "bg-cat-reach",
    dot:  "bg-cat-reach",
  },
};

export function HeroMockup({ className }: { className?: string }): React.ReactElement {
  const reduced = useReducedMotion();

  return (
    <div className={cn("relative", className)} aria-hidden>
      {/* Bottom glow */}
      <div className="pointer-events-none absolute -inset-12 -z-10 opacity-70">
        <div className="absolute left-[10%] top-[30%] h-72 w-72 rounded-full bg-brand-400/30 blur-3xl dark:bg-brand-500/20" />
        <div className="absolute right-[5%] top-[10%] h-64 w-64 rounded-full bg-iris/25 blur-3xl" />
      </div>

      <motion.div
        initial={reduced ? false : { opacity: 0, y: 24, rotateX: 12 }}
        animate={{ opacity: 1, y: 0, rotateX: 6 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.35 }}
        style={{
          transformPerspective: 2400,
          transformStyle: "preserve-3d",
        }}
        className="relative"
      >
        {/* Browser chrome */}
        <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-2xl ring-1 ring-black/5 dark:ring-white/10">
          <div className="flex items-center gap-2 border-b border-border bg-ink-50/80 dark:bg-ink-900/60 px-4 py-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-400/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-brand-400/60" />
            <div className="ml-3 flex items-center gap-1.5 rounded-md bg-background/80 px-2.5 py-1 text-2xs text-muted-foreground">
              <span className="font-numeric tabular-nums">conatusipsi.com/analysis</span>
            </div>
          </div>

          {/* Mockup content */}
          <div className="space-y-4 p-5 md:p-6">
            {/* Top label */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold">
                <TrendingUp className="h-4 w-4 text-brand-600" />
                <span>분석 결과 · 3개 학과</span>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-2xs font-semibold text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-300">
                <Sparkles className="h-3 w-3" />
                AI 분석
              </span>
            </div>

            {/* Cards stack */}
            <div className="space-y-2.5">
              {CARDS.map((c, idx) => {
                const style = CATEGORY_STYLE[c.category];
                return (
                  <motion.div
                    key={c.department}
                    initial={reduced ? false : { opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: 0.55 + idx * 0.1 }}
                    className="group rounded-xl border border-border bg-background/60 p-3.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-2xs text-muted-foreground">
                          <GraduationCap className="h-3 w-3" />
                          <span>{c.university}</span>
                          {c.highlight && (
                            <>
                              <span aria-hidden>·</span>
                              <span>{c.highlight}</span>
                            </>
                          )}
                        </div>
                        <h3 className="mt-0.5 text-sm font-semibold">{c.department}</h3>
                      </div>
                      <span
                        className={cn(
                          "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-semibold",
                          style.pill,
                        )}
                      >
                        <span className={cn("h-1.5 w-1.5 rounded-full", style.dot)} />
                        {c.category}
                      </span>
                    </div>
                    {/* Probability bar */}
                    <div className="mt-3 flex items-center gap-2.5">
                      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <motion.div
                          initial={reduced ? false : { width: 0 }}
                          animate={{ width: `${c.prob}%` }}
                          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.85 + idx * 0.1 }}
                          className={cn("absolute inset-y-0 left-0 rounded-full", style.bar)}
                        />
                      </div>
                      <span className="font-numeric tabular-nums text-2xs font-semibold text-muted-foreground">
                        {c.prob}%
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Floating mini badge — bottom right */}
        <motion.div
          initial={reduced ? false : { opacity: 0, scale: 0.6, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 1.1 }}
          className="absolute -right-2 -bottom-3 md:-right-5 md:-bottom-4 rounded-2xl border border-border bg-card px-3 py-2 shadow-lg dark:shadow-black/40"
        >
          <div className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-iris/15 text-iris">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <div className="flex flex-col leading-tight">
              <span className="text-2xs text-muted-foreground">AI 카운슬러</span>
              <span className="text-xs font-semibold">실시간 응답</span>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
