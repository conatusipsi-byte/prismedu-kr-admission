/**
 * admission_results 매칭용 프로필 벡터 (11차원).
 *
 * 각 차원은 0~1로 정규화. cosine similarity로 비교.
 * 차원 구성:
 *   [0] gpaUnweighted   / 4.3   → 0~1 (4.0 만점 기준 약간 여유)
 *   [1] gpaWeighted     / 5.0   → 0~1
 *   [2] sat             / 1600  → 0~1 (SAT 없으면 ACT→SAT 환산)
 *   [3] toefl           / 120   → 0~1 (없으면 0)
 *   [4] apCount         / 12    → 0~1 (clip)
 *   [5] apAverage       / 5     → 0~1
 *   [6] majorCategory one-hot — STEM / Business / Humanities / Arts / Premed
 *   [7~10] majorCategory 추가 4차원 (one-hot 그룹 총 5차원 = [6]+[7]+[8]+[9]+[10])
 *
 * schoolType, gradYear, ecTier는 벡터에 넣지 않고 쿼리/필터에 활용.
 */

export type MajorCategory = "stem" | "business" | "humanities" | "arts" | "premed";

const MAJOR_MAP: Record<string, MajorCategory> = {
  "computer science": "stem",
  "cs": "stem",
  "engineering": "stem",
  "mechanical engineering": "stem",
  "electrical engineering": "stem",
  "chemical engineering": "stem",
  "bioengineering": "stem",
  "physics": "stem",
  "mathematics": "stem",
  "applied math": "stem",
  "math": "stem",
  "statistics": "stem",
  "data science": "stem",
  "business": "business",
  "economics": "business",
  "finance": "business",
  "management": "business",
  "english": "humanities",
  "history": "humanities",
  "philosophy": "humanities",
  "political science": "humanities",
  "international relations": "humanities",
  "sociology": "humanities",
  "psychology": "humanities",
  "art": "arts",
  "art history": "arts",
  "design": "arts",
  "film": "arts",
  "music": "arts",
  "architecture": "arts",
  "biology": "premed",
  "biochemistry": "premed",
  "neuroscience": "premed",
  "pre-med": "premed",
  "premed": "premed",
  "public health": "premed",
};

export function categorizeMajor(major: string | undefined | null): MajorCategory {
  if (!major) return "stem";
  const key = major.trim().toLowerCase();
  if (MAJOR_MAP[key]) return MAJOR_MAP[key];
  for (const [pattern, cat] of Object.entries(MAJOR_MAP)) {
    if (key.includes(pattern)) return cat;
  }
  return "stem";
}

/** ACT → SAT 환산표 (축약형, College Board concordance 기준). */
function actToSat(act: number): number {
  if (act >= 36) return 1600;
  if (act >= 35) return 1570;
  if (act >= 34) return 1540;
  if (act >= 33) return 1510;
  if (act >= 32) return 1470;
  if (act >= 31) return 1430;
  if (act >= 30) return 1400;
  if (act >= 29) return 1360;
  if (act >= 28) return 1320;
  if (act >= 27) return 1280;
  if (act >= 26) return 1240;
  if (act >= 25) return 1210;
  if (act >= 24) return 1180;
  if (act >= 22) return 1120;
  if (act >= 20) return 1040;
  return 960;
}

export interface ProfileInput {
  gpaUnweighted?: number | string | null;
  gpaWeighted?: number | string | null;
  gpa?: number | string | null;
  sat?: number | string | null;
  satTotal?: number | string | null;
  act?: number | string | null;
  toefl?: number | string | null;
  apCount?: number | string | null;
  apAverage?: number | string | null;
  major?: string | null;
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * 11차원 벡터 생성. 모든 값 0~1 정규화.
 */
export function buildProfileVector(profile: ProfileInput): number[] {
  const gpaUW = toNum(profile.gpaUnweighted) ?? toNum(profile.gpa);
  const gpaW = toNum(profile.gpaWeighted);
  const satRaw = toNum(profile.satTotal) ?? toNum(profile.sat);
  const actRaw = toNum(profile.act);
  const sat = satRaw ?? (actRaw ? actToSat(actRaw) : null);
  const toefl = toNum(profile.toefl);
  const apCount = toNum(profile.apCount);
  const apAverage = toNum(profile.apAverage);

  // gpaW가 없으면 gpaUW × 1.1 추정
  const gpaWFallback = gpaW ?? (gpaUW !== null ? Math.min(gpaUW * 1.1, 5) : null);

  const category = categorizeMajor(profile.major);
  const cats: MajorCategory[] = ["stem", "business", "humanities", "arts", "premed"];
  const majorOneHot = cats.map((c) => (c === category ? 1 : 0));

  return [
    gpaUW !== null ? clamp01(gpaUW / 4.3) : 0,
    gpaWFallback !== null ? clamp01(gpaWFallback / 5.0) : 0,
    sat !== null ? clamp01(sat / 1600) : 0,
    toefl !== null ? clamp01(toefl / 120) : 0,
    apCount !== null ? clamp01(apCount / 12) : 0,
    apAverage !== null ? clamp01(apAverage / 5) : 0,
    ...majorOneHot,
  ];
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * 추정 ecTier. GPA + AP 기반(활동 자체는 프로필에 없으므로 간접 추정).
 * 0.75 / 0.5 / 0.25 세 단계.
 */
export function estimateEcTier(profile: ProfileInput): number {
  const gpa = toNum(profile.gpaUnweighted) ?? toNum(profile.gpa) ?? 0;
  const ap = toNum(profile.apCount) ?? 0;
  if (gpa >= 3.9 && ap >= 7) return 0.75;
  if (gpa >= 3.7 && ap >= 5) return 0.5;
  return 0.25;
}

/**
 * "11학년" / "12학년" / "10학년" / "9학년" → 예상 입시 연도.
 * 현재 년도 기준. 파싱 실패 시 year+2.
 */
export function estimateGradYear(grade: string | undefined | null, currentYear: number): number {
  if (!grade) return currentYear + 2;
  const g = grade.trim();
  if (g.includes("12")) return currentYear + 1;
  if (g.includes("11")) return currentYear + 2;
  if (g.includes("10")) return currentYear + 3;
  if (g.includes("9")) return currentYear + 4;
  return currentYear + 2;
}
