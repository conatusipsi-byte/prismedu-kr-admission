/**
 * spec-analysis 모델 출력 파서 (순수 함수 — 서버 의존성 없음, 테스트 가능).
 *
 * 코드펜스/앞뒤 텍스트가 섞여도 robust 하게 JSON 추출 + 필드별 정규화로
 * ActivityScoreSchema·SpecAnalysisResponseSchema 제약(area enum / score 0~100 정수
 * 또는 null / comment 1~400자 / 문자열 1~200자·최대 5개)을 보장한다.
 *
 * 과거 버그(진단 P1-1): 무검증 통과로 모델이 score>100·문자열 score·무효 area 를 내면
 * UI 막대 오버플로/NaN 가능했음. 여기서 정규화하고, 호출부는 SpecAnalysisResponseSchema
 * .safeParse 로 권위 재검증한다.
 */
import type { SpecAnalysisResponse } from "@/lib/schemas/api/spec-analysis";

/** activities 정규화 기준 영역 — ActivityScoreSchema.area enum 과 동일 순서. */
export const SPEC_AREAS = [
  "autonomous",
  "club",
  "career",
  "detailedAbility",
  "behavioralCharacteristics",
] as const;
export type SpecArea = (typeof SPEC_AREAS)[number];

export function parseModelOutput(
  text: string,
): Omit<SpecAnalysisResponse, "source" | "usage"> | null {
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
  // 첫 '{' ~ 마지막 '}' 추출
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) return null;
  const slice = cleaned.slice(start, end + 1);
  try {
    const obj = JSON.parse(slice);
    if (!obj || typeof obj !== "object") return null;

    // activities — area 별 정규화. 무효 area·누락 영역은 score=null + "정보 부족"(P-002, 추정 금지).
    const byArea = new Map<SpecArea, { score: number | null; comment: string }>();
    const rawActs: unknown[] = Array.isArray(obj.activities) ? obj.activities : [];
    for (const a of rawActs) {
      if (!a || typeof a !== "object") continue;
      const act = a as { area?: unknown; score?: unknown; comment?: unknown };
      if (typeof act.area !== "string" || !SPEC_AREAS.includes(act.area as SpecArea)) continue;
      const score =
        typeof act.score === "number" && Number.isFinite(act.score)
          ? Math.max(0, Math.min(100, Math.round(act.score)))
          : null;
      const comment =
        typeof act.comment === "string" && act.comment.trim()
          ? act.comment.trim().slice(0, 400)
          : "정보 부족";
      byArea.set(act.area as SpecArea, { score, comment });
    }
    const activities = SPEC_AREAS.map((area) => ({
      area,
      score: byArea.get(area)?.score ?? null,
      comment: byArea.get(area)?.comment ?? "정보 부족 — 해당 영역 입력 데이터가 부족합니다.",
    }));

    // 문자열 배열 — 비문자/공백 제거 + 1~200자 + 최대 5개 (스키마 제약).
    const strList = (v: unknown): string[] =>
      Array.isArray(v)
        ? v
            .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
            .map((s) => s.trim().slice(0, 200))
            .slice(0, 5)
        : [];

    const caveats = strList(obj.caveats);
    if (caveats.length === 0) {
      caveats.push("AI 참고 분석입니다. 실제 합격을 보장하지 않으며, 최종 판단은 전문 상담과 함께하세요.");
    }

    return {
      activities,
      strengths: strList(obj.strengths),
      weaknesses: strList(obj.weaknesses),
      recommendations: strList(obj.recommendations),
      caveats,
    };
  } catch {
    return null;
  }
}
