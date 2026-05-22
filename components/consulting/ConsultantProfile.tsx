/**
 * ConsultantProfile — /consulting 좌측 컬럼 카드.
 *
 * ⚠️ 본 PR(Day 2 of consulting 계약) 단계는 placeholder 컨텐츠.
 *   - 이름·직함·소개·전문 분야 모두 클라이언트(방준현 대표)에게 실제 카피 받기 전 임시값.
 *   - Day 7 시각 검수 시 실제 프로필 사진 + 카피로 교체 예정.
 *
 * 정직성 (P-002): "임시 소개" 배지로 placeholder 임을 명시. 사용자가 "실제 컨설턴트 정보" 라고
 *   오해하지 않도록 시각 표시 유지.
 */

import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Info } from "lucide-react";

const PLACEHOLDER_NAME = "방준현";
const PLACEHOLDER_TITLE = "코나투스 대표 컨설턴트";
const PLACEHOLDER_BIO =
  "한국 대학 입시 전문 컨설턴트. 정시·수시 전 영역 1:1 맞춤 상담.";
const SPECIALTIES = ["정시", "수시", "학종", "자소서", "면접"] as const;

export function ConsultantProfile(): React.ReactElement {
  return (
    <Card className="p-card-lg flex flex-col gap-5">
      <div className="flex items-start gap-4">
        <Avatar className="h-16 w-16 shrink-0">
          <AvatarFallback className="bg-brand-100 text-brand-700 dark:bg-brand-900/60 dark:text-brand-300 text-xl font-semibold">
            {PLACEHOLDER_NAME.charAt(0)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-foreground">{PLACEHOLDER_NAME}</h2>
          <p className="text-sm text-muted-foreground">{PLACEHOLDER_TITLE}</p>
        </div>
      </div>

      <p className="text-sm text-foreground leading-relaxed break-keep-all">
        {PLACEHOLDER_BIO}
      </p>

      <div className="flex flex-wrap gap-1.5">
        {SPECIALTIES.map((s) => (
          <span
            key={s}
            className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-2xs font-medium text-foreground"
          >
            {s}
          </span>
        ))}
      </div>

      <div
        role="note"
        className="flex items-start gap-2 rounded-lg border border-amber-300/60 dark:border-amber-800/50 bg-amber-50/70 dark:bg-amber-950/30 px-3 py-2 text-2xs text-amber-800 dark:text-amber-200"
      >
        <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
        <span className="break-keep-all leading-relaxed">
          임시 소개 — 컨설턴트 실제 프로필은 출시 전 갱신됩니다.
        </span>
      </div>
    </Card>
  );
}
