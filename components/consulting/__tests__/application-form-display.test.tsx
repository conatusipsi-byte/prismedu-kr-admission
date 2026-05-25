/**
 * ApplicationForm 하단 안내 — 사용자 노출 안전성 회귀 (BUG-016, 2026-05-25).
 *
 * 결함: 하단 안내 "Day 4 작업 완료 후 활성화됩니다" — 사용자 노출 + outdated (Day 4 ship 완료).
 * 수정: "제출 시 즉시 예약 확정 + 24h 전 취소 가능" — 현재 동작 정확 반영.
 *
 * P-002 정직성 — 내부 식별자·미구현 안내 거짓 정보 절대 X.
 */

import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { ApplicationForm } from "../ApplicationForm";

// HighSchoolAutocomplete 가 NEIS fetch 하므로 mock
vi.mock("@/components/profile/HighSchoolAutocomplete", () => ({
  HighSchoolAutocomplete: (props: { value?: string; onChange?: (v: string) => void }) => (
    <input
      data-testid="mock-high-school"
      value={props.value ?? ""}
      onChange={(e) => props.onChange?.(e.target.value)}
    />
  ),
}));

describe("ApplicationForm 하단 안내 (BUG-016)", () => {
  it("'Day N' 작업 단계명 미노출", () => {
    const { container } = render(<ApplicationForm onValidSubmit={vi.fn()} />);
    const text = container.textContent ?? "";
    expect(text, "Day [0-9] 잔존").not.toMatch(/Day\s*\d+/);
  });

  it("'작업 완료 후 활성화' 같은 dev 표현 미노출", () => {
    const { container } = render(<ApplicationForm onValidSubmit={vi.fn()} />);
    const text = container.textContent ?? "";
    expect(text).not.toContain("작업 완료");
    expect(text).not.toContain("작업 후");
    expect(text).not.toContain("구현 완료");
  });

  it("폼 footer notice — 현재 동작에 맞는 안내 (즉시 확정 + 24h 취소)", () => {
    const { container } = render(<ApplicationForm onValidSubmit={vi.fn()} />);
    const notice = container.querySelector('[data-element="form-footer-notice"]');
    expect(notice, "form-footer-notice 미노출").not.toBeNull();
    const text = notice!.textContent ?? "";
    expect(text).toContain("예약이 즉시 확정");
    expect(text).toContain("24시간");
    expect(text).toContain("취소");
  });

  it("footer notice 에 '내 예약' 링크 (/consulting/my-bookings)", () => {
    const { container } = render(<ApplicationForm onValidSubmit={vi.fn()} />);
    const notice = container.querySelector('[data-element="form-footer-notice"]');
    const link = notice!.querySelector('a[href="/consulting/my-bookings"]');
    expect(link, "내 예약 링크 미노출").not.toBeNull();
    expect(link!.textContent).toBe("내 예약");
  });

  it("'신청서만 저장' outdated 카피 미노출 (예약 확정 흐름과 모순)", () => {
    const { container } = render(<ApplicationForm onValidSubmit={vi.fn()} />);
    const text = container.textContent ?? "";
    expect(text).not.toContain("신청서만 저장");
  });
});
