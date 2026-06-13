/**
 * 후보 학과 선정 — 순수 헬퍼 (서버/Next 의존 없음 = 단위 테스트 대상).
 * loadKrCandidates(candidate-loader.ts)에서 사용. (import type 만 → 런타임 의존 0)
 */
import type { KrSpecsInput } from "@/lib/schemas/api/match";
import type { Department } from "@/types/admission";

/**
 * UI 계열(humanities/natural/arts) → departments.track 버킷 매핑.
 *
 * P1-1 핵심: 표본 보유 학과(CS·SW·기계·EE = engineering)가 natural 학생에게 후보로
 * 잡히도록 natural 에 engineering·medical 을 포함한다. interdisciplinary(융합)는 양쪽 모두.
 */
export function uiTrackToDeptTracks(
  uiTrack: KrSpecsInput["basic"]["track"],
): Department["track"][] {
  switch (uiTrack) {
    case "humanities":
      return ["humanities", "social", "interdisciplinary"];
    case "natural":
      return ["natural", "engineering", "medical", "interdisciplinary"];
    case "arts":
      return ["arts"];
    default:
      return [];
  }
}

/**
 * (university_id, id) 기준 유니크 병합. `priority`(표본 보유 학과)를 앞에 두고
 * 중복은 첫 등장만 유지 → 표본 보유 학과가 절대 limit 으로 잘리지 않음.
 */
export function mergeUniqueDepts<T extends { id: string; university_id: string }>(
  priority: T[],
  rest: T[],
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of [...priority, ...rest]) {
    const key = `${r.university_id}/${r.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}
