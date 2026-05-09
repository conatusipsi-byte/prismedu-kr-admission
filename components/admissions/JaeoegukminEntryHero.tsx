/**
 * JaeoegukminEntryHero — /admissions/jaeoegukmin 진입점 Hero (P-013)
 *
 * 일반 입시 페이지와 시각적 분리:
 *   - purple 색상 토큰 (TRACK_KIND_COLOR_TOKEN.jaeoegukmin === "purple")
 *   - 별도 안내 배지
 *
 * 회귀 테스트(p-013-jaeoegukmin.test.tsx) 가 본 컴포넌트의 시각 토큰 분리를 강제.
 */

import { Globe2, Info } from "lucide-react";
import { cn } from "@/lib/utils";

export interface JaeoegukminEntryHeroProps {
  className?: string;
}

export function JaeoegukminEntryHero({ className }: JaeoegukminEntryHeroProps) {
  return (
    <header
      data-component="jaeoegukmin-hero"
      data-color-token="purple"
      className={cn(
        "border-b border-purple-200 bg-purple-50/40 dark:border-purple-900/40 dark:bg-purple-950/20",
        "py-8",
        className,
      )}
    >
      <div className="mx-auto max-w-content px-gutter-sm md:px-gutter">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-purple-300 bg-white/80 px-3 py-1 text-xs font-medium text-purple-700 dark:border-purple-800 dark:bg-purple-900/40 dark:text-purple-300">
          <Globe2 aria-hidden className="h-3.5 w-3.5" />
          재외국민·외국인 전용
        </div>
        <h1 className="mb-2 text-2xl font-bold md:text-3xl">
          외국 고교 출신을 위한 입시 자격 진단
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
          한국 대학의 재외국민·외국인·12년 외국교육이수자 전형은 일반 입시와 자격 요건과
          평가 방식이 완전히 다릅니다. 본 자가진단으로 어떤 전형에 해당하는지 확인하고,
          적합한 대학을 추천받으세요.
        </p>

        {/* 정직성 안내 (P-002) */}
        <div className="mt-4 flex items-start gap-2 rounded-md border border-purple-200 bg-white/60 p-3 dark:border-purple-800 dark:bg-purple-950/30">
          <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-purple-600" />
          <p className="text-xs leading-relaxed text-purple-900 dark:text-purple-200">
            본 자가진단은 <strong>1차 분류 가이드</strong>입니다. 정확한 자격은 학교마다
            다르며, 거주 기간 산정 방식·예외 조항이 모집요강에 별도 명시됩니다. 결과를
            "확정 합격 가능"으로 해석하지 마시고 반드시 대학별 모집요강을 확인하세요.
          </p>
        </div>
      </div>
    </header>
  );
}
