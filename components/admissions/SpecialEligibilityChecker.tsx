"use client";

/**
 * SpecialEligibilityChecker — 특별전형(농어촌·기회균형·특성화) 자격 자기신고 + 학과 매칭.
 *
 * 정직성 (P-002, P-005):
 *   - 자기신고 ≠ 확정: 실제 자격은 대학 서류심사 — 명시.
 *   - 민감정보(거주지·소득) 최소 수집: 자격 "여부" 체크만(상세 주소·소득액 X), localStorage.
 *   - 특별전형 대부분 정원외(그룹/대학 단위) → 학과별 합격률 미산출. "지원자격 충족이 핵심" 유지.
 *   - 정확한 자격 요건은 대학·전형마다 상이 → 모집요강·입학처 확인 안내.
 *
 * 데이터: 학과 상세가 보유한 특별전형 트랙(specialType)을 props 로 받아, 자기신고 자격과 매칭.
 * 서버 호출 없음(순수 클라이언트 + localStorage). 수능최저 패턴([[CsatMinChecker]]) 일관.
 */

import * as React from "react";
import { Check, Info, FileText, ShieldQuestion } from "lucide-react";
import { cn } from "@/lib/utils";
import { TRACK_KIND_LABELS } from "@/lib/admission/labels";
import type { AdmissionTrackKind } from "@/types/admission";

/** 자기신고 가능한 특별전형 자격 (specialType 와 매핑). overseas=재외국민은 별도 경로라 제외. */
type EligType = "agricultural" | "low_income" | "etc";

const ELIG_META: { key: EligType; label: string; desc: string }[] = [
  { key: "agricultural", label: "농어촌학생", desc: "읍·면 지역 거주 또는 농어촌 소재 학교 졸업(예정)" },
  { key: "low_income", label: "기회균형·저소득", desc: "기초생활수급·차상위·한부모가족 등 (대학별 상이)" },
  { key: "etc", label: "특성화고 등", desc: "특성화고 졸업(동일계열) 등 특별전형 (대학별 상이)" },
];

const SPECIAL_LABEL: Record<string, string> = {
  agricultural: "농어촌",
  low_income: "기회균형·저소득",
  etc: "특성화·기타",
};

const STORAGE_KEY = "conatus.specialEligibility.v1";

type EligState = Record<EligType, boolean>;
const EMPTY: EligState = { agricultural: false, low_income: false, etc: false };

export interface SpecialTrackInfo {
  /** specialType — agricultural | low_income | etc (general/overseas 는 제외해서 전달) */
  specialType: EligType;
  kind: AdmissionTrackKind;
  name: string;
  quotaInitial: number;
}

export function SpecialEligibilityChecker({
  specialTracks,
}: {
  specialTracks: SpecialTrackInfo[];
}): React.ReactElement {
  const [elig, setElig] = React.useState<EligState>(EMPTY);

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setElig({ ...EMPTY, ...(JSON.parse(raw) as Partial<EligState>) });
    } catch { /* ignore */ }
  }, []);

  const toggle = (key: EligType) => {
    setElig((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const anyDeclared = ELIG_META.some((m) => elig[m.key]);
  // 학과가 보유한 특별전형 specialType 집합
  const deptTypes = new Set(specialTracks.map((t) => t.specialType));

  return (
    <section
      id="special-eligibility"
      data-section="special-eligibility"
      data-component="special-eligibility-checker"
      className="rounded-3xl border border-border bg-card p-6 lg:p-7"
    >
      <div className="mb-1 flex items-center gap-2">
        <h2 className="text-base font-bold tracking-tight">특별전형 자격 체크</h2>
        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-2xs font-semibold text-indigo-700 ring-1 ring-indigo-200/70 dark:bg-indigo-950/40 dark:text-indigo-300 dark:ring-indigo-800/50">
          자기신고
        </span>
      </div>
      <p className="mb-4 text-xs text-muted-foreground break-keep-all leading-relaxed">
        내 자격을 선택하면 이 학과의 특별전형 중 지원 가능한 전형을 안내해요.
        <strong className="text-foreground"> 자기신고이며 실제 자격은 대학 서류심사로 확정</strong>됩니다.
      </p>

      {/* 자격 체크 (여부만, 상세 개인정보 X) */}
      <div className="mb-4 flex flex-col gap-2">
        {ELIG_META.map((m) => {
          const on = elig[m.key];
          const deptHas = deptTypes.has(m.key);
          return (
            <button
              key={m.key}
              type="button"
              role="checkbox"
              aria-checked={on}
              data-elig={m.key}
              data-selected={on}
              onClick={() => toggle(m.key)}
              className={cn(
                "flex items-start gap-3 rounded-2xl border p-3 text-left transition-colors",
                on
                  ? "border-brand-400 bg-brand-50/50 dark:border-brand-700 dark:bg-brand-950/30"
                  : "border-border bg-background hover:bg-muted/50",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                  on ? "border-brand-500 bg-brand-500 text-white" : "border-muted-foreground/40",
                )}
                aria-hidden
              >
                {on && <Check className="h-3 w-3" />}
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  {m.label}
                  {deptHas && (
                    <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-2xs font-semibold text-emerald-700 ring-1 ring-emerald-200/70 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800/50">
                      이 학과 운영
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-2xs text-muted-foreground break-keep-all">{m.desc}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* 매칭 결과 */}
      {specialTracks.length === 0 ? (
        <p className="flex items-start gap-1.5 rounded-2xl border border-border bg-background p-3 text-2xs text-muted-foreground break-keep-all leading-relaxed">
          <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          이 학과는 등록된 특별전형(농어촌·기회균형·특성화) 정보가 없어요. 정원외 전형 운영 여부는 모집요강에서 확인하세요.
        </p>
      ) : anyDeclared ? (
        <ul className="flex flex-col gap-2" data-element="elig-matches">
          {ELIG_META.filter((m) => elig[m.key]).map((m) => {
            const matched = specialTracks.filter((t) => t.specialType === m.key);
            return matched.length > 0 ? (
              matched.map((t, i) => (
                <li
                  key={`${m.key}-${i}`}
                  className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-3 dark:border-emerald-900/40 dark:bg-emerald-950/15"
                >
                  <div className="flex items-center gap-1.5">
                    <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                    <span className="text-sm font-semibold">
                      {SPECIAL_LABEL[m.key]} 전형 지원 가능 (자기신고)
                    </span>
                  </div>
                  <p className="mt-1 text-2xs text-muted-foreground break-keep-all">
                    {TRACK_KIND_LABELS[t.kind]} · {t.name} · 모집 {t.quotaInitial}명
                    <span className="ml-1 text-indigo-700 dark:text-indigo-300">· 대부분 정원외(학과별 합격률 미산출)</span>
                  </p>
                </li>
              ))
            ) : (
              <li
                key={m.key}
                className="rounded-2xl border border-border bg-background p-3 text-2xs text-muted-foreground break-keep-all"
              >
                이 학과엔 <strong className="text-foreground">{SPECIAL_LABEL[m.key]}</strong> 특별전형이 없어요.
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="flex items-start gap-1.5 rounded-2xl border border-border bg-background p-3 text-2xs text-muted-foreground break-keep-all leading-relaxed">
          <ShieldQuestion className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          위에서 내 자격을 선택하면 이 학과에서 지원 가능한 특별전형을 표시합니다.
          {" "}이 학과 운영: {[...deptTypes].map((t) => SPECIAL_LABEL[t]).join(" · ")}
        </p>
      )}

      {/* 정직성 안내 */}
      <div className="mt-4 flex flex-col gap-1.5 border-t border-border/60 pt-3">
        <p className="flex items-start gap-1.5 text-2xs text-muted-foreground break-keep-all leading-relaxed">
          <FileText className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          <span>
            <strong className="text-foreground/80">자기신고 ≠ 합격·자격 확정</strong> — 실제 자격은 대학 서류심사로 결정돼요.
            자격 요건은 대학·전형마다 다르니 <strong className="text-foreground/80">모집요강·입학처</strong>에서 꼭 확인하세요.
          </span>
        </p>
        <p className="flex items-start gap-1.5 text-2xs text-muted-foreground break-keep-all leading-relaxed">
          <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          특별전형은 대부분 <strong className="text-foreground/80">정원외(그룹·대학 단위)</strong>라 학과별 합격률을 산출하지 않아요.
          지원자격 충족 여부가 핵심입니다.
        </p>
      </div>
    </section>
  );
}
