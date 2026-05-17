/**
 * /admin — 운영자 루트 대시보드
 *
 * 사이트맵 §2.5 매핑. AdminShell이 이미 layout에서 master 권한을 검증하므로
 * 본 페이지는 가드 X. KPI 카드 + admin 메뉴 quick links.
 *
 * 본 PR 단계: 정적 KPI placeholder + 링크. 실 KPI 집계는 GET /api/admin/kpi
 * 라우트 본체 PR(별도)에서 wiring.
 */

import type { Metadata } from "next";
import Link from "next/link";
import {
  ActivitySquare,
  CloudUpload,
  Database,
  FileBarChart,
  ShieldAlert,
  ShoppingBag,
  Users,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { AdminKpiCards } from "./AdminKpiCards";

export const metadata: Metadata = {
  title: "운영자 대시보드 — conatusipsi",
  robots: { index: false, follow: false },
};

const QUICK_LINKS = [
  {
    href: "/admin/sanitize-monitor",
    label: "카운슬러 가드",
    desc: "AI 응답 sanitize 발동률 시계열",
    icon: ShieldAlert,
    tone: "rose",
  },
  {
    href: "/admin/etl-upload",
    label: "PDF 업로드",
    desc: "모집요강 PDF → 자동 파싱 큐",
    icon: CloudUpload,
    tone: "indigo",
  },
  {
    href: "/admin/etl-status",
    label: "ETL 검수",
    desc: "파싱 결과 staging diff",
    icon: ActivitySquare,
    tone: "amber",
  },
  {
    href: "/admin/sample-stats",
    label: "표본 집계",
    desc: "학과별 검증 합격사례 수",
    icon: FileBarChart,
    tone: "emerald",
  },
  {
    href: "/admin/admissions",
    label: "모집요강",
    desc: "프로덕션 publish 관리",
    icon: Database,
    tone: "cyan",
  },
  {
    href: "/admin/users",
    label: "사용자",
    desc: "권한·entitlement 부여",
    icon: Users,
    tone: "violet",
  },
  {
    href: "/admin/orders",
    label: "주문",
    desc: "결제·환불 처리",
    icon: ShoppingBag,
    tone: "slate",
  },
] as const;

export default function AdminDashboardPage(): React.ReactElement {
  return (
    <div className="flex flex-col gap-section-lg">
      <header>
        <h1 className="text-2xl font-bold text-foreground">운영자 대시보드</h1>
        <p className="mt-1.5 text-sm text-muted-foreground break-keep-all">
          서비스 운영 현황과 빠른 액션. 시즌 진입(7~9월) 전엔 여기를 매일 확인하세요.
        </p>
      </header>

      <section aria-label="KPI">
        <h2 className="text-sm font-semibold text-foreground mb-3">오늘 KPI</h2>
        <AdminKpiCards />
      </section>

      <section aria-label="빠른 액션">
        <h2 className="text-sm font-semibold text-foreground mb-3">관리 메뉴</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_LINKS.map((q) => {
            const Icon = q.icon;
            return (
              <Link
                key={q.href}
                href={q.href}
                className="group rounded-2xl border border-border/60 bg-card p-card-lg shadow-sm hover:shadow-md hover:border-brand-300 dark:hover:border-brand-700 transition-all flex gap-3 items-start"
              >
                <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-950/60 text-brand-600 dark:text-brand-400 flex items-center justify-center shrink-0">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{q.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 break-keep-all leading-relaxed">
                    {q.desc}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section aria-label="시즌 체크리스트">
        <h2 className="text-sm font-semibold text-foreground mb-3">출시 전 체크</h2>
        <Card className="p-card-lg space-y-2 text-sm">
          <ChecklistItem checked={false} label="사업자등록 + 통신판매업 신고 완료 (footer 정보)" />
          <ChecklistItem checked={false} label="토스페이먼츠 가맹점 가입 + 실키 등록" />
          <ChecklistItem checked={false} label="Anthropic API 키 등록 (AI 카운슬러 동작)" />
          <ChecklistItem checked={false} label="카카오 OAuth 등록 (한국 사용자 표준)" />
          <ChecklistItem checked={false} label="도메인 conatusipsi.com 연결 (Vercel)" />
          <ChecklistItem checked={false} label="실 모집요강 데이터 시드 (mock 5개 → 1,000여 학과)" />
          <ChecklistItem checked={false} label="시즌 트래픽 대비 Firebase Blaze 업그레이드" />
        </Card>
      </section>
    </div>
  );
}

function ChecklistItem({ checked, label }: { checked: boolean; label: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span
        className={
          checked
            ? "mt-0.5 inline-flex h-4 w-4 items-center justify-center rounded border border-brand-500 bg-brand-500 text-white text-[10px] shrink-0"
            : "mt-0.5 inline-flex h-4 w-4 items-center justify-center rounded border border-border bg-background shrink-0"
        }
      >
        {checked && "✓"}
      </span>
      <span className={checked ? "text-muted-foreground line-through" : "text-foreground"}>
        {label}
      </span>
    </div>
  );
}
