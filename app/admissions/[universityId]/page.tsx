/**
 * /admissions/[universityId] — 대학 단독 상세 (Server Component, 비로그인 SEO)
 *
 * 학과 페이지(/admissions/[universityId]/[departmentId])는 이미 존재하지만
 * 대학명만 입력해 들어왔을 때(또는 학과 페이지에서 대학명 클릭 시) 404를 막기
 * 위한 hub 페이지. 그 대학의 학과 카드 그리드 + 캠퍼스·홈페이지·모집요강 링크.
 *
 * P-001 정합성: 정형 정보(캠퍼스·학과 목록·연락처) 비로그인 무료. 합격률 분석은
 * 학과 페이지에서만 노출.
 *
 * ⚠️ TODO: Firestore 조회로 교체 — 현재 mock-data 의 SNU 만 동작.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  Building2,
  ExternalLink,
  GraduationCap,
  MapPin,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AdmissionTrackBadge } from "@/components/admissions/AdmissionTrackBadge";
import { getMockUniversityDetail } from "@/lib/admission/mock-data";
import {
  TRACK_LABELS,
  UNIVERSITY_CATEGORY_LABELS,
} from "@/lib/admission/labels";

interface PageParams {
  universityId: string;
}

interface PageProps {
  params: Promise<PageParams>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { universityId } = await params;
  // TODO: Firestore 조회로 교체
  const detail = getMockUniversityDetail(universityId);
  if (!detail) return { title: "대학을 찾을 수 없습니다" };

  const { university } = detail;
  const title = university.n;
  const description = `${title} 학과별 모집요강·전형·일정. 비로그인 무료 조회.`;
  return {
    title: `${title} — conatusipsi`,
    description,
    openGraph: {
      type: "article",
      locale: "ko_KR",
      title,
      description,
    },
    alternates: {
      canonical: `/admissions/${universityId}`,
    },
  };
}

export default async function UniversityDetailPage({
  params,
}: PageProps): Promise<React.ReactElement> {
  const { universityId } = await params;

  // TODO: Firestore 조회 (lib/firebase-admin.ts 의 getAdminDb)
  const detail = getMockUniversityDetail(universityId);
  if (!detail) notFound();

  const { university, departments } = detail;
  const mainCampus =
    university.campuses.find((c) => c.isMain) ?? university.campuses[0];

  return (
    <div className="mx-auto max-w-content-wide px-gutter-sm md:px-gutter lg:px-gutter-lg pb-12">
      {/* Hero */}
      <header className="border-b py-6 lg:py-8 flex flex-col gap-4">
        {/* breadcrumb-ish */}
        <nav
          aria-label="경로"
          className="text-xs text-muted-foreground flex items-center gap-1"
        >
          <Link href="/admissions" className="hover:text-foreground">
            학과 검색
          </Link>
          <span aria-hidden>›</span>
          <span className="text-foreground font-medium">{university.n}</span>
        </nav>

        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <h1 className="text-3xl lg:text-4xl font-bold text-foreground tracking-tight">
              {university.n}
            </h1>
            {university.nameEn && (
              <p className="text-sm text-muted-foreground">{university.nameEn}</p>
            )}
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="secondary">
                {UNIVERSITY_CATEGORY_LABELS[university.category]}
              </Badge>
              {mainCampus && (
                <Badge variant="outline" className="gap-1">
                  <MapPin className="h-3 w-3" />
                  {mainCampus.name}
                </Badge>
              )}
              <Badge variant="outline" className="gap-1">
                <GraduationCap className="h-3 w-3" />
                {departments.length}개 학과
              </Badge>
            </div>
          </div>

          {/* 외부 링크 */}
          <div className="flex flex-wrap gap-2 shrink-0">
            {university.admissionGuideUrl && (
              <a
                href={university.admissionGuideUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline"
              >
                공식 입학처
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {university.websiteUrl && (
              <a
                href={university.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                대학 홈페이지
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_280px]">
        {/* 학과 목록 */}
        <main>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3">
            학과 목록
          </h2>
          {departments.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border/60 p-card-lg text-sm text-muted-foreground">
              아직 등록된 학과가 없어요. 모집요강 갱신은 매년 7~9월 시즌에
              진행됩니다.
            </p>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {departments.map(({ department, availableTracks, totalQuota }) => (
                <li key={department.id}>
                  <Link
                    href={`/admissions/${university.id}/${department.id}`}
                    className="group block rounded-2xl border border-border/60 bg-card p-card-lg shadow-sm hover:shadow-md hover:border-brand-300 dark:hover:border-brand-700 transition-all h-full"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="text-base font-semibold text-foreground">
                        {department.name}
                      </h3>
                      <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    {department.nameEn && (
                      <p className="text-2xs text-muted-foreground mb-3">
                        {department.nameEn}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      <Badge variant="secondary" className="text-2xs">
                        {TRACK_LABELS[department.track]}
                      </Badge>
                      {department.isProfessional && (
                        <Badge
                          variant="secondary"
                          className="text-2xs bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300"
                        >
                          전문 자격
                        </Badge>
                      )}
                    </div>
                    {availableTracks.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {availableTracks.map((kind) => (
                          <AdmissionTrackBadge key={kind} kind={kind} />
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      모집인원{" "}
                      <span className="font-semibold text-foreground tabular-nums">
                        {totalQuota}명
                      </span>
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </main>

        {/* 사이드바 — 캠퍼스·정직성 안내 */}
        <aside className="flex flex-col gap-4">
          {university.campuses.length > 0 && (
            <Card>
              <CardContent className="py-5 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Building2 className="h-4 w-4 text-brand-600 dark:text-brand-400" />
                  캠퍼스
                </div>
                <ul className="space-y-2.5">
                  {university.campuses.map((c) => (
                    <li key={c.id} className="text-xs">
                      <p className="font-medium text-foreground flex items-center gap-1.5">
                        {c.name}
                        {c.isMain && (
                          <span className="text-2xs text-brand-600 dark:text-brand-400">
                            (본교)
                          </span>
                        )}
                      </p>
                      {c.address && (
                        <p className="text-muted-foreground mt-0.5 break-keep-all">
                          {c.address}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <Card variant="accent">
            <CardContent className="py-5 text-xs text-foreground space-y-1.5">
              <p className="font-semibold">분석은 학과 페이지에서</p>
              <p className="text-muted-foreground break-keep-all leading-relaxed">
                전형별 합격률 분석은 학과 단위로 산출됩니다. 위 카드에서 학과를
                선택해 모집요강·전형·합격률을 확인하세요.
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
