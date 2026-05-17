/**
 * 카운슬러 컨텍스트 서버 사이드 로더 — Supabase 기반.
 *
 * `/chat` 진입 시 page (Server Component) + `/api/chat` 라우트 공통 로더.
 *
 * 모든 함수는:
 *   - 호출자 uid 강제 (matches 도큐먼트는 본인 것만 — 열거 차단)
 *   - 실패는 빈 배열 반환 (UI 진입 차단 X — 일반 모드로 폴백)
 *   - server-only — 클라 임포트 차단
 */

import "server-only";
import { getAdminSupabase } from "@/lib/supabase-server";
import { checkSampleSufficiency } from "./sample-gate";
import type {
  AdmissionIntent,
  AdmissionSampleStats,
} from "@/types/admission";

export interface ChatContextSchool {
  universityId: string;
  departmentId: string;
  trackKind?: string;
  displayName: string;
  sampleSufficient: boolean;
}

/* ═══════════════════════════════════════════════════════════════════════
   matchId → 컨텍스트 학과 (본인 매칭만)
   ═══════════════════════════════════════════════════════════════════════ */

export async function loadMatchContextForUser(
  matchId: string,
  uid: string,
): Promise<ChatContextSchool[]> {
  if (!matchId || !/^match_[a-zA-Z0-9_]+$/.test(matchId)) return [];

  try {
    const sb = getAdminSupabase();
    const { data, error } = await sb
      .from("matches")
      .select("user_id, results")
      .eq("id", matchId)
      .maybeSingle();
    if (error || !data) return [];

    const row = data as {
      user_id: string;
      results: Array<{
        universityId: string;
        departmentId: string;
        trackKind: string;
        universityName: string;
        departmentName: string;
        sampleSufficient: boolean;
      }>;
    };
    if (row.user_id !== uid) return [];

    return (row.results ?? []).slice(0, 10).map((r) => ({
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
  _uid: string,
): Promise<ChatContextSchool[]> {
  const safe = pairs
    .filter((p) => /^[a-zA-Z0-9_-]{1,50}$/.test(p.universityId) && /^[a-zA-Z0-9_-]{1,50}$/.test(p.departmentId))
    .slice(0, 5);

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
   사용자 intent (user_specs.intent) 자동 추출 — fallback
   ═══════════════════════════════════════════════════════════════════════ */

export async function loadIntentContext(uid: string): Promise<ChatContextSchool[]> {
  try {
    const sb = getAdminSupabase();
    const { data, error } = await sb
      .from("user_specs")
      .select("intent")
      .eq("user_id", uid)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return [];
    const intent = (data as { intent: AdmissionIntent | null }).intent;
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
      const { data: statsRow } = await sb
        .from("admission_sample_stats")
        .select("verified_count, weighted_count, accepted_count, stage1_passed_count, stage2_accepted_count")
        .eq("id", statsId)
        .maybeSingle();
      const stats = statsRow ? mapSampleStats(statsRow, slot.universityId, slot.departmentId, year, slot.trackKind) : undefined;
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
   자동 컨텍스트 결정 — page 와 라우트가 동일하게 사용
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
  const sb = getAdminSupabase();
  const id = `${universityId}_${departmentId}_${year}`;
  const { data: adm } = await sb
    .from("department_admissions")
    .select("available_track_kinds")
    .eq("id", id)
    .maybeSingle();
  if (!adm) return false;
  const tracks = (adm as { available_track_kinds: string[] }).available_track_kinds ?? [];
  for (const kind of tracks) {
    const statsId = `${universityId}_${departmentId}_${year}_${kind}`;
    const { data: statsRow } = await sb
      .from("admission_sample_stats")
      .select("verified_count, weighted_count, accepted_count, stage1_passed_count, stage2_accepted_count")
      .eq("id", statsId)
      .maybeSingle();
    const stats = statsRow ? mapSampleStats(statsRow, universityId, departmentId, year, kind) : undefined;
    if (checkSampleSufficiency(stats).sufficient) return true;
  }
  return false;
}

async function formatDepartmentDisplayName(
  universityId: string,
  departmentId: string,
): Promise<string | null> {
  try {
    const sb = getAdminSupabase();
    const [{ data: univ }, { data: dept }] = await Promise.all([
      sb.from("universities").select("n").eq("id", universityId).maybeSingle(),
      sb.from("departments").select("name").eq("university_id", universityId).eq("id", departmentId).maybeSingle(),
    ]);
    if (!univ || !dept) return null;
    return `${(univ as { n: string }).n} ${(dept as { name: string }).name}`;
  } catch {
    return null;
  }
}

function mapSampleStats(
  row: Record<string, unknown>,
  universityId: string,
  departmentId: string,
  year: number,
  trackKind: string,
): AdmissionSampleStats {
  return {
    id: `${universityId}_${departmentId}_${year}_${trackKind}`,
    universityId,
    departmentId,
    year,
    trackKind: trackKind as AdmissionSampleStats["trackKind"],
    verifiedCount: (row.verified_count as number) ?? 0,
    weightedCount: (row.weighted_count as number) ?? 0,
    acceptedCount: (row.accepted_count as number) ?? 0,
    stage1PassedCount: row.stage1_passed_count as number | undefined,
    stage2AcceptedCount: row.stage2_accepted_count as number | undefined,
    updatedAt: new Date().toISOString() as unknown as AdmissionSampleStats["updatedAt"],
  };
}
