/**
 * /admissions/[universityId]/[departmentId] — 학과 상세 (Stage 7 재설계).
 *
 * Layout:
 *   - 70/30 split (메인 / sticky 사이드)
 *   - Breadcrumb 상단
 *   - section-anchor nav (개요·모집요강·이전 입결)
 *
 * P-001 옵션 B 그대로 유지:
 *   - 모집요강·일정·반영비 = 비로그인 무료
 *   - ProbabilityTab(Gated)에서만 합격률 분석 노출
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronRight, Lock } from "lucide-react";
import { AdmissionDetailHero } from "@/components/admissions/AdmissionDetailHero";
import { TrackDetailCard } from "@/components/admissions/TrackDetailCard";
import { PrevYearResultCard } from "@/components/admissions/PrevYearResultCard";
import { ProbabilityTab } from "@/components/admissions/ProbabilityTab";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchDepartmentDetail } from "@/lib/admission/fetch-detail";
import type { AdmissionTrackKind, AdmissionTrack } from "@/types/admission";

// ISR — 10분 stale-while-revalidate. 503/throttle 완화 + DB 부하 감소.
export const revalidate = 600;

interface PageParams {
  universityId: string;
  departmentId: string;
}

interface PageProps {
  params: Promise<PageParams>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { universityId, departmentId } = await params;
  // metadata 에서는 DB 에러를 silent fallback. 본문 렌더에서 notFound/throw 처리.
  let detail: Awaited<ReturnType<typeof fetchDepartmentDetail>> = null;
  try {
    detail = await fetchDepartmentDetail(universityId, departmentId);
  } catch {
    /* metadata 단계 에러는 무시 — 본문에서 처리. */
  }
  if (!detail) return { title: "학과를 찾을 수 없습니다" };
  const title = `${detail.university.n} ${detail.department.name}`;
  return {
    title: `${title} — conatusipsi`,
    description: `${title} 모집요강·전형·일정. 비로그인 무료 조회.`,
    openGraph: { type: "article", locale: "ko_KR", title, description: `${title} 모집요강·전형·일정` },
    alternates: { canonical: `/admissions/${universityId}/${departmentId}` },
  };
}

export default async function DepartmentDetailPage({ params }: PageProps) {
  const { universityId, departmentId } = await params;
  // throw 는 error.tsx 가 잡음 (Supabase 일시 장애 대응).
  // null 은 notFound() — 진짜로 존재하지 않는 학과.
  const detail = await fetchDepartmentDetail(universityId, departmentId);
  if (!detail) notFound();

  const { university, department, admissions, prevYearResult, sampleSufficient } = detail;

  // tracks 평탄화
  const allTracks: Array<{ kind: AdmissionTrackKind; track: AdmissionTrack }> = [];
  for (const [kind, tracks] of Object.entries(admissions.tracks)) {
    if (tracks) {
      tracks.forEach((track) => allTracks.push({ kind: kind as AdmissionTrackKind, track }));
    }
  }

  const primaryTrackKind = (admissions.availableTrackKinds[0] ?? "jeongsi_na") as AdmissionTrackKind;

  return (
    <div className="relative">
      {/* 배경 mesh */}
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[40vh] overflow-hidden" aria-hidden>
        <div className="absolute -top-10 left-1/3 h-[28rem] w-[60rem] rounded-full bg-gradient-to-b from-brand-200/25 via-iris/10 to-transparent blur-3xl dark:from-brand-700/12" />
      </div>

      <div className="mx-auto max-w-content-full px-gutter-sm md:px-gutter lg:px-gutter-lg py-8 lg:py-12">
        {/* Breadcrumb */}
        <nav aria-label="현재 위치" className="mb-6 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link href="/admissions" className="hover:text-foreground transition-colors">학과 검색</Link>
          <ChevronRight className="h-3 w-3" aria-hidden />
          <span>{university.shortName ?? university.n}</span>
          <ChevronRight className="h-3 w-3" aria-hidden />
          <span className="text-foreground font-medium">{department.name}</span>
        </nav>

        {/* Hero */}
        <AdmissionDetailHero
          university={university}
          department={department}
          availableTracks={admissions.availableTrackKinds}
          year={admissions.year}
        />

        {/* Section anchor nav (section-jump) */}
        <nav
          aria-label="섹션 이동"
          className="mt-6 mb-8 flex flex-wrap items-center gap-1.5 border-b border-border/60 pb-3"
        >
          {[
            { href: "#overview",    label: "개요" },
            { href: "#tracks",      label: "모집요강" },
            { href: "#probability", label: "합격률 분석", icon: <Lock className="h-3 w-3" /> },
            { href: "#prev-result", label: "이전 입결" },
          ].map((s) => (
            <a
              key={s.href}
              href={s.href}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {s.icon}
              {s.label}
            </a>
          ))}
        </nav>

        {/* 70/30 split */}
        <div className="grid gap-6 lg:gap-8 lg:grid-cols-[1fr_320px]">
          {/* 메인 70% */}
          <main className="min-w-0 flex flex-col gap-section-lg">
            {/* 개요 (간단 요약) */}
            <section id="overview" data-section="overview" className="rounded-3xl border border-border bg-card p-6 lg:p-7">
              <div className="flex items-center gap-2 mb-3">
                <Badge variant="pill-ink" size="sm">개요</Badge>
                <span className="text-xs text-muted-foreground font-numeric tabular-nums">
                  {admissions.year}학년도 입시
                </span>
              </div>
              <h2 className="text-lg font-bold mb-2">
                {department.name} 전형 한눈에
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed break-keep-all">
                {university.shortName ?? university.n} {department.name}는 {admissions.availableTrackKinds.length}개 전형을 운영합니다.
                각 전형별 일정·반영비·전년도 입결을 아래에서 비교해보세요.
              </p>
            </section>

            {/* 모집요강 */}
            <section id="tracks" data-section="tracks" className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold tracking-tight">전형별 모집요강</h2>
                <span className="text-2xs text-muted-foreground font-numeric tabular-nums">
                  {allTracks.length}개 전형
                </span>
              </div>
              {allTracks.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {admissions.year}학년도 전형 정보가 아직 등록되지 않았습니다.
                </p>
              ) : (
                allTracks.map(({ track }, i) => (
                  <TrackDetailCard key={`${track.kind}-${i}`} track={track} />
                ))
              )}
            </section>

            {/* 합격률 분석 (Gated) */}
            <section id="probability" data-section="probability" className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold tracking-tight inline-flex items-center gap-2">
                  <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                  합격률 분석
                </h2>
                <Badge variant="pill-iris" size="sm">로그인 필요</Badge>
              </div>
              <Suspense fallback={<Card><CardContent className="h-32" /></Card>}>
                <ProbabilityTab
                  trackKind={primaryTrackKind}
                  sampleSufficient={sampleSufficient}
                  lockReason={undefined}
                  probability={null}
                  hakjong={null}
                  isAuthenticated={false}
                />
              </Suspense>
            </section>

            {/* 이전 입결 — Mobile에서만 메인에 노출 (데스크톱은 사이드바) */}
            <section id="prev-result" data-section="prev-result" className="lg:hidden">
              <h2 className="text-base font-bold tracking-tight mb-3">이전 입결</h2>
              <PrevYearResultCard
                prevYearResult={prevYearResult}
                trackKind={primaryTrackKind}
                sampleSufficient={sampleSufficient}
              />
            </section>
          </main>

          {/* 사이드바 30% — sticky */}
          <aside className="hidden lg:block">
            <div className="sticky top-24 flex flex-col gap-4">
              {/* CTA — 이 학과 분석 시작 */}
              <div className="rounded-3xl border border-brand-200 bg-gradient-to-br from-brand-50 via-brand-50/30 to-iris/10 dark:from-brand-950/50 dark:via-brand-950/20 dark:to-iris/8 dark:border-brand-800/60 p-6">
                <Badge variant="pill-brand" size="sm" className="mb-3">
                  AI 분석
                </Badge>
                <h3 className="text-lg font-bold tracking-tight mb-2 break-keep-all">
                  이 학과 내 합격 가능성
                </h3>
                <p className="text-xs text-muted-foreground mb-5 break-keep-all leading-relaxed">
                  내신·수능·생기부 입력 시 Safety/Match/Reach 분류를 즉시 받아볼 수 있어요.
                </p>
                <Button asChild size="lg" variant="primary" className="w-full shadow-glow-brand">
                  <Link href={`/login?returnUrl=${encodeURIComponent(`/admissions/${universityId}/${departmentId}`)}`}>
                    무료로 분석 시작
                  </Link>
                </Button>
              </div>

              {/* 이전 입결 — 데스크톱 사이드바 */}
              <PrevYearResultCard
                prevYearResult={prevYearResult}
                trackKind={primaryTrackKind}
                sampleSufficient={sampleSufficient}
              />

              {/* 액션 — 비교·즐겨찾기 (placeholder) */}
              <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-5 text-center">
                <p className="text-xs text-muted-foreground break-keep-all leading-relaxed">
                  학과 비교·관심 목록 기능은 준비 중이에요.
                </p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
