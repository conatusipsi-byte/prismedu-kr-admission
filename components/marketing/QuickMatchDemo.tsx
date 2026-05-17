"use client";

/**
 * QuickMatchDemo — 비로그인 학과 매칭 데모 (Try-it-now)
 *
 * audit UP-01: 회원가입 전환의 가장 큰 장벽은 "내 성적으로 뭘 추천해주는지
 * 미리 못 본다"는 점. 1줄 입력으로 미리보기 → 가입 유도.
 *
 * 데이터:
 *   - 정적 데모 (실 매칭 API 호출 X)
 *   - 학년·내신·관심 계열 → 3개 카드 (Reach/Match/Safety) 반환
 *   - 입력값은 localStorage 에 저장 → 가입 후 onboarding 에서 자동 채움 (TODO)
 *
 * 정직성:
 *   - 카드 우상단에 "데모" 배지
 *   - 결과 하단 안내: "정확한 분석은 가입 후 실 데이터로"
 */

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, GraduationCap, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/* ─────────────────────────── 입력 ─────────────────────────── */

const GRADES = [
  { value: "g1", label: "고1" },
  { value: "g2", label: "고2" },
  { value: "g3", label: "고3" },
  { value: "n",  label: "재수" },
] as const;

const NAESHIN_BANDS = [
  { value: "1", label: "1~1.5등급" },
  { value: "2", label: "1.5~2.5등급" },
  { value: "3", label: "2.5~3.5등급" },
  { value: "4", label: "3.5~4.5등급" },
  { value: "5", label: "4.5등급 이하" },
] as const;

const CATEGORIES = [
  { value: "engineering", label: "공학" },
  { value: "natural",     label: "자연" },
  { value: "social",      label: "사회·상경" },
  { value: "humanities",  label: "인문" },
  { value: "art",         label: "예체능" },
  { value: "medical",     label: "의약·간호" },
] as const;

type Category = (typeof CATEGORIES)[number]["value"];

/* ─────────────────────────── 데모 결과 매핑 ─────────────────────────── */

type DemoCard = {
  category: "Safety" | "Match" | "Reach";
  university: string;
  department: string;
  hint: string;
};

const DEMO_BY_CATEGORY: Record<Category, DemoCard[]> = {
  engineering: [
    { category: "Reach",  university: "KAIST",     department: "전산학부",          hint: "정시 가군 · 최저 1.5등급" },
    { category: "Match",  university: "성균관대",   department: "소프트웨어학",       hint: "수시 학종 · 평균 2.3등급" },
    { category: "Safety", university: "한양대 ERICA", department: "ICT융합학부",     hint: "수시 교과 · 평균 3.4등급" },
  ],
  natural: [
    { category: "Reach",  university: "서울대",     department: "수리과학부",         hint: "정시 가군 · 최저 1.6등급" },
    { category: "Match",  university: "고려대 세종", department: "응용수리과학",       hint: "수시 학종 · 평균 2.5등급" },
    { category: "Safety", university: "건국대",     department: "수학과",            hint: "수시 교과 · 평균 3.6등급" },
  ],
  social: [
    { category: "Reach",  university: "연세대",     department: "경영학과",          hint: "수시 학종 · 평균 1.8등급" },
    { category: "Match",  university: "한양대",     department: "정책학과",          hint: "정시 나군 · 최저 2.4등급" },
    { category: "Safety", university: "동국대",     department: "회계학과",          hint: "수시 교과 · 평균 3.3등급" },
  ],
  humanities: [
    { category: "Reach",  university: "서울대",     department: "국어국문학과",       hint: "수시 학종 · 평균 1.8등급" },
    { category: "Match",  university: "성균관대",   department: "사학과",            hint: "수시 학종 · 평균 2.6등급" },
    { category: "Safety", university: "이화여대",   department: "독어독문학과",      hint: "수시 교과 · 평균 3.5등급" },
  ],
  art: [
    { category: "Reach",  university: "한국예술종합학교", department: "음악원",      hint: "실기 100% · 사전실기 필수" },
    { category: "Match",  university: "홍익대",     department: "디자인학부",        hint: "실기 + 수능 · 평균 3등급" },
    { category: "Safety", university: "추계예술대학교", department: "한국화과",     hint: "실기 70% · 평균 4등급" },
  ],
  medical: [
    { category: "Reach",  university: "서울대",     department: "의예과",            hint: "정시 가군 · 최저 1.0등급대" },
    { category: "Match",  university: "고려대",     department: "간호학과",          hint: "수시 학종 · 평균 1.8등급" },
    { category: "Safety", university: "원광대",     department: "약학과",            hint: "수시 교과 · 평균 2.5등급" },
  ],
};

const CATEGORY_STYLE: Record<DemoCard["category"], { pill: string; bar: string }> = {
  Safety: { pill: "border-cat-safety/30 bg-cat-safety-soft text-cat-safety-fg", bar: "bg-cat-safety" },
  Match:  { pill: "border-cat-target/30 bg-cat-target-soft text-cat-target-fg", bar: "bg-cat-target" },
  Reach:  { pill: "border-cat-reach/30 bg-cat-reach-soft text-cat-reach-fg",    bar: "bg-cat-reach" },
};

const STORAGE_KEY = "conatusipsi.quickMatchDemo.v1";

/* ─────────────────────────── 컴포넌트 ─────────────────────────── */

export function QuickMatchDemo(): React.ReactElement {
  const reduced = useReducedMotion();
  const [grade, setGrade] = React.useState<string>("g3");
  const [naeshin, setNaeshin] = React.useState<string>("");
  const [category, setCategory] = React.useState<Category | "">("");
  const [submitted, setSubmitted] = React.useState(false);

  // 진입 시 localStorage 복원
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { grade?: string; naeshin?: string; category?: Category };
        if (parsed.grade) setGrade(parsed.grade);
        if (parsed.naeshin) setNaeshin(parsed.naeshin);
        if (parsed.category) setCategory(parsed.category);
      }
    } catch {
      /* invalid storage — ignore */
    }
  }, []);

  const cards: DemoCard[] = category ? DEMO_BY_CATEGORY[category] : [];
  const valid = grade && naeshin && category;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ grade, naeshin, category }));
    } catch {
      /* storage full / disabled — silent */
    }
    setSubmitted(true);
  }

  return (
    <section className="mx-auto w-full max-w-content-wide px-gutter-sm md:px-gutter lg:px-gutter-lg py-16 lg:py-24">
      <div className="rounded-[2rem] border border-border bg-card/80 backdrop-blur-sm p-6 md:p-10 lg:p-14 shadow-md">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-start">
          {/* Left — input */}
          <div className="flex flex-col gap-5">
            <Badge variant="pill-iris" size="md" className="self-start">
              <Wand2 className="h-3 w-3" />
              미리보기
            </Badge>
            <h2 className="font-display text-2xl md:text-3xl lg:text-4xl font-extrabold tracking-tighter break-keep-all">
              가입 전에 1분만<br/>
              <span className="text-brand-700 dark:text-brand-300">맛보기 추천</span>
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed break-keep-all max-w-md">
              학년·내신·관심 계열만 알려주시면 <strong className="text-foreground">데모 추천 3장</strong>을 즉시 보여드려요. 정확한 분석은 가입 후 실 데이터로.
            </p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2">
              <Field label="학년">
                <ChipGroup
                  options={GRADES}
                  value={grade}
                  onChange={setGrade}
                />
              </Field>

              <Field label="내신 등급">
                <ChipGroup
                  options={NAESHIN_BANDS}
                  value={naeshin}
                  onChange={setNaeshin}
                />
              </Field>

              <Field label="관심 계열">
                <ChipGroup
                  options={CATEGORIES}
                  value={category}
                  onChange={(v) => setCategory(v as Category)}
                />
              </Field>

              <Button
                type="submit"
                size="xl"
                variant="primary"
                disabled={!valid}
                className="self-start shadow-glow-brand mt-2"
              >
                <Sparkles className="h-4 w-4" />
                데모 추천 보기
              </Button>
            </form>
          </div>

          {/* Right — result */}
          <div className="relative">
            <AnimatePresence mode="wait">
              {!submitted ? (
                <motion.div
                  key="placeholder"
                  initial={reduced ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center min-h-[280px] rounded-2xl border border-dashed border-border bg-muted/20 p-8 text-center"
                >
                  <GraduationCap className="h-9 w-9 text-muted-foreground/50 mb-3" strokeWidth={1.5} />
                  <p className="text-sm text-muted-foreground max-w-xs break-keep-all">
                    좌측 입력을 채우시면 추천 카드 3장이 여기에 나타나요.
                  </p>
                </motion.div>
              ) : (
                <motion.div
                  key="result"
                  initial={reduced ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  className="flex flex-col gap-3"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-muted-foreground">데모 추천 · 3개</span>
                    <Badge variant="pill-amber" size="sm">데모</Badge>
                  </div>
                  {cards.map((c, idx) => {
                    const style = CATEGORY_STYLE[c.category];
                    return (
                      <motion.div
                        key={c.department}
                        initial={reduced ? false : { opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: idx * 0.08 }}
                        className="rounded-2xl border border-border bg-background p-4"
                      >
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="min-w-0">
                            <p className="text-2xs text-muted-foreground">{c.university}</p>
                            <h3 className="text-sm font-bold">{c.department}</h3>
                          </div>
                          <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-semibold", style.pill)}>
                            <span className={cn("h-1.5 w-1.5 rounded-full", style.bar)} />
                            {c.category}
                          </span>
                        </div>
                        <p className="text-2xs text-muted-foreground">{c.hint}</p>
                      </motion.div>
                    );
                  })}

                  <div className="mt-4 rounded-2xl bg-gradient-to-br from-brand-50 to-iris/10 dark:from-brand-950/40 dark:to-iris/10 border border-brand-200/60 dark:border-brand-800/40 p-5">
                    <p className="text-sm font-semibold mb-1">정확한 분석은 가입 후 실 데이터로</p>
                    <p className="text-xs text-muted-foreground leading-relaxed mb-3 break-keep-all">
                      위는 데모 데이터예요. 가입 후 실제 내신·수능·생기부 기반으로 1,000여 학과 중 맞춤 추천을 받아보세요.
                    </p>
                    <Button asChild size="lg" variant="primary" className="w-full">
                      <Link href="/signup?returnUrl=/onboarding">
                        무료 가입하고 실 추천 받기
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── helpers ─────────────────────────── */

function Field({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function ChipGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: string;
  onChange: (v: T) => void;
}): React.ReactElement {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            className={cn(
              "inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold transition-all",
              active
                ? "border-brand-500 bg-brand-500 text-white shadow-sm shadow-brand-500/30"
                : "border-border bg-background hover:border-foreground/20 hover:bg-muted",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
