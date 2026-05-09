/**
 * /admissions/[universityId]/[departmentId] — 학과 상세 (Launch Blocker #1)
 *
 * P-001 옵션 B 핵심 무대:
 *   - 모집요강·일정·반영비·응시영역 = 비로그인 무료 노출
 *   - 합격률 분석 카드만 별도 (ProbabilityTab — Gated wrapper)
 *
 * ⚠️ TODO: Firestore 연결 — 현재는 lib/admission/mock-data.ts 의 서울대 의예과만 동작.
 *    클라이언트 가입 후 Firebase Emulator + 시드 → staging 환경에서 검증.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AdmissionDetailHero } from "@/components/admissions/AdmissionDetailHero";
import { TrackDetailCard } from "@/components/admissions/TrackDetailCard";
import { PrevYearResultCard } from "@/components/admissions/PrevYearResultCard";
import { ProbabilityTab } from "@/components/admissions/ProbabilityTab";
import { Card, CardContent } from "@/components/ui/card";
import { getMockDepartmentDetail } from "@/lib/admission/mock-data";
import type { AdmissionTrackKind, AdmissionTrack } from "@/types/admission";

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
  // TODO: Firestore 조회로 교체
  const detail = getMockDepartmentDetail(universityId, departmentId);
  if (!detail) {
    return { title: "학과를 찾을 수 없습니다" };
  }
  const title = `${detail.university.n} ${detail.department.name}`;
  const description = `${title} 모집요강·전형·일정. 비로그인 무료 조회.`;
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
      canonical: `/admissions/${universityId}/${departmentId}`,
    },
  };
}

export default async function DepartmentDetailPage({ params }: PageProps) {
  const { universityId, departmentId } = await params;

  // TODO: 실제 Firestore 조회 (lib/firebase-admin.ts 의 getAdminDb)
  //   const detail = await fetchDepartmentDetail(universityId, departmentId);
  // 현재는 mock 사용 — 클라이언트 가입 후 시드 데이터 환경에서 교체.
  const detail = getMockDepartmentDetail(universityId, departmentId);
  if (!detail) notFound();

  const { university, department, admissions, prevYearResult, sampleSufficient } =
    detail;

  // tracks 평탄화 — 모든 kind 의 트랙을 단일 배열로
  const allTracks: Array<{ kind: AdmissionTrackKind; track: AdmissionTrack }> = [];
  for (const [kind, tracks] of Object.entries(admissions.tracks)) {
    if (tracks) {
      tracks.forEach((track) =>
        allTracks.push({ kind: kind as AdmissionTrackKind, track }),
      );
    }
  }

  return (
    <div className="mx-auto max-w-content-full px-gutter-sm md:px-gutter lg:px-gutter-lg pb-12">
      <AdmissionDetailHero
        university={university}
        department={department}
        availableTracks={admissions.availableTrackKinds}
        year={admissions.year}
      />

      <div className="mt-6 grid gap-6 md:grid-cols-[1fr_280px]">
        {/* 메인 — 모집요강 본체 */}
        <main className="flex flex-col gap-4">
          {/* 합격률 탭 (P-001 핵심) */}
          <section data-section="probability">
            <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
              합격률 분석
            </h2>
            <Suspense fallback={<Card><CardContent className="h-32" /></Card>}>
              <ProbabilityTab
                trackKind={
                  (admissions.availableTrackKinds[0] ?? "jeongsi_na") as AdmissionTrackKind
                }
                sampleSufficient={sampleSufficient}
                lockReason={undefined /* TODO: sample-gate.isLockable 결과 */}
                probability={null /* TODO: /api/match 결과 */}
                hakjong={null}
                isAuthenticated={false /* TODO: auth-context */}
              />
            </Suspense>
          </section>

          {/* 모집요강 — 트랙 단위 카드 */}
          <section data-section="tracks" className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-muted-foreground">
              전형별 모집요강
            </h2>
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
        </main>

        {/* 사이드바 — 입결·일정·공유 */}
        <aside className="flex flex-col gap-4">
          <PrevYearResultCard
            prevYearResult={prevYearResult}
            trackKind={
              (admissions.availableTrackKinds[0] ?? "jeongsi_na") as AdmissionTrackKind
            }
            sampleSufficient={sampleSufficient}
          />

          {/* 공유·비교 추가 (TODO: 인터랙션 컴포넌트) */}
          <Card>
            <CardContent className="flex flex-col gap-2 py-5 text-sm">
              <p className="font-medium">학과 액션</p>
              <p className="text-xs text-muted-foreground">
                비교 추가·관심 학과 저장 기능은 준비 중입니다.
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
