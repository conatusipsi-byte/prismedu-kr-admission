import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "변경 사항",
  description: "conatusipsi 제품 업데이트 히스토리.",
};

type Entry = {
  date: string;
  version?: string;
  category: "기능" | "개선" | "수정" | "데이터";
  title: string;
  detail?: string;
};

// 추후 CMS/MDX로 교체. 현재는 인라인 데이터.
const ENTRIES: readonly Entry[] = [
  {
    date: "2026-05-17",
    category: "기능",
    title: "변경 사항 페이지 신설",
    detail: "Linear/Vercel 스타일 changelog. 제품 업데이트 히스토리를 한곳에서 확인.",
  },
  {
    date: "2026-05-17",
    category: "개선",
    title: "전체 디자인 시스템 재구축",
    detail: "Pretendard Variable + Inter 폰트, brand emerald 팔레트, 다크모드 토글, framer-motion 도입.",
  },
  {
    date: "2026-05-14",
    category: "개선",
    title: "Firebase → Supabase 마이그레이션 완료",
    detail: "인증·데이터·스토리지를 Supabase로 통합. RLS 정책 기반 보안 강화.",
  },
] as const;

const CATEGORY_PILL: Record<Entry["category"], "pill-brand" | "pill-iris" | "pill-amber" | "pill-violet"> = {
  기능: "pill-brand",
  개선: "pill-iris",
  수정: "pill-amber",
  데이터: "pill-violet",
};

export default function ChangelogPage(): React.ReactElement {
  return (
    <div className="mx-auto max-w-content-narrow px-gutter-sm md:px-gutter lg:px-gutter-lg py-12 md:py-20">
      <header className="mb-12 flex flex-col gap-3">
        <Badge variant="pill-brand" size="md" className="self-start">변경 사항</Badge>
        <h1 className="font-display text-4xl md:text-5xl font-extrabold tracking-tighter">
          제품 업데이트 히스토리
        </h1>
        <p className="text-base text-muted-foreground">
          conatusipsi 가 어떻게 좋아지고 있는지 — 기능, 개선, 데이터 갱신을 시간순으로 정리합니다.
        </p>
      </header>

      <ol className="flex flex-col gap-8">
        {ENTRIES.map((e, idx) => (
          <li key={`${e.date}-${idx}`} className="relative flex flex-col gap-2 border-l-2 border-border pl-6">
            <span className="absolute left-[-7px] top-1.5 h-3 w-3 rounded-full bg-brand-500 ring-4 ring-background" />
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground font-numeric tabular-nums">
              <time dateTime={e.date}>{e.date}</time>
              <Badge variant={CATEGORY_PILL[e.category]} size="sm">{e.category}</Badge>
            </div>
            <h2 className="text-lg font-semibold text-foreground">{e.title}</h2>
            {e.detail && (
              <p className="text-sm leading-relaxed text-muted-foreground">{e.detail}</p>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
