"use client";

/**
 * QuickMatchDemo — 비로그인 학과 매칭 데모 (Try-it-now)
 *
 * audit UP-01: 회원가입 전환의 가장 큰 장벽은 "내 성적으로 뭘 추천해주는지
 * 미리 못 본다"는 점. 1줄 입력으로 미리보기 → 가입 유도.
 *
 * 방준현 피드백 #5 (2026-06) — 데모 신뢰도 개편:
 *   - 데모를 "교과전형(susi_subject)" 기준으로만 한정. 교과는 내신 정량 평가라
 *     내신 입력만으로 신뢰도 있는 간이 추천이 가능하다.
 *   - 학생부종합(학종)은 생기부(세특·창체)가 핵심 → 내신만으론 추천 불가.
 *     데모에서 제외하고 "가입 후 생기부 AI 분석(/saengbu-analysis)"으로 전환 유도.
 *   - 학년 구분 제거(내신·교과 추천에 의미 없음). 입력은 내신 등급 + 관심 계열 2개.
 *   - 추천 카드는 사용자 내신과 학과 교과 합격선을 비교해 상향/적정/안정으로
 *     분류 → 입력값이 결과에 실제 반영(정직성).
 *
 * 정직성:
 *   - 카드 우상단 "데모" 배지 + "교과전형 기준 간이 추천" 명시.
 *   - 표시 합격선은 예시(데모) 데이터. 실제 분석은 가입 후 데이터 기반.
 *   - 학종·정시·실기는 데모 비대상임을 명확히 안내.
 */

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, FileText, GraduationCap, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/* ─────────────────────────── 입력 ─────────────────────────── */

const NAESHIN_BANDS = [
  { value: "1", label: "1~1.5등급" },
  { value: "2", label: "1.5~2.5등급" },
  { value: "3", label: "2.5~3.5등급" },
  { value: "4", label: "3.5~4.5등급" },
  { value: "5", label: "4.5등급 이하" },
] as const;

// 교과전형(내신 정량)이 합격 예측에 유효한 학업 계열만. 예체능(실기 중심)은
// 내신만으론 신뢰도 있는 교과 추천이 어려워 데모에서 제외.
const CATEGORIES = [
  { value: "engineering", label: "공학" },
  { value: "natural",     label: "자연" },
  { value: "social",      label: "사회·상경" },
  { value: "humanities",  label: "인문" },
  { value: "medical",     label: "의약·간호" },
] as const;

type Category = (typeof CATEGORIES)[number]["value"];

// 내신 밴드 → 대표 등급(밴드 중앙값). 합격선 비교 기준.
const BAND_CENTER: Record<string, number> = {
  "1": 1.25,
  "2": 2.0,
  "3": 3.0,
  "4": 4.0,
  "5": 4.8,
};

/* ─────────────────────────── 교과전형 데모 데이터 ───────────────────────────
 *
 * 계열별 "교과전형 학과 사다리" — 교과 합격선(평균 등급) 오름차순(상위→하위).
 * cut 은 데모용 예시 합격선이며 실제 합격 확률이 아니다(정직성: 데모 배지 + 면책 문구).
 * 사용자 내신과 cut 을 비교해 상향(Reach)/적정(Match)/안정(Safety)을 동적 분류.
 */

type DemoDept = { university: string; department: string; cut: number };

const LADDER: Record<Category, DemoDept[]> = {
  engineering: [
    { university: "서울대",        department: "컴퓨터공학부",      cut: 1.3 },
    { university: "성균관대",      department: "반도체시스템공학과", cut: 1.8 },
    { university: "건국대",        department: "전기전자공학부",    cut: 2.4 },
    { university: "인하대",        department: "정보통신공학과",    cut: 3.0 },
    { university: "한양대 ERICA",  department: "ICT융합학부",       cut: 3.6 },
  ],
  natural: [
    { university: "서울대",   department: "수리과학부", cut: 1.5 },
    { university: "경희대",   department: "응용수학과", cut: 2.2 },
    { university: "건국대",   department: "수학과",     cut: 2.8 },
    { university: "인하대",   department: "통계학과",   cut: 3.3 },
    { university: "충북대",   department: "물리학과",   cut: 3.9 },
  ],
  social: [
    { university: "연세대",   department: "경영학과",      cut: 1.4 },
    { university: "한양대",   department: "경제금융학부",  cut: 1.9 },
    { university: "중앙대",   department: "경영학부",      cut: 2.5 },
    { university: "동국대",   department: "회계학과",      cut: 3.1 },
    { university: "인천대",   department: "무역학부",      cut: 3.7 },
  ],
  humanities: [
    { university: "서울대",     department: "국어국문학과",   cut: 1.6 },
    { university: "성균관대",   department: "사학과",         cut: 2.3 },
    { university: "이화여대",   department: "독어독문학과",   cut: 2.9 },
    { university: "동국대",     department: "철학과",         cut: 3.4 },
    { university: "강원대",     department: "영어영문학과",   cut: 4.0 },
  ],
  medical: [
    { university: "서울대",   department: "의예과(교과)", cut: 1.0 },
    { university: "경희대",   department: "한의예과",     cut: 1.3 },
    { university: "고려대",   department: "간호학과",     cut: 1.7 },
    { university: "이화여대", department: "약학과",       cut: 2.1 },
    { university: "가천대",   department: "간호학과",     cut: 2.7 },
  ],
};

type DemoCard = {
  category: "Safety" | "Match" | "Reach";
  university: string;
  department: string;
  hint: string;
};

/** 사용자 내신(g) 대비 학과 교과 합격선(cut)으로 상향/적정/안정 분류.
 *  등급은 낮을수록 우수 → cut 이 내 등급보다 충분히 높으면(쉬우면) 안정. */
function classify(cut: number, g: number): DemoCard["category"] {
  const diff = cut - g;
  if (diff >= 0.4) return "Safety";
  if (diff <= -0.4) return "Reach";
  return "Match";
}

/** 내신 밴드 + 계열 → 데모 카드 3장.
 *  사다리에서 내 등급에 가장 가까운 학과를 중심으로 3개 창(window)을 잡고,
 *  각 학과를 실제 합격선 대비로 정직하게 분류. 입력값이 결과에 반영된다. */
function pickCards(category: Category, naeshin: string): DemoCard[] {
  const ladder = LADDER[category];
  const g = BAND_CENTER[naeshin] ?? 3.0;

  let mi = 0;
  ladder.forEach((d, i) => {
    if (Math.abs(d.cut - g) < Math.abs(ladder[mi].cut - g)) mi = i;
  });
  const start = Math.max(0, Math.min(mi - 1, ladder.length - 3));
  const picks = ladder.slice(start, start + 3);

  return picks.map((d) => ({
    category: classify(d.cut, g),
    university: d.university,
    department: d.department,
    hint: `교과전형 · 내신 ${d.cut.toFixed(1)}등급 안팎`,
  }));
}

const CATEGORY_STYLE: Record<DemoCard["category"], { pill: string; bar: string }> = {
  Safety: { pill: "border-cat-safety/30 bg-cat-safety-soft text-cat-safety-fg", bar: "bg-cat-safety" },
  Match:  { pill: "border-cat-target/30 bg-cat-target-soft text-cat-target-fg", bar: "bg-cat-target" },
  Reach:  { pill: "border-cat-reach/30 bg-cat-reach-soft text-cat-reach-fg",    bar: "bg-cat-reach" },
};

const STORAGE_KEY = "conatusipsi.quickMatchDemo.v1";

/* ─────────────────────────── 컴포넌트 ─────────────────────────── */

export function QuickMatchDemo(): React.ReactElement {
  const reduced = useReducedMotion();
  const [naeshin, setNaeshin] = React.useState<string>("");
  const [category, setCategory] = React.useState<Category | "">("");
  const [submitted, setSubmitted] = React.useState(false);

  // 진입 시 localStorage 복원 (구버전의 grade 필드는 무시)
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { naeshin?: string; category?: Category };
        if (parsed.naeshin) setNaeshin(parsed.naeshin);
        if (parsed.category) setCategory(parsed.category);
      }
    } catch {
      /* invalid storage — ignore */
    }
  }, []);

  const valid = Boolean(naeshin && category);
  const cards: DemoCard[] = valid ? pickCards(category as Category, naeshin) : [];

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ naeshin, category }));
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
              교과전형 미리보기
            </Badge>
            <h2 className="font-display text-2xl md:text-3xl lg:text-4xl font-extrabold tracking-tighter break-keep-all">
              내신으로 1분 만에<br/>
              <span className="text-brand-700 dark:text-brand-300">교과전형 맛보기</span>
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed break-keep-all max-w-md">
              내신 등급과 관심 계열만 알려주시면 <strong className="text-foreground">교과전형 기준</strong> 데모 추천 3장을 즉시 보여드려요. 교과는 내신 정량 평가라 내신만으로도 가늠이 가능해요.
            </p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2">
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

              {/* 정직성: 데모 범위 명시 */}
              <p className="text-2xs text-muted-foreground leading-relaxed break-keep-all">
                ※ 맛보기는 <strong className="text-foreground/80">교과전형 기준 간이 추천</strong>입니다. 학생부종합·정시·실기 전형은 가입 후 정식 분석에서 제공돼요.
              </p>
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
                    좌측에 내신·관심 계열을 고르면 교과전형 추천 카드 3장이 여기에 나타나요.
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
                    <span className="text-xs font-semibold text-muted-foreground">교과전형 데모 · {cards.length}개</span>
                    <Badge variant="pill-amber" size="sm">데모</Badge>
                  </div>
                  {cards.map((c, idx) => {
                    const style = CATEGORY_STYLE[c.category];
                    return (
                      <motion.div
                        key={`${c.university}-${c.department}`}
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

                  {/* 학종 → 생기부 AI 전환 유도 (방준현 피드백 #5b) */}
                  <div className="mt-1 rounded-2xl border border-iris-300/50 bg-iris-soft/50 dark:border-iris/30 dark:bg-iris/10 p-4">
                    <div className="flex items-start gap-2.5">
                      <FileText className="h-4 w-4 mt-0.5 shrink-0 text-iris-600 dark:text-iris-300" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold mb-0.5">학생부종합전형이 궁금하세요?</p>
                        <p className="text-2xs text-muted-foreground leading-relaxed break-keep-all mb-2">
                          학종은 생기부(세특·창의적 체험활동)가 핵심이라 내신만으론 추천이 어려워요. 가입 후 <strong className="text-foreground">생기부 AI 분석</strong>으로 학종 적합도를 확인하세요.
                        </p>
                        <Link
                          href="/signup?returnUrl=/saengbu-analysis"
                          className="inline-flex items-center gap-1 text-2xs font-semibold text-iris-700 dark:text-iris-300 hover:underline"
                        >
                          생기부 AI 분석 알아보기
                          <ArrowRight className="h-3 w-3" />
                        </Link>
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 rounded-2xl bg-gradient-to-br from-brand-50 to-iris/10 dark:from-brand-950/40 dark:to-iris/10 border border-brand-200/60 dark:border-brand-800/40 p-5">
                    <p className="text-sm font-semibold mb-1">정확한 분석은 가입 후 실 데이터로</p>
                    <p className="text-xs text-muted-foreground leading-relaxed mb-3 break-keep-all">
                      위는 교과전형 기준 데모(예시)예요. 가입 후 실제 내신·수능·생기부 기반으로 1,000여 학과 중 맞춤 추천을 받아보세요.
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
