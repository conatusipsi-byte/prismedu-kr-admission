/**
 * ConsultantProfile — /consulting 좌측 컬럼 카드.
 *
 * QA round 2 ④ (2026-05-25): "방준현 대표" 명칭 → "코나투스 입시 컨설턴트" 일괄 변경.
 *   세부 프로필(실명·약력·사진) 은 출시 전 후속 PR 로 확정.
 */

import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const CONSULTANT_NAME = "코나투스 입시 컨설턴트";
const CONSULTANT_TITLE = "1:1 입시 컨설팅 60분";
const CONSULTANT_BIO =
  "한국 대학 입시 전문 컨설턴트. 정시·수시 전 영역 1:1 맞춤 상담.";
const SPECIALTIES = ["정시", "수시", "학종", "자소서", "면접"] as const;

export function ConsultantProfile(): React.ReactElement {
  return (
    <Card className="p-card-lg flex flex-col gap-5">
      <div className="flex items-start gap-4">
        <Avatar className="h-16 w-16 shrink-0">
          <AvatarFallback className="bg-brand-100 text-brand-700 dark:bg-brand-900/60 dark:text-brand-300 text-xl font-semibold">
            코
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-foreground">{CONSULTANT_NAME}</h2>
          <p className="text-sm text-muted-foreground">{CONSULTANT_TITLE}</p>
        </div>
      </div>

      <p className="text-sm text-foreground leading-relaxed break-keep-all">
        {CONSULTANT_BIO}
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
    </Card>
  );
}
