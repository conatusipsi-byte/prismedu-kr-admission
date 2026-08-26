/**
 * loadKrCandidates — 합격률 매칭 후보 학과 로더 (match · simulate 공용 단일 소스).
 *
 * P1-1 수정 (2026-06): 기존 match/simulate 의 loadCandidates 는 departments 를
 * `updated_at DESC` 로 limit(Free 60 · Pro 200) 만 가져온 뒤 JS 에서 전형/계열 필터
 * 했다. ETL 이 국립대를 최근 갱신하면서 표본 보유 SKY/서울 학과의 recency 순위가
 * 334~1,847위/1,847 로 밀려 후보에서 전원 탈락 → 모든 사용자가 Safety/Match/Reach 를
 * 한 건도 못 보는 헤드라인 버그가 발생했다.
 *
 * 개선:
 *   (c) 전형(track 버킷)·계열(category) 필터를 DB 쿼리로 푸시다운 → "관련 학과"만 로드
 *       (무관한 recency 60개 대신).
 *   (a) 표본(admission_sample_stats) 보유 학과를 limit 과 무관하게 항상 후보에 포함
 *       → 표본 있는 학과를 절대 놓치지 않음. (표본 없으면 여전히 insufficient — 정직)
 *
 * 성능: 쿼리 4개(breadth + sample keys + sample depts + sample_stats batch)로 상수 —
 *   P2 에서 제거한 N+1 을 재도입하지 않는다(.in() 배치 유지).
 */

import { getAdminSupabase } from "@/lib/supabase-server";
import { loadSampleStatsBatch, sampleStatId } from "@/lib/admission/sample-stats";
import { getCurrentAdmissionYear } from "@/lib/admission/current-year";
import type { KrSpecsInput } from "@/lib/schemas/api/match";
import type { MatchCandidate } from "@/lib/matching-kr";
import type {
  AdmissionTrackKind,
  Department,
  DepartmentAdmissions,
  University,
} from "@/types/admission";
import { uiTrackToDeptTracks, mergeUniqueDepts } from "@/lib/admission/candidate-track";

const SELECT = `
  id, university_id, name, track, active, updated_at,
  universities!inner ( id, n, category, campuses, active ),
  department_admissions!inner ( year, tracks, available_track_kinds, prev_year_result )
`;

interface DeptRow {
  id: string;
  university_id: string;
  name: string;
  track: Department["track"];
  universities: {
    id: string;
    n: string;
    category: University["category"];
    campuses: University["campuses"];
    active: boolean;
  };
  department_admissions: Array<{
    year: number;
    tracks: DepartmentAdmissions["tracks"];
    available_track_kinds: AdmissionTrackKind[];
    prev_year_result: DepartmentAdmissions["prevYearResult"];
  }>;
}

export async function loadKrCandidates(
  specs: KrSpecsInput,
  limit: number,
): Promise<MatchCandidate[]> {
  const sb = getAdminSupabase();
  const year = getCurrentAdmissionYear();
  const tracks = uiTrackToDeptTracks(specs.basic.track);
  if (tracks.length === 0) return [];

  // 공통 필터(전형 버킷 + 계열)를 DB 로 푸시다운한 새 쿼리 빌더.
  const base = () => {
    let q = sb
      .from("departments")
      .select(SELECT)
      .eq("active", true)
      .eq("universities.active", true)
      .eq("department_admissions.year", year)
      .in("track", tracks);
    if (specs.filter?.category) q = q.eq("universities.category", specs.filter.category);
    return q;
  };

  // (A) breadth — 관련 학과를 recency 순 limit 까지(목록 다양성).
  const { data: breadth, error } = await base()
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) return [];

  // (B) 표본 보유 학과(올해) — limit 과 무관하게 항상 포함.
  const { data: sampleStatRows } = await sb
    .from("admission_sample_stats")
    .select("university_id, department_id")
    .eq("year", year);
  const sampleKeys = new Set(
    (sampleStatRows ?? []).map((r) => `${r.university_id}/${r.department_id}`),
  );
  const sampleDeptIds = Array.from(
    new Set((sampleStatRows ?? []).map((r) => r.department_id as string)),
  );
  let sampleRows: DeptRow[] = [];
  if (sampleDeptIds.length > 0) {
    // slug 로 over-fetch 후 정확한 (uni,dept) 쌍만 유지 (전형 버킷은 base() 가 이미 제한).
    const { data } = await base().in("id", sampleDeptIds);
    sampleRows = ((data ?? []) as unknown as DeptRow[]).filter((r) =>
      sampleKeys.has(`${r.university_id}/${r.id}`),
    );
  }

  // 표본 보유 학과 우선 + 유니크 병합.
  const rows = mergeUniqueDepts(sampleRows, (breadth ?? []) as unknown as DeptRow[]);

  // 후보 전개 — sampleStats 제외 1차 + stat id 수집(N+1 제거 유지).
  const pending: Array<Omit<MatchCandidate, "sampleStats"> & { statId: string }> = [];
  for (const raw of rows) {
    const univ = raw.universities;
    const admissions = raw.department_admissions[0];
    if (!admissions) continue;

    // track/category 는 DB 에서 필터됨. 지역은 campuses(jsonb)라 JS 에서 유지.
    if (
      specs.filter?.region &&
      !univ.campuses.some((c) => c.region === specs.filter!.region)
    ) {
      continue;
    }

    for (const trackKind of admissions.available_track_kinds) {
      if (trackKind === "jaeoegukmin") continue;
      const trackList = admissions.tracks[trackKind] ?? [];
      for (const track of trackList) {
        pending.push({
          universityId: univ.id,
          universityName: univ.n,
          departmentId: raw.id,
          departmentName: raw.name,
          trackKind,
          trackName: track.name,
          track,
          prevYearResult: admissions.prev_year_result,
          statId: sampleStatId(univ.id, raw.id, year, trackKind),
        });
      }
    }
  }

  // 2차: sample_stats .in() 배치 일괄 조회.
  const statsById = await loadSampleStatsBatch(pending.map((p) => p.statId));
  return pending.map(({ statId, ...rest }) => ({ ...rest, sampleStats: statsById.get(statId) }));
}
