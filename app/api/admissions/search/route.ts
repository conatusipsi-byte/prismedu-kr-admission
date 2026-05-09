/**
 * GET /api/admissions/search — 학과 검색 (공개)
 *
 * P-001: 비로그인 접근 가능. 응답에 합격률·확률 미포함 (정형 정보만).
 * P-013: jaeoegukmin 트랙은 명시적 trackKind 필터일 때만 노출.
 *
 * ⚠️ 실제 동작 검증은 다음 후속 작업 필요:
 *   1. scripts/firestore/init-collections.ts 로 시드 데이터 생성
 *   2. firestore.indexes.json 의 collectionGroup 인덱스 deploy
 *   3. 통합 테스트 (Firebase Emulator 또는 staging 프로젝트)
 *
 * 본 환경(자격증명·인덱스 미설정)에서는 typecheck 통과까지만 보장.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import {
  AdmissionsSearchQuerySchema,
  type AdmissionsSearchQuery,
} from "@/lib/schemas/api/admissions";
import { matchesSearchQuery } from "@/lib/admission/labels";
import { checkSampleSufficiency } from "@/lib/admission/sample-gate";
import { zodErrorResponse } from "@/lib/api-auth";
import type {
  AdmissionTrackKind,
  Department,
  University,
  AdmissionSampleStats,
  DepartmentAdmissions,
} from "@/types/admission";

interface SearchResultItem {
  department: Department;
  university: University;
  sampleSufficient: boolean;
  availableTracks: AdmissionTrackKind[];
}

interface SearchResponse {
  results: SearchResultItem[];
  nextCursor?: string;
  totalEstimate?: number;
}

const CACHE_HEADERS_PUBLIC = {
  // 공개 검색은 10분 ISR + edge cache. 검색어 없는 기본 쿼리는 더 길게 (1시간).
  // 검색어가 다양하면 캐시 키 분산 — Vercel 자동 처리.
  "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800",
};

const CACHE_HEADERS_DEFAULT = {
  "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
};

/* ═══════════════════════════════════════════════════════════════════════
   GET handler
   ═══════════════════════════════════════════════════════════════════════ */

export async function GET(req: NextRequest): Promise<NextResponse> {
  // 1. 입력 검증
  const params: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => {
    params[k] = v;
  });
  const parsed = AdmissionsSearchQuerySchema.safeParse(params);
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const query = parsed.data;

  // 2. P-013 — 일반 검색에서는 jaeoegukmin 미혼입 (명시 필터 시에만 노출)
  const allowJaeoegukmin = query.trackKind === "jaeoegukmin";

  try {
    const result = await searchDepartments(query, allowJaeoegukmin);
    const cacheHeaders =
      query.q || query.region || query.trackKind || query.category
        ? CACHE_HEADERS_PUBLIC
        : CACHE_HEADERS_DEFAULT;
    return NextResponse.json(result, { headers: cacheHeaders });
  } catch (e) {
    console.error("[/api/admissions/search] error:", e);
    return NextResponse.json(
      { error: "검색 중 오류가 발생했습니다" },
      { status: 500 },
    );
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   비즈니스 로직
   ═══════════════════════════════════════════════════════════════════════ */

async function searchDepartments(
  query: AdmissionsSearchQuery,
  allowJaeoegukmin: boolean,
): Promise<SearchResponse> {
  const db = getAdminDb();

  // 1. departments collectionGroup 쿼리 (active=true 만)
  let depQuery = db
    .collectionGroup("departments")
    .where("active", "==", true)
    .orderBy("updatedAt", "desc")
    .limit(query.limit);

  if (query.track) {
    depQuery = depQuery.where("track", "==", query.track);
  }

  if (query.cursor) {
    // cursor 는 마지막 도큐먼트 path 인코딩. 단순 구현 — 실 운영에선
    // startAfter(snapshot) 패턴 사용 권장.
    const cursorDoc = await db.doc(query.cursor).get();
    if (cursorDoc.exists) {
      depQuery = depQuery.startAfter(cursorDoc);
    }
  }

  const depsSnap = await depQuery.get();
  if (depsSnap.empty) return { results: [] };

  // 2. 각 학과의 부모 university + 해당 연도 admissions + sampleStats 조회.
  //    실 운영에서는 N+1 쿼리 회피를 위해 batch get 또는 캐시 활용.
  const year = new Date().getFullYear() + 1; // 학년도 = 다음 입학연도
  const items: SearchResultItem[] = [];

  for (const depDoc of depsSnap.docs) {
    const dep = depDoc.data() as Department;

    // 부모 university
    const univRef = depDoc.ref.parent.parent; // departments → university
    if (!univRef) continue;
    const univSnap = await univRef.get();
    if (!univSnap.exists) continue;
    const univ = univSnap.data() as University;
    if (!univ.active) continue;

    // 카테고리 필터 (UniversityCategory 또는 region)
    if (query.category && univ.category !== query.category) continue;

    // 검색어 매칭 (한글 초성 + 부분 문자열)
    if (query.q) {
      const targetText = `${univ.n} ${univ.shortName ?? ""} ${dep.name}`;
      if (!matchesSearchQuery(targetText, query.q)) continue;
    }

    // admissions/{year} 의 availableTrackKinds + sampleStats 일괄 조회
    const admissionsSnap = await depDoc.ref
      .collection("admissions")
      .doc(String(year))
      .get();
    const admissions = admissionsSnap.exists
      ? (admissionsSnap.data() as DepartmentAdmissions)
      : null;

    let availableTracks: AdmissionTrackKind[] = admissions?.availableTrackKinds ?? [];

    // P-013: jaeoegukmin 은 allowJaeoegukmin=true 일 때만 응답에 포함
    if (!allowJaeoegukmin) {
      availableTracks = availableTracks.filter((k) => k !== "jaeoegukmin");
    }

    // trackKind 필터 — 해당 트랙 운영 학과만
    if (query.trackKind && !availableTracks.includes(query.trackKind)) continue;

    // 표본 충족 — sample-gate 가 학과의 대표 트랙(jeongsi_na 등) 1개 기준 판정.
    // 실 운영에서는 학과별 모든 트랙을 OR 평가하거나 사용자 의향 트랙 1개 기준.
    const primaryTrack: AdmissionTrackKind | undefined = availableTracks[0];
    let sampleSufficient = false;
    if (primaryTrack) {
      const statsId = `${univ.id}_${dep.id}_${year}_${primaryTrack}`;
      const statsSnap = await db.collection("admissionSampleStats").doc(statsId).get();
      const stats = statsSnap.exists ? (statsSnap.data() as AdmissionSampleStats) : undefined;
      sampleSufficient = checkSampleSufficiency(stats).sufficient;
    }

    items.push({
      department: dep,
      university: univ,
      sampleSufficient,
      availableTracks,
    });
  }

  // 3. cursor — 마지막 도큐먼트 path
  const lastDoc = depsSnap.docs[depsSnap.docs.length - 1];
  const nextCursor =
    depsSnap.size === query.limit ? lastDoc.ref.path : undefined;

  return {
    results: items,
    nextCursor,
    totalEstimate: items.length,
  };
}
