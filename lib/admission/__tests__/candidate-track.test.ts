/**
 * P1-1 회귀 가드 — 후보 학과 선정 순수 로직.
 *
 * 헤드라인 버그: updated_at DESC limit 후보 선정이 표본 보유 학과를 전원 탈락시켜
 * 합격률 분석이 모든 사용자에게 실 확률 0건을 반환. 수정의 핵심 두 축을 고정한다:
 *   1) 전형 버킷에 engineering/medical 포함 (표본 보유 공학계열이 natural 후보가 되도록)
 *   2) 표본 보유 학과 우선 병합 + (uni,dept) 유니크
 */
import { describe, it, expect } from "vitest";
import { uiTrackToDeptTracks, mergeUniqueDepts } from "@/lib/admission/candidate-track";

describe("uiTrackToDeptTracks — 전형 버킷", () => {
  it("natural 은 engineering·medical 포함 (표본 보유 CS/EE/기계가 후보가 되도록)", () => {
    const t = uiTrackToDeptTracks("natural");
    expect(t).toEqual(expect.arrayContaining(["natural", "engineering", "medical"]));
  });

  it("humanities 는 social·interdisciplinary 포함 (영문·미디어 표본 학과 포함)", () => {
    const t = uiTrackToDeptTracks("humanities");
    expect(t).toEqual(expect.arrayContaining(["humanities", "social", "interdisciplinary"]));
  });

  it("arts 는 arts 만", () => {
    expect(uiTrackToDeptTracks("arts")).toEqual(["arts"]);
  });
});

describe("mergeUniqueDepts — 표본 보유 학과 우선 + 유니크", () => {
  it("priority(표본 보유)가 앞에, (university_id,id) 중복은 첫 등장만 유지", () => {
    const sample = [{ university_id: "snu", id: "computer-science" }];
    const breadth = [
      { university_id: "hanyang", id: "mechanical" },
      { university_id: "snu", id: "computer-science" }, // breadth 에도 있는 중복
    ];
    const merged = mergeUniqueDepts(sample, breadth);
    expect(merged.map((d) => `${d.university_id}/${d.id}`)).toEqual([
      "snu/computer-science",
      "hanyang/mechanical",
    ]);
  });

  it("같은 slug 다른 대학은 별개 후보로 유지", () => {
    const merged = mergeUniqueDepts(
      [{ university_id: "snu", id: "computer-science" }],
      [{ university_id: "yonsei", id: "computer-science" }],
    );
    expect(merged).toHaveLength(2);
  });

  it("빈 priority 면 breadth 그대로", () => {
    const breadth = [{ university_id: "korea", id: "media" }];
    expect(mergeUniqueDepts([], breadth)).toEqual(breadth);
  });
});
