/**
 * TrackDetailCard — 정시 예정안(planStatus="preliminary") 정직성 배지 회귀.
 *
 * 정직성 (P-002):
 *   - planStatus="preliminary" 트랙은 "예정안 · 전형시행계획" 배지 + "12월 확정본 교체" 안내를
 *     반드시 노출 (확정 데이터처럼 보이면 안 됨).
 *   - planStatus 미설정/"confirmed" 는 배지·안내 미노출 (기존 수시 확정 트랙 호환).
 */

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { TrackDetailCard } from "../TrackDetailCard";
import type { AdmissionTrack } from "@/types/admission";

const base: AdmissionTrack = {
  name: "수능전형",
  kind: "jeongsi_ga",
  specialType: "general",
  quotaInitial: 60,
  stages: [{ step: 1, components: { csat: 100 } }],
};

describe("TrackDetailCard 정시 예정안 배지 (P-002)", () => {
  it("preliminary — 예정안 배지 + 12월 교체 안내 노출", () => {
    const { container } = render(
      <TrackDetailCard track={{ ...base, planStatus: "preliminary" }} />,
    );
    const badge = container.querySelector('[data-element="plan-preliminary-badge"]');
    const note = container.querySelector('[data-element="plan-preliminary-note"]');
    expect(badge).not.toBeNull();
    expect(note).not.toBeNull();
    expect(container.querySelector('[data-plan-status="preliminary"]')).not.toBeNull();
    expect(badge?.textContent).toContain("전형시행계획");
    expect(note?.textContent).toContain("전형시행계획(예정안)");
    expect(note?.textContent).toContain("12월 확정본");
  });

  it("confirmed(미설정) — 예정안 배지·안내 미노출", () => {
    const { container } = render(<TrackDetailCard track={base} />);
    expect(container.querySelector('[data-element="plan-preliminary-badge"]')).toBeNull();
    expect(container.querySelector('[data-element="plan-preliminary-note"]')).toBeNull();
    expect(container.querySelector('[data-plan-status="confirmed"]')).not.toBeNull();
  });

  it('confirmed 명시 — data-plan-status="confirmed"', () => {
    const { container } = render(
      <TrackDetailCard track={{ ...base, kind: "susi_subject", planStatus: "confirmed" }} />,
    );
    expect(container.querySelector('[data-element="plan-preliminary-badge"]')).toBeNull();
  });
});
