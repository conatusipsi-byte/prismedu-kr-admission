/**
 * /admin/admissions — 모집요강 관리 (운영자)
 *
 * 사이트맵 §2.5: staging diff + promote 버튼.
 * staging 영역에 자동 파싱된 모집요강을 검수해 production으로 이행시키는 화면.
 *
 * 본 PR 단계: 페이지 골격 + 안내. 실 staging diff fetcher는 GET /api/admin/etl/staging
 * 라우트 본체 PR 후 wiring (현재 stub).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Database, FileWarning, GitMerge } from "lucide-react";
import { Card } from "@/components/ui/card";

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
          <Database className="h-5 w-5 text-mint-600 dark:text-mint-400" />
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
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-mint-500 text-white text-xs font-bold">
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
                  className="text-xs font-medium text-mint-600 dark:text-mint-400 hover:underline inline-flex items-center gap-1"
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

      <section aria-label="이행 대기 학과">
        <h2 className="text-sm font-semibold text-foreground mb-3">이행 대기 (Staging → Production)</h2>
        <Card className="p-card-lg">
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
              <GitMerge className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">현재 이행 대기 학과 0건</p>
              <p className="text-xs text-muted-foreground break-keep-all max-w-md">
                PDF를 업로드하면 자동 파싱 후 staging에 도착합니다. 이행 대기 학과가
                생기면 여기에 staging↔production diff와 promote 버튼이 노출돼요.
              </p>
            </div>
            <p className="text-2xs text-muted-foreground/70">
              ⚠️ GET /api/admin/etl/staging 본체 PR 후 실데이터로 자동 채워짐
            </p>
          </div>
        </Card>
      </section>

      <section aria-label="OCR 의심 학과">
        <h2 className="text-sm font-semibold text-foreground mb-3">OCR 의심 학과 (수동 재검수 필요)</h2>
        <Card className="p-card-lg">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 flex items-center justify-center shrink-0">
              <FileWarning className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">의심 학과 0건</p>
              <p className="text-xs text-muted-foreground mt-1 break-keep-all leading-relaxed">
                인코딩 자동 판정(utf8 / adobe_korea1 / ocr) 결과 OCR 분류된 학과는 수동
                검수 후 promote 권장. 시즌 진입 전 0건 유지가 목표.
              </p>
              <Link
                href="/admin/etl-status"
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-mint-600 dark:text-mint-400 hover:underline"
              >
                ETL 상세 보기
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}
