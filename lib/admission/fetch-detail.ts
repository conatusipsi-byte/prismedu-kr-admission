/**
 * Department detail fetch — Supabase 직접 쿼리.
 *
 * 동일 로직이 (a) /app/admissions/[univ]/[dep]/page.tsx Server Component,
 * (b) /api/admissions/[univ]/[dep]/route.ts 양쪽에서 호출되도록 추출.
 *
 * Phase 1 (audit P0-01): 기존엔 mock-data 사용으로 snu/med 외 전부 404.
 */

import { getAdminSupabase } from "@/lib/supabase-server";
import { checkSampleSufficiency } from "@/lib/admission/sample-gate";
import { ADMISSION_PROBABILITY_ENABLED } from "@/lib/admission/feature-flags";
import { isValidAdmissionId, canonicalizeAdmissionId } from "@/lib/admission/id-validation";
import { getCurrentAdmissionYear } from "@/lib/admission/current-year";
import type {
  AdmissionSampleStats,
  AdmissionTrack,
  AdmissionTrackKind,
  Department,
  DepartmentAdmissions,
  PrevYearResult,
  University,
  Timestamp,
} from "@/types/admission";

export interface DepartmentDetail {
  university: University;
  department: Department;
  admissions: DepartmentAdmissions;
  prevYearResult: PrevYearResult | undefined;
  /** primary track 기준 표본 충분성. */
  sampleSufficient: boolean;
}

/**
 * 학과 상세 단일 fetch. 존재하지 않으면 null.
 *
 * - 정해진 학년도 (year = 현재년도 + 1) 의 모집요강을 inner join.
 * - 표본 통계는 primary track(첫 트랙) 기준만 빠르게 조회.
 */
export async function fetchDepartmentDetail(
  universityId: string,
  departmentId: string,
): Promise<DepartmentDetail | null> {
  // ⚠️ 한글 id canonical 화 — Next.js 가 Server Component route param 을 percent-encoded(또는
  // NFD)로 전달 → DB(NFC) 와 불일치 → 매칭 실패(한글 학과 빈 페이지, 55개). decode + NFC 로 일치.
  universityId = canonicalizeAdmissionId(universityId);
  departmentId = canonicalizeAdmissionId(departmentId);
  // ID 검증 — 캐시 키 안정성 + PostgREST 필터 안전. 한글 음절(가-힣) 허용.
  if (!isValidAdmissionId(universityId)) return null;
  if (!isValidAdmissionId(departmentId)) return null;

  const sb = getAdminSupabase();
  const year = getCurrentAdmissionYear();

  // URL param 은 id 또는 slug. slug 우선 → 못 찾으면 id로. canonical 한 id 만 후속 쿼리에 사용.
  const { data: uniRow } = await sb
    .from("universities")
    .select("id")
    .or(`id.eq.${universityId},slug.eq.${universityId}`)
    .maybeSingle();
  const resolvedUniversityId = uniRow?.id ?? universityId;

  const { data, error } = await sb
    .from("departments")
    .select(`
      *,
      universities!inner ( * ),
      department_admissions!inner ( * )
    `)
    .eq("university_id", resolvedUniversityId)
    .eq("id", departmentId)
    .eq("department_admissions.year", year)
    .maybeSingle();

  if (error) {
    // 503/연결 실패 등은 throw → caller(page.tsx)가 error boundary 로 처리.
    // notFound 와는 의미상 분리 필요.
    throw new Error(`fetchDepartmentDetail Supabase error: ${error.message}`);
  }
  if (!data) return null;

  const row = data as unknown as RawDepartmentRow;
  const adm = row.department_admissions[0];
  if (!adm) return null;

  // primary track 기준 표본 충분성
  const primaryTrack: AdmissionTrackKind | undefined = adm.available_track_kinds[0];
  let sampleSufficient = false;
  if (primaryTrack) {
    const statsId = `${universityId}_${departmentId}_${year}_${primaryTrack}`;
    const { data: statsRow } = await sb
      .from("admission_sample_stats")
      .select("verified_count, weighted_count, accepted_count, stage1_passed_count, stage2_accepted_count")
      .eq("id", statsId)
      .maybeSingle();
    if (statsRow) {
      const r = statsRow as Record<string, unknown>;
      const stats: AdmissionSampleStats = {
        id: statsId,
        universityId,
        departmentId,
        year,
        trackKind: primaryTrack,
        verifiedCount: r.verified_count as number,
        weightedCount: r.weighted_count as number,
        acceptedCount: r.accepted_count as number,
        stage1PassedCount: r.stage1_passed_count as number | undefined,
        stage2AcceptedCount: r.stage2_accepted_count as number | undefined,
        updatedAt: makeIsoTimestamp(),
      };
      sampleSufficient = checkSampleSufficiency(stats).sufficient;
    }
  }

  return {
    university: rowToUniversity(row.universities),
    department: rowToDepartment(row),
    admissions: rowToAdmissions(adm, year),
    // 안전 가드(2026-06): 합격률 비활성 시 전년도 입결(경쟁률·등급컷)도 숨김 — seed-v1 난수
    // 차단. (실 ETL 행은 대부분 prev_year_result=null 이라 가림으로 잃는 실데이터 없음.)
    prevYearResult: ADMISSION_PROBABILITY_ENABLED ? (adm.prev_year_result ?? undefined) : undefined,
    sampleSufficient,
  };
}

/* ───────────────────────── row mappers ───────────────────────── */

type RawDepartmentRow = {
  id: string;
  university_id: string;
  campus_id: string;
  name: string;
  name_en: string | null;
  unit_type: Department["unitType"];
  track: Department["track"];
  total_quota: number;
  sub_departments: string[] | null;
  is_professional: boolean | null;
  professional_type: Department["professionalType"] | null;
  active: boolean;
  updated_at: string;
  universities: RawUniversityRow;
  department_admissions: RawAdmissionsRow[];
};

type RawUniversityRow = {
  id: string;
  n: string;
  name_en: string | null;
  short_name: string | null;
  d: string | null;
  category: University["category"];
  campuses: University["campuses"];
  rank_order: number | null;
  admission_guide_url: string | null;
  logo_url: string | null;
  website_url: string | null;
  active: boolean;
};

type RawAdmissionsRow = {
  university_id: string;
  department_id: string;
  year: number;
  tracks: Record<AdmissionTrackKind, AdmissionTrack[]>;
  available_track_kinds: AdmissionTrackKind[];
  prev_year_result: PrevYearResult | null;
};

function rowToDepartment(r: RawDepartmentRow): Department {
  return {
    id: r.id,
    universityId: r.university_id,
    campusId: r.campus_id,
    name: r.name,
    nameEn: r.name_en ?? undefined,
    unitType: r.unit_type,
    track: r.track,
    totalQuota: r.total_quota,
    subDepartments: r.sub_departments ?? undefined,
    isProfessional: r.is_professional ?? undefined,
    professionalType: r.professional_type ?? undefined,
    active: r.active,
    updatedAt: makeIsoTimestamp(),
  };
}

function rowToUniversity(r: RawUniversityRow): University {
  return {
    id: r.id,
    n: r.n,
    nameEn: r.name_en ?? undefined,
    shortName: r.short_name ?? undefined,
    d: r.d ?? undefined,
    category: r.category,
    campuses: r.campuses,
    rankOrder: r.rank_order ?? undefined,
    admissionGuideUrl: r.admission_guide_url ?? undefined,
    logoUrl: r.logo_url ?? undefined,
    websiteUrl: r.website_url ?? undefined,
    active: r.active,
    updatedAt: makeIsoTimestamp(),
  };
}

function rowToAdmissions(r: RawAdmissionsRow, year: number): DepartmentAdmissions {
  return {
    id: String(year),
    universityId: r.university_id,
    departmentId: r.department_id,
    year: year as DepartmentAdmissions["year"],
    tracks: r.tracks ?? {},
    availableTrackKinds: r.available_track_kinds ?? [],
    prevYearResult: r.prev_year_result ?? undefined,
    source: { parsedAt: makeIsoTimestamp(), parserVersion: "supabase-direct/1" },
    updatedAt: makeIsoTimestamp(),
  };
}

/**
 * Supabase row의 updated_at(ISO string)을 Timestamp 형태로 fake-cast.
 * 기존 코드가 Timestamp 인터페이스에 의존하는 영역에 대비.
 */
function makeIsoTimestamp(): Timestamp {
  const now = new Date();
  return {
    seconds: Math.floor(now.getTime() / 1000),
    nanoseconds: 0,
    toDate: () => now,
    toMillis: () => now.getTime(),
  };
}
