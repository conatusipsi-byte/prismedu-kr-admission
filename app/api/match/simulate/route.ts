/**
 * POST /api/match/simulate — what-if 시뮬레이터 (Pro 전용)
 *
 * baseSpecId(이전 matchId)의 specsSnapshot을 로드 → override 적용 → matchKrAdmissions
 * 재호출 → 결과 반환. matches/* 에 저장 X (ephemeral — 시뮬레이션은 일회용).
 *
 * 정합성:
 *   - /api/match 의 loadCandidates·loadSampleStats·matchesUiTrack 로직과 동일
 *     (코드 중복 — 추후 lib/match/helpers.ts 로 추출 권장)
 *   - Pro 전용은 클라(/what-if)의 ProGate에서 1차 차단, 본 라우트도 plan 검사
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, zodErrorResponse } from "@/lib/api-auth";
import { getAdminDb } from "@/lib/firebase-admin";
import {
  KrSpecsSchema,
  MatchSimulateSchema,
  type KrSpecsInput,
} from "@/lib/schemas/api/match";
import {
  matchKrAdmissions,
  type MatchCandidate,
} from "@/lib/matching-kr";
import type {
  AdmissionSampleStats,
  AdmissionTrackKind,
  Department,
  DepartmentAdmissions,
  University,
  UserEntitlement,
} from "@/types/admission";

const DEFAULT_CANDIDATE_LIMIT = 60;

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
  const parsed = MatchSimulateSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const { baseSpecId, override } = parsed.data;

  try {
    const db = getAdminDb();

    // 3. plan 검사 — Pro/Elite 전용
    const plan = await loadPlan(auth.uid);
    if (plan === "free") {
      return NextResponse.json(
        {
          error: "What-if 시뮬레이터는 Pro 전용 기능입니다.",
          upgradeUrl: "/pricing",
        },
        { status: 403 },
      );
    }

    // 4. 기준 spec 로드 — matches/{baseSpecId} 의 specsSnapshot
    const matchSnap = await db.collection("matches").doc(baseSpecId).get();
    if (!matchSnap.exists) {
      return NextResponse.json(
        { error: "기준 분석 결과를 찾을 수 없습니다." },
        { status: 404 },
      );
    }
    const matchData = matchSnap.data() as {
      userId: string;
      specsSnapshot?: KrSpecsInput;
    };
    if (matchData.userId !== auth.uid) {
      // 본인 외 — 401/403 대신 404로 노출 (열거 차단)
      return NextResponse.json(
        { error: "기준 분석 결과를 찾을 수 없습니다." },
        { status: 404 },
      );
    }
    if (!matchData.specsSnapshot) {
      return NextResponse.json(
        { error: "기준 분석에 사용된 spec 데이터가 없습니다. 새 분석을 먼저 진행해주세요." },
        { status: 400 },
      );
    }

    // 5. override 적용
    const simulatedSpecs = applyOverride(matchData.specsSnapshot, override);

    // 5b. KrSpecs 재검증 (override 적용 후도 schema 통과해야 매칭 가능)
    const validated = KrSpecsSchema.safeParse(simulatedSpecs);
    if (!validated.success) {
      return NextResponse.json(
        { error: "override 적용 후 spec이 유효하지 않습니다." },
        { status: 400 },
      );
    }

    // 6. 후보 학과 조회 + 매칭
    const candidates = await loadCandidates(validated.data, DEFAULT_CANDIDATE_LIMIT);
    const { results, globalCaveats } = matchKrAdmissions({
      specs: validated.data,
      candidates,
    });

    // 7. 응답 (저장 X)
    return NextResponse.json({
      simulated: true,
      baseSpecId,
      results,
      globalCaveats,
      override,
      candidateCount: candidates.length,
    });
  } catch (e) {
    console.error("[/api/match/simulate] error:", e);
    return NextResponse.json(
      { error: "시뮬레이션 처리 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   override 적용
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * override.csat / override.naesinGpa 를 spec snapshot에 덮어씌움.
 *
 * - csat 등급 변경: korean/math/english/grade 직접 교체
 * - investigationGradeAvg: 모든 investigation 항목의 grade를 균일 적용 (단순화)
 * - naesinGpa: 모든 학기 entry의 relativeGpa를 동일 값으로 덮어씌움 (단순화)
 *
 * 더 정교한 시뮬레이션(특정 학기만 조정 등)은 후속 PR에서 override 스키마 확장.
 */
function applyOverride(
  base: KrSpecsInput,
  override: { csat?: { koreanGrade?: number; mathGrade?: number; englishGrade?: number; investigationGradeAvg?: number }; naesinGpa?: number },
): KrSpecsInput {
  // deep clone 후 mutate (입력값 보호)
  const next: KrSpecsInput = JSON.parse(JSON.stringify(base));

  if (override.csat) {
    if (override.csat.koreanGrade != null) {
      next.score.csat.korean.grade = clampGrade(override.csat.koreanGrade);
    }
    if (override.csat.mathGrade != null) {
      next.score.csat.math.grade = clampGrade(override.csat.mathGrade);
    }
    if (override.csat.englishGrade != null) {
      next.score.csat.english.grade = clampGrade(override.csat.englishGrade);
    }
    if (override.csat.investigationGradeAvg != null) {
      const avg = clampGrade(Math.round(override.csat.investigationGradeAvg));
      next.score.csat.investigation = next.score.csat.investigation.map((i) => ({
        ...i,
        grade: avg,
      }));
    }
  }

  if (override.naesinGpa != null) {
    const gpa = Math.max(1, Math.min(9, override.naesinGpa));
    next.score.naesin = next.score.naesin.map((e) => ({
      ...e,
      relativeGpa: gpa,
    }));
  }

  return next;
}

function clampGrade(g: number): 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 {
  const r = Math.max(1, Math.min(9, Math.round(g)));
  return r as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
}

/* ═══════════════════════════════════════════════════════════════════════
   매칭 헬퍼 — /api/match/route.ts 와 동일 로직 (추후 lib로 추출)
   ═══════════════════════════════════════════════════════════════════════ */

async function loadPlan(uid: string): Promise<"free" | "pro" | "elite"> {
  try {
    const db = getAdminDb();
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

async function loadCandidates(
  specs: KrSpecsInput,
  limit: number,
): Promise<MatchCandidate[]> {
  const db = getAdminDb();
  const year = new Date().getFullYear() + 1;

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
    if (!matchesUiTrack(specs.basic.track, dep.track)) continue;

    const univRef = depDoc.ref.parent.parent;
    if (!univRef) continue;
    const univSnap = await univRef.get();
    if (!univSnap.exists) continue;
    const univ = univSnap.data() as University;
    if (!univ.active) continue;

    if (specs.filter?.category && univ.category !== specs.filter.category) continue;
    if (
      specs.filter?.region &&
      !univ.campuses.some((c) => c.region === specs.filter!.region)
    ) {
      continue;
    }

    const admissionsSnap = await depDoc.ref
      .collection("admissions")
      .doc(String(year))
      .get();
    if (!admissionsSnap.exists) continue;
    const admissions = admissionsSnap.data() as DepartmentAdmissions;

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

function matchesUiTrack(
  uiTrack: KrSpecsInput["basic"]["track"],
  depTrack: Department["track"],
): boolean {
  if (uiTrack === "humanities") return depTrack === "humanities" || depTrack === "social" || depTrack === "interdisciplinary";
  if (uiTrack === "natural") return depTrack === "natural" || depTrack === "engineering" || depTrack === "medical" || depTrack === "interdisciplinary";
  if (uiTrack === "arts") return depTrack === "arts";
  return false;
}
