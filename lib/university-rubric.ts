/**
 * University-specific essay rubric 로더 + 타입.
 *
 * Elite 플랜 유저 전용. 대학별 톤·회피 요소·이상적 특성·가중치를 담아
 * /api/essay-review 프롬프트에 주입한다.
 *
 * 데이터: src/data/university-rubrics.json (Top 20 대학)
 * 검증:   scripts/validate-rubrics.mjs
 */
import rubricsData from "@/data/university-rubrics.json";

export interface UniversityRubricWeightings {
  specificity: number;
  personalVoice: number;
  intellectualDepth: number;
  communityFit: number;
  storytelling: number;
}

export interface UniversityRubricSupplementPrompt {
  prompt: string;
  keyAdvice: string;
}

export interface UniversityRubric {
  /** schools.json의 n 필드와 동일한 식별자 (예: "Harvard", "Johns Hopkins"). */
  id: string;
  name: string;
  tone: string[];
  avoidance: string[];
  idealTraits: string[];
  essaySpecifics: {
    commonApp: {
      focus: string;
      sampleThemes: string[];
    };
    supplement: {
      whyUs: string;
      specificPrompts: UniversityRubricSupplementPrompt[];
    };
  };
  weightings: UniversityRubricWeightings;
}

const RUBRICS = rubricsData as UniversityRubric[];
const RUBRIC_INDEX: Map<string, UniversityRubric> = new Map(
  RUBRICS.map((r) => [r.id, r]),
);

export function getRubricById(id: string | null | undefined): UniversityRubric | null {
  if (!id) return null;
  return RUBRIC_INDEX.get(id) ?? null;
}

/** 드롭다운 표시용 최소 정보 (id + name). 20개 고정. */
export function listAvailableRubrics(): Array<{ id: string; name: string }> {
  return RUBRICS.map((r) => ({ id: r.id, name: r.name }));
}

export function hasRubric(id: string | null | undefined): boolean {
  return !!id && RUBRIC_INDEX.has(id);
}
