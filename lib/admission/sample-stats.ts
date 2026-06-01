/**
 * admission_sample_stats 배치 로더 (진단 P2 1-1: N+1 제거).
 *
 * 과거: match·match/simulate 의 loadCandidates 가 후보(최대 limit×전형 수)마다
 * loadSampleStats 를 직렬 await → 요청당 수십~수백 라운드트립 (시즌 트래픽 위험).
 * 이 헬퍼는 id 목록을 .in() 으로 일괄 조회한다. 결과는 id 별로 직렬 조회와 동일
 * (같은 테이블·같은 id·같은 컬럼 매핑). 조회 실패는 graceful (해당 id 누락 → undefined).
 */
import { getAdminSupabase } from "@/lib/supabase-server";
import type { AdmissionSampleStats } from "@/types/admission";
import type { AdmissionTrackKind } from "@/types/admission";

/** sample stats row id 규칙 — DB PK 와 동일. */
export function sampleStatId(
  universityId: string,
  departmentId: string,
  year: number,
  trackKind: AdmissionTrackKind,
): string {
  return `${universityId}_${departmentId}_${year}_${trackKind}`;
}

const CHUNK = 200; // .in() 안전 청크 크기

/** id 목록 → Map<id, AdmissionSampleStats>. 없는 id 는 맵에 미포함. */
export async function loadSampleStatsBatch(
  ids: string[],
): Promise<Map<string, AdmissionSampleStats>> {
  const out = new Map<string, AdmissionSampleStats>();
  const unique = Array.from(new Set(ids));
  if (unique.length === 0) return out;
  try {
    const sb = getAdminSupabase();
    for (let i = 0; i < unique.length; i += CHUNK) {
      const chunk = unique.slice(i, i + CHUNK);
      const { data, error } = await sb
        .from("admission_sample_stats")
        .select("*")
        .in("id", chunk);
      if (error || !data) continue;
      for (const r of data as Array<Record<string, unknown>>) {
        out.set(r.id as string, {
          id: r.id as string,
          universityId: r.university_id as string,
          departmentId: r.department_id as string,
          year: r.year as number,
          trackKind: r.track_kind as AdmissionTrackKind,
          verifiedCount: r.verified_count as number,
          weightedCount: r.weighted_count as number,
          acceptedCount: r.accepted_count as number,
          stage1PassedCount: r.stage1_passed_count as number | undefined,
          stage2AcceptedCount: r.stage2_accepted_count as number | undefined,
          updatedAt: r.updated_at as AdmissionSampleStats["updatedAt"],
        });
      }
    }
  } catch {
    // graceful — 빈/부분 맵 반환 (직렬판의 per-item catch 와 동일 효과)
  }
  return out;
}
