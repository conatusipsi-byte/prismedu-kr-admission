/**
 * ⚠️ SERVER-ONLY ⚠️
 * 풀 학교 데이터(1.3MB). 클라이언트가 import하면 빌드 실패.
 * 클라이언트는 src/lib/schools-index.ts (가벼운 인덱스) 또는
 * /api/schools/[name] (단일 학교 상세) 사용.
 */
import "server-only";
import schoolsData from "@/data/schools.json";
import type { School } from "./matching";
export { schoolMatchesQuery } from "./school-search";

// schools.json의 literal 타입(예: mr의 키가 literal union)이 School의 Record<string, number>와
// 구조적 비교가 안 돼서 unknown 경유 cast. 런타임에 필요한 필드(n, d)만 안전하게 읽음.
export const SCHOOLS = schoolsData as unknown as Array<Partial<School> & { n: string; d?: string }>;

export const DOMS: Record<string, string> = {};
SCHOOLS.forEach((s) => { if (s.d) DOMS[s.n] = s.d; });
