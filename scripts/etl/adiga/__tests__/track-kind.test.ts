/**
 * track-kind 매핑 회귀 — adiga 표기 → conatus AdmissionTrackKind (2026-05-30).
 *
 * 검증:
 *   - 학생부위주(교과/종합) / 논술위주 / 수능위주(가·나·다) 정상 매핑
 *   - 농어촌·기회균형·재외국민 specialType 분기
 *   - 정시 군 식별 실패 시 ok=false
 *   - 매핑 불가 → "unmapped" 명시 반환 (P-005: 가짜 fallback 금지)
 */

import { describe, it, expect } from "vitest";
import { mapAdigaToTrackKind, detectSpecialType } from "../track-kind";

describe("mapAdigaToTrackKind — 수시 분기", () => {
  it("학생부위주(교과) + 수시 → susi_subject", () => {
    const r = mapAdigaToTrackKind({
      trackType: "학생부위주(교과)",
      period: "수시",
      trackName: "학교추천전형",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.kind).toBe("susi_subject");
      expect(r.specialType).toBe("general");
    }
  });

  it("학생부위주(종합) + 수시 → susi_comprehensive", () => {
    const r = mapAdigaToTrackKind({
      trackType: "학생부위주(종합)",
      period: "수시",
      trackName: "지역균형전형",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.kind).toBe("susi_comprehensive");
  });

  it("논술위주 + 수시 → susi_essay", () => {
    const r = mapAdigaToTrackKind({
      trackType: "논술위주",
      period: "수시",
      trackName: "논술전형",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.kind).toBe("susi_essay");
  });

  it("실기/실적위주 + 수시 → susi_practical", () => {
    const r = mapAdigaToTrackKind({
      trackType: "실기/실적위주",
      period: "수시",
      trackName: "실기우수자전형",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.kind).toBe("susi_practical");
  });
});

describe("mapAdigaToTrackKind — 정시 군 분기", () => {
  it("수능위주 + 정시(가) → jeongsi_ga", () => {
    const r = mapAdigaToTrackKind({
      trackType: "수능위주",
      period: "정시(가)",
      trackName: "일반전형",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.kind).toBe("jeongsi_ga");
  });

  it("수능위주 + 정시(나) → jeongsi_na", () => {
    const r = mapAdigaToTrackKind({
      trackType: "수능위주",
      period: "정시(나)",
      trackName: "일반전형",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.kind).toBe("jeongsi_na");
  });

  it("수능위주 + 정시(다) → jeongsi_da", () => {
    const r = mapAdigaToTrackKind({
      trackType: "수능위주",
      period: "정시(다)",
      trackName: "일반전형",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.kind).toBe("jeongsi_da");
  });

  it("수능위주인데 정시 군 식별 실패 → ok=false", () => {
    const r = mapAdigaToTrackKind({
      trackType: "수능위주",
      period: "정시", // 군 미지정
      trackName: "일반전형",
    });
    expect(r.ok).toBe(false);
  });
});

describe("mapAdigaToTrackKind — 재외국민 분기", () => {
  it("trackName 에 '재외국민' 포함 → jaeoegukmin (period/type 무관)", () => {
    const r = mapAdigaToTrackKind({
      trackType: "기타",
      period: "수시",
      trackName: "재외국민·외국인전형",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.kind).toBe("jaeoegukmin");
      expect(r.specialType).toBe("overseas");
    }
  });

  it("trackName 에 '외국인' 포함 → jaeoegukmin", () => {
    const r = mapAdigaToTrackKind({
      trackType: "학생부위주(종합)",
      period: "수시",
      trackName: "외국인전형",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.kind).toBe("jaeoegukmin");
  });
});

describe("detectSpecialType — specialType 분기", () => {
  it("농어촌학생전형 → agricultural", () => {
    expect(detectSpecialType("농어촌학생전형")).toBe("agricultural");
  });
  it("기회균형선발 → low_income", () => {
    expect(detectSpecialType("기회균형선발")).toBe("low_income");
  });
  it("국가보훈대상자 → low_income", () => {
    expect(detectSpecialType("국가보훈대상자전형")).toBe("low_income");
  });
  it("재외국민·외국인 → overseas", () => {
    expect(detectSpecialType("재외국민·외국인전형")).toBe("overseas");
  });
  it("특성화고졸업자 → etc", () => {
    expect(detectSpecialType("특성화고졸업자전형")).toBe("etc");
  });
  it("일반전형 → general", () => {
    expect(detectSpecialType("일반전형")).toBe("general");
  });
  it("지역균형은 일반 (정원내) — general", () => {
    expect(detectSpecialType("지역균형전형")).toBe("general");
  });
});

describe("mapAdigaToTrackKind — 매핑 불가 케이스 (정직성)", () => {
  it("trackType=기타 + 수시 + 평범한 이름 → ok=false (가짜 fallback X)", () => {
    const r = mapAdigaToTrackKind({
      trackType: "기타",
      period: "수시",
      trackName: "특별전형",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("매핑 불가");
  });

  it("추가모집 → additional", () => {
    const r = mapAdigaToTrackKind({
      trackType: "기타",
      period: "추가",
      trackName: "추가모집",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.kind).toBe("additional");
  });
});
