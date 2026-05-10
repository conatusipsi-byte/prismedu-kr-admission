/**
 * POST /api/match — 합격률 분석 (Day 2 실 구현)
 *
 * 처리 단계:
 *   1. 인증 (requireAuth)
 *   2. KrSpecsSchema 입력 검증 (P-013: abroadHighSchool='no'만 허용)
 *   3. 사용자 entitlement → plan 결정 (free / pro / elite)
 *   4. 후보 학과 조회 (filter로 좁힘, 기본 상한 60개)
 *   5. matchKrAdmissions 호출 → 학과별 AdmissionProbability
 *   6. P-001 Free preview 컷 산정 (sample-gate.isLockable)
 *   7. matches/{matchId} 저장
 *   8. 응답 (MatchResponse)
 *
 * ⚠️ 매칭 알고리즘은 휴리스틱이며 staging + 사용자 피드백 후 calibration 필요.
 * Mock 학과 데이터는 scripts/firestore/init-collections.ts (Day 3에서 4개 추가).
 *
 * 회귀 테스트: 라우트 자체는 Firestore 통합 테스트가 필요해 본 PR에선 분리.
 *   matching 알고리즘 회귀는 lib/__tests__/matching-kr.test.ts (32 테스트 통과).
 */

import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { requireAuth, zodErrorResponse } from "@/lib/api-auth";
import { reportRouteError } from "@/lib/sentry-report";
import { KrSpecsSchema, type KrSpecsInput, type MatchResultItem } from "@/lib/schemas/api/match";
import {
  matchKrAdmissions,
  type CandidateProbability,
  type MatchCandidate,
} from "@/lib/matching-kr";
import { isLockable, type Plan } from "@/lib/admission/sample-gate";
import type {
  AdmissionSampleStats,
  AdmissionTrack,
  AdmissionTrackKind,
  Department,
  DepartmentAdmissions,
  University,
  UserEntitlement,
} from "@/types/admission";

/** 무료 사용자가 결제 없이 볼 수 있는 표본 충족 학과 수 */
const FREE_PREVIEW_QUOTA = 20;

/** 후보 학과 상한 (filter 미지정 시) — AI 비용·매칭 시간 보호 */
const DEFAULT_CANDIDATE_LIMIT = 60;
const MAX_CANDIDATE_LIMIT = 200;

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. 인증
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  // 2. 입력 검증
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "유효하지 않은 JSON 본문" }, { status: 400 });
  }
  const parsed = KrSpecsSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const specs = parsed.data;

  try {
    const db = getAdminDb();

    // 3. plan 결정
    const plan = await loadPlan(auth.uid);
    const limit = clampLimit(specs.filter?.limit, plan);

    // 4. 후보 학과 조회
    const candidates = await loadCandidates(specs, limit);
    if (candidates.length === 0) {
      return NextResponse.json(
        {
          error: "조건에 맞는 학과를 찾지 못했습니다. 필터를 조정해주세요.",
          suggestion: "filter.region/category를 비우거나 다른 값으로 시도하세요.",
        },
        { status: 404 },
      );
    }

    // 5. 매칭
    const { results: candidateResults, globalCaveats } = matchKrAdmissions({
      specs,
      candidates,
    });

    // 6. Free preview 컷
    const { items, lockedCount, freePreviewUsed } = applyFreePreview(candidateResults, plan);

    // 7. 저장
    const matchId = `match_${auth.uid}_${Date.now()}`;
    const createdAt = new Date().toISOString();
    const docPayload = {
      id: matchId,
      userId: auth.uid,
      results: items,
      preview: {
        plan,
        freePreviewQuota: plan === "free" ? FREE_PREVIEW_QUOTA : 0,
        freePreviewUsed,
        lockedCount,
      },
      globalCaveats,
      createdAt: FieldValue.serverTimestamp(),
      // 서버 전용 — 클라이언트로 응답하지 않음 (재현·디버그용)
      specsSnapshot: specs,
    };
    await db.collection("matches").doc(matchId).set(docPayload);

    // 8. 응답
    return NextResponse.json({
      matchId,
      createdAt,
      results: items,
      preview: docPayload.preview,
      globalCaveats,
    });
  } catch (e) {
    reportRouteError("api.match", e, { uid: auth.uid });
    return NextResponse.json(
      { error: "분석 처리 중 오류가 발생했습니다" },
      { status: 500 },
    );
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   비즈니스 로직
   ═══════════════════════════════════════════════════════════════════════ */

async function loadPlan(uid: string): Promise<Plan> {
  try {
    const db = getAdminDb();
    // entitlements 문서 ID는 사용자별 단일 — uid로 직접 조회 (subcollection 아닌 root 패턴)
    // 본 프로젝트 컨벤션: users/{uid}/entitlements/current
    const entSnap = await db
      .collection("users")
      .doc(uid)
      .collection("entitlements")
      .doc("current")
      .get();
    if (!entSnap.exists) return "free";
    const ent = entSnap.data() as UserEntitlement;
    return ent.currentPlan ?? "free";
  } catch {
    return "free";
  }
}

function clampLimit(req: number | undefined, plan: Plan): number {
  if (plan === "free") return Math.min(req ?? DEFAULT_CANDIDATE_LIMIT, DEFAULT_CANDIDATE_LIMIT);
  return Math.min(req ?? DEFAULT_CANDIDATE_LIMIT, MAX_CANDIDATE_LIMIT);
}

async function loadCandidates(
  specs: KrSpecsInput,
  limit: number,
): Promise<MatchCandidate[]> {
  const db = getAdminDb();
  const year = new Date().getFullYear() + 1;

  // 학과 후보 — basic.track('humanities'/'natural'/'arts')은 7분류 Department.track과
  // 1:N이라 collectionGroup 단일 where 쿼리로 좁힐 수 없어 전체 조회 후 메모리에서 분기.
  // (성능: 시즌 트래픽 폭증 시 학과별 인덱스 + collectionGroup 복합 쿼리로 보강 필요.)
  const depQuery = db
    .collectionGroup("departments")
    .where("active", "==", true)
    .orderBy("updatedAt", "desc")
    .limit(limit);

  const depsSnap = await depQuery.get();
  if (depsSnap.empty) return [];

  const candidates: MatchCandidate[] = [];

  for (const depDoc of depsSnap.docs) {
    const dep = depDoc.data() as Department;

    // basic.track으로 학과 계열 필터링
    if (!matchesUiTrack(specs.basic.track, dep.track)) continue;

    // 부모 university
    const univRef = depDoc.ref.parent.parent;
    if (!univRef) continue;
    const univSnap = await univRef.get();
    if (!univSnap.exists) continue;
    const univ = univSnap.data() as University;
    if (!univ.active) continue;

    // category·region 필터
    if (specs.filter?.category && univ.category !== specs.filter.category) continue;
    if (
      specs.filter?.region &&
      !univ.campuses.some((c) => c.region === specs.filter!.region)
    ) {
      continue;
    }

    // admissions/{year} — 운영 트랙 목록
    const admissionsSnap = await depDoc.ref
      .collection("admissions")
      .doc(String(year))
      .get();
    if (!admissionsSnap.exists) continue;
    const admissions = admissionsSnap.data() as DepartmentAdmissions;

    // 운영 중인 트랙별로 후보 생성 (P-013: jaeoegukmin 항상 제외 — 분석 폼은 한국 학생용)
    for (const trackKind of admissions.availableTrackKinds) {
      if (trackKind === "jaeoegukmin") continue;
      const trackList = admissions.tracks[trackKind] ?? [];
      for (const track of trackList) {
        const sampleStats = await loadSampleStats(univ.id, dep.id, year, trackKind);
        candidates.push({
          universityId: univ.id,
          universityName: univ.n,
          departmentId: dep.id,
          departmentName: dep.name,
          trackKind,
          trackName: track.name,
          track,
          prevYearResult: admissions.prevYearResult,
          sampleStats,
        });
      }
    }
  }

  return candidates;
}

async function loadSampleStats(
  universityId: string,
  departmentId: string,
  year: number,
  trackKind: AdmissionTrackKind,
): Promise<AdmissionSampleStats | undefined> {
  try {
    const db = getAdminDb();
    const id = `${universityId}_${departmentId}_${year}_${trackKind}`;
    const snap = await db.collection("admissionSampleStats").doc(id).get();
    return snap.exists ? (snap.data() as AdmissionSampleStats) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * UI의 'humanities/natural/arts' 3분류를 Department.track 7분류로 매핑.
 * 선택된 UI track에 따라 매칭 대상 학과 계열을 좁힌다.
 */
function matchesUiTrack(
  uiTrack: KrSpecsInput["basic"]["track"],
  depTrack: AdmissionTrack["kind"] extends never ? never : Department["track"],
): boolean {
  if (uiTrack === "humanities") return depTrack === "humanities" || depTrack === "social" || depTrack === "interdisciplinary";
  if (uiTrack === "natural") return depTrack === "natural" || depTrack === "engineering" || depTrack === "medical";
  if (uiTrack === "arts") return depTrack === "arts";
  return true;
}

/**
 * P-001 Free preview 컷 적용:
 *   - 표본 부족 학과 (insufficient_sample): 항상 lockable=false (정형 정보·안내 노출)
 *   - 표본 충족 학과:
 *       * 유료 사용자: 모두 lockable=false
 *       * 무료 사용자: 상위 FREE_PREVIEW_QUOTA개는 lockable=false, 나머지 lockable=true
 *
 * matchKrAdmissions가 이미 probability desc 정렬 했으므로 그대로 사용.
 */
function applyFreePreview(
  candidateResults: CandidateProbability[],
  plan: Plan,
): { items: MatchResultItem[]; lockedCount: number; freePreviewUsed: number } {
  let usedQuota = 0;
  let lockedCount = 0;
  const items: MatchResultItem[] = [];

  for (const r of candidateResults) {
    const sample = r.probability.sampleSufficient
      ? ({ sufficient: true, acceptedN: r.probability.sampleN, weightedN: r.probability.weightedSampleN } as const)
      : ({ sufficient: false, reason: "below_threshold" as const, acceptedN: r.probability.sampleN, weightedN: r.probability.weightedSampleN } as const);

    const isInPreview =
      plan === "free" && sample.sufficient && usedQuota < FREE_PREVIEW_QUOTA;
    if (isInPreview) usedQuota += 1;

    const lock = isLockable({ plan, isInFreePreview: isInPreview }, sample);
    const lockable = lock.lockable;
    if (lockable) lockedCount += 1;

    items.push({
      universityId: r.candidate.universityId,
      universityName: r.candidate.universityName,
      departmentId: r.candidate.departmentId,
      departmentName: r.candidate.departmentName,
      trackKind: r.candidate.trackKind,
      trackName: r.candidate.trackName,
      category: r.probability.category,
      probability: r.probability.probability,
      low: r.probability.low,
      high: r.probability.high,
      sampleSufficient: r.probability.sampleSufficient,
      sampleN: r.probability.sampleN,
      weightedSampleN: r.probability.weightedSampleN,
      hakjong: r.probability.hakjong,
      lockable,
      caveats: r.caveats,
    });
  }

  return { items, lockedCount, freePreviewUsed: usedQuota };
}
