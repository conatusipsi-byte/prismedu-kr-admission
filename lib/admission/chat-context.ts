/**
 * 카운슬러 컨텍스트 서버 사이드 로더
 *
 * `/chat` 진입 시 page (Server Component)와 `/api/chat` 라우트가 모두 호출하는 공통 로더.
 * Day 7 까지는 chat/route.ts 안에 인라인이었지만, Day 8 서버 hydrate 추가로 page에서도
 * 동일 로직 필요 → 모듈로 추출.
 *
 * 모든 함수는:
 *   - 호출자 uid 강제 (matches 도큐먼트는 본인 것만 — 열거 차단)
 *   - 실패는 빈 배열 반환 (UI 진입 차단 X — 일반 모드로 폴백)
 *   - server-only — 클라 임포트 차단 (Firebase Admin SDK)
 */

import "server-only";
import { getAdminDb } from "@/lib/firebase-admin";
import { checkSampleSufficiency } from "./sample-gate";
import type {
  AdmissionIntent,
  AdmissionSampleStats,
  Department,
  University,
} from "@/types/admission";

export interface ChatContextSchool {
  universityId: string;
  departmentId: string;
  trackKind?: string;
  /** 사용자 노출 라벨 (e.g., "연세대학교 경영학과") */
  displayName: string;
  /** sample-gate 결과 */
  sampleSufficient: boolean;
}

/* ═══════════════════════════════════════════════════════════════════════
   matchId → 컨텍스트 학과 (본인 매칭만)
   ═══════════════════════════════════════════════════════════════════════ */

export async function loadMatchContextForUser(
  matchId: string,
  uid: string,
): Promise<ChatContextSchool[]> {
  // matchId 형식 검증 — POST /api/match와 동일한 정규식 (열거 차단)
  if (!matchId || !/^match_[a-zA-Z0-9_]+$/.test(matchId)) return [];

  try {
    const db = getAdminDb();
    const snap = await db.collection("matches").doc(matchId).get();
    if (!snap.exists) return [];
    const data = snap.data() as {
      userId?: string;
      results?: Array<{
        universityId: string;
        departmentId: string;
        trackKind: string;
        universityName: string;
        departmentName: string;
        sampleSufficient: boolean;
      }>;
    };
    if (data.userId !== uid) return []; // 본인 결과만
    return (data.results ?? []).slice(0, 10).map((r) => ({
      universityId: r.universityId,
      departmentId: r.departmentId,
      trackKind: r.trackKind,
      displayName: `${r.universityName} ${r.departmentName}`,
      sampleSufficient: r.sampleSufficient,
    }));
  } catch (e) {
    console.error("[chat-context] loadMatchContextForUser 실패:", e);
    return [];
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   schoolFocus → 학과 메타 + sample-gate
   ═══════════════════════════════════════════════════════════════════════ */

export async function loadSchoolsForFocus(
  pairs: Array<{ universityId: string; departmentId: string }>,
  _uid: string, // 향후 사용자별 권한 체크 필요시 활용
): Promise<ChatContextSchool[]> {
  // 보안: pairs 형식 검증 (universityId/departmentId 영숫자)
  const safe = pairs
    .filter((p) => /^[a-zA-Z0-9_-]{1,50}$/.test(p.universityId) && /^[a-zA-Z0-9_-]{1,50}$/.test(p.departmentId))
    .slice(0, 5); // 최대 5개

  const out: ChatContextSchool[] = [];
  for (const pair of safe) {
    const display = await formatDepartmentDisplayName(pair.universityId, pair.departmentId);
    if (!display) continue;
    const sufficient = await isAnyTrackSampleSufficient(
      pair.universityId,
      pair.departmentId,
      new Date().getFullYear() + 1,
    );
    out.push({
      universityId: pair.universityId,
      departmentId: pair.departmentId,
      displayName: display,
      sampleSufficient: sufficient,
    });
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════════════════
   사용자 intent (specs.intent) 자동 추출 — fallback
   ═══════════════════════════════════════════════════════════════════════ */

export async function loadIntentContext(uid: string): Promise<ChatContextSchool[]> {
  try {
    const db = getAdminDb();
    const specSnap = await db
      .collection("users").doc(uid)
      .collection("specs")
      .orderBy("updatedAt", "desc")
      .limit(1)
      .get();

    if (specSnap.empty) return [];
    const spec = specSnap.docs[0].data() as { intent?: AdmissionIntent };
    const intent = spec.intent;
    if (!intent) return [];

    const slots = [
      ...intent.susi,
      intent.jeongsi.ga, intent.jeongsi.na, intent.jeongsi.da,
    ].filter((s): s is NonNullable<typeof s> => Boolean(s));

    const year = new Date().getFullYear() + 1;
    const out: ChatContextSchool[] = [];
    for (const slot of slots.slice(0, 10)) {
      const display = await formatDepartmentDisplayName(slot.universityId, slot.departmentId);
      if (!display) continue;
      const statsId = `${slot.universityId}_${slot.departmentId}_${year}_${slot.trackKind}`;
      const statsDoc = await db.collection("admissionSampleStats").doc(statsId).get();
      const stats = statsDoc.exists ? (statsDoc.data() as AdmissionSampleStats) : undefined;
      out.push({
        universityId: slot.universityId,
        departmentId: slot.departmentId,
        trackKind: slot.trackKind,
        displayName: display,
        sampleSufficient: checkSampleSufficiency(stats).sufficient,
      });
    }
    return out;
  } catch (e) {
    console.error("[chat-context] loadIntentContext 실패:", e);
    return [];
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   자동 컨텍스트 결정 — page와 라우트가 동일하게 사용
   ───────────────────────────────────────────────────────────────────────
   우선순위: schoolFocus > matchId > intent fallback
   ═══════════════════════════════════════════════════════════════════════ */

export async function resolveChatContext(
  uid: string,
  opts: {
    matchId?: string;
    schoolFocus?: Array<{ universityId: string; departmentId: string }>;
  },
): Promise<ChatContextSchool[]> {
  if (opts.schoolFocus && opts.schoolFocus.length > 0) {
    return loadSchoolsForFocus(opts.schoolFocus, uid);
  }
  if (opts.matchId) {
    const fromMatch = await loadMatchContextForUser(opts.matchId, uid);
    if (fromMatch.length > 0) return fromMatch;
  }
  return loadIntentContext(uid);
}

/* ═══════════════════════════════════════════════════════════════════════
   유틸
   ═══════════════════════════════════════════════════════════════════════ */

async function isAnyTrackSampleSufficient(
  universityId: string,
  departmentId: string,
  year: number,
): Promise<boolean> {
  const db = getAdminDb();
  const admDoc = await db
    .collection("universities").doc(universityId)
    .collection("departments").doc(departmentId)
    .collection("admissions").doc(String(year))
    .get();
  if (!admDoc.exists) return false;
  const tracks = (admDoc.data() as { availableTrackKinds?: string[] }).availableTrackKinds ?? [];
  for (const kind of tracks) {
    const statsId = `${universityId}_${departmentId}_${year}_${kind}`;
    const statsDoc = await db.collection("admissionSampleStats").doc(statsId).get();
    const stats = statsDoc.exists ? (statsDoc.data() as AdmissionSampleStats) : undefined;
    if (checkSampleSufficiency(stats).sufficient) return true;
  }
  return false;
}

async function formatDepartmentDisplayName(
  universityId: string,
  departmentId: string,
): Promise<string | null> {
  try {
    const db = getAdminDb();
    const [u, d] = await Promise.all([
      db.collection("universities").doc(universityId).get(),
      db.collection("universities").doc(universityId).collection("departments").doc(departmentId).get(),
    ]);
    if (!u.exists || !d.exists) return null;
    const univ = u.data() as Pick<University, "n">;
    const dept = d.data() as Pick<Department, "name">;
    return `${univ.n} ${dept.name}`;
  } catch {
    return null;
  }
}
