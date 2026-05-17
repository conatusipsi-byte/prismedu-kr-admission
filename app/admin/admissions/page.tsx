/**
 * /admin/admissions — 모집요강 관리 (운영자)
 *
 * 사이트맵 §2.5: staging diff + promote 버튼.
 * staging 영역에 자동 파싱된 모집요강을 검수해 production으로 이행시키는 화면.
 *
 * StagingPendingCard 가 GET /api/admin/etl-status?promoted=false 를 호출해
 * 검수 대기 학과 + OCR 의심 학과 카운트를 실데이터로 채움.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Database } from "lucide-react";
import { Card } from "@/components/ui/card";
import { StagingPendingCard } from "./StagingPendingCard";

export const metadata: Metadata = {
  title: "모집요강 관리 — conatusipsi 운영",
  robots: { index: false, follow: false },
};

const STAGES = [
  {
    id: "uploaded",
    label: "업로드됨",
    desc: "PDF가 staging 큐에 들어옴",
    href: "/admin/etl-upload",
  },
  {
    id: "parsed",
    label: "파싱 완료",
    desc: "OCR/구조화 결과 검수 대기",
    href: "/admin/etl-status",
  },
  {
    id: "ready",
    label: "이행 대기",
    desc: "프로덕션 promote 버튼만 누르면 됨",
    href: null,
  },
] as const;

export default function AdminAdmissionsPage(): React.ReactElement {
  return (
    <div className="flex flex-col gap-section-lg">
      <header>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Database className="h-5 w-5 text-brand-600 dark:text-brand-400" />
          모집요강 관리
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground break-keep-all">
          매년 7~9월 시즌마다 모집요강 PDF를 업로드 → 자동 파싱 → 검수 → 프로덕션 이행. 본
          페이지는 ETL 파이프라인 전체 흐름의 컨트롤 패널.
        </p>
      </header>

      <section aria-label="staging 파이프라인 단계">
        <h2 className="text-sm font-semibold text-foreground mb-3">3단계 흐름</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {STAGES.map((s, i) => (
            <Card key={s.id} className="p-card-lg flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-500 text-white text-xs font-bold">
                  {i + 1}
                </span>
                <p className="text-sm font-semibold text-foreground">{s.label}</p>
              </div>
              <p className="text-xs text-muted-foreground break-keep-all leading-relaxed flex-1">
                {s.desc}
              </p>
              {s.href ? (
                <Link
                  href={s.href}
                  className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
                >
                  바로가기
                  <ArrowRight className="h-3 w-3" />
                </Link>
              ) : (
                <p className="text-2xs text-muted-foreground/70 italic">
                  — 본 페이지에서 직접 진행
                </p>
              )}
            </Card>
          ))}
        </div>
      </section>

      <StagingPendingCard />
    </div>
  );
}
