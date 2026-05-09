/**
 * CsatMinimumCard — 수능최저학력기준 카드 (P-004)
 *
 * complexity 별 분기:
 *   - simple_sum / simple_avg → 자동판정 결과 정형 표시 + 충족 시뮬레이션 가능 안내
 *   - with_required / conditional → 원문 + "직접 확인 필요" 배지
 *   - custom → 원문만
 *
 * 본 카드는 정형 정보 — P-001 비로그인 노출 OK.
 */

import { AlertTriangle, CheckCircle2, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { CsatMinimum } from "@/types/admission";

export interface CsatMinimumCardProps {
  csatMinimum: CsatMinimum;
  className?: string;
}

const COMPLEXITY_LABEL: Record<CsatMinimum["complexity"], string> = {
  simple_sum: "합산형",
  simple_avg: "평균형",
  with_required: "특정 영역 포함",
  conditional: "계열별 차등",
  custom: "복합 조건",
};

export function CsatMinimumCard({
  csatMinimum: m,
  className,
}: CsatMinimumCardProps) {
  const isAuto = m.autoEvaluable;

  return (
    <Card
      data-component="csat-minimum-card"
      data-complexity={m.complexity}
      data-auto-evaluable={isAuto}
      className={cn(
        isAuto
          ? "border-mint-200 bg-mint-50/30 dark:border-mint-900/40 dark:bg-mint-950/10"
          : "border-amber-200 bg-amber-50/30 dark:border-amber-900/40 dark:bg-amber-950/10",
        className,
      )}
    >
      <CardContent className="flex flex-col gap-3 py-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">수능최저학력기준</h3>
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="text-xs">
              {COMPLEXITY_LABEL[m.complexity]}
            </Badge>
            {isAuto ? (
              <Badge className="bg-mint-600 text-white text-xs">
                <CheckCircle2 className="mr-1 h-3 w-3" />
                자동 판정
              </Badge>
            ) : (
              <Badge className="bg-amber-600 text-white text-xs">
                <AlertTriangle className="mr-1 h-3 w-3" />
                직접 확인 필요
              </Badge>
            )}
          </div>
        </div>

        {/* 모집요강 원문 — 항상 노출 (자동 판정되더라도 검증 가능하게) */}
        <div className="flex items-start gap-2 rounded-md bg-background/60 p-3">
          <FileText aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <p className="text-xs leading-relaxed text-foreground">
            {m.originalText}
          </p>
        </div>

        {/* 자동 판정 가능 케이스 — 사용자 점수 입력 시 충족 안내 */}
        {isAuto && (
          <p className="text-xs text-muted-foreground">
            수능 점수를 입력하시면 충족 여부를 자동 판정합니다.
          </p>
        )}

        {/* 자동 판정 불가 — 직접 확인 안내 (P-004 정직성) */}
        {!isAuto && (
          <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-400">
            본 학과의 수능최저는 모집요강 본문을 직접 확인해야 합니다. 단순 합산이 아닌
            {m.complexity === "with_required" && " 특정 영역 포함"}
            {m.complexity === "conditional" && " 계열별 차등"}
            {m.complexity === "custom" && " 복합"}{" "}
            조건이라 자동 판정의 정확도가 떨어집니다.
          </p>
        )}

        {/* 추가 룰 (있으면 별도) */}
        {m.additionalRules && (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              추가 조건 보기
            </summary>
            <p className="mt-2 leading-relaxed text-muted-foreground">
              {m.additionalRules}
            </p>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
