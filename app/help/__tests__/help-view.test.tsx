/**
 * /help — BUG-027 회귀 (2026-05-25).
 *
 * 결함: 검색바 메시지 "출시 직전 활성화" + 이메일 "임시" 표현 — 출시 직전인데도 미완성 인상.
 *
 * 수정:
 *   - "FAQ 검색은 곧 추가됩니다" 부드러운 메시지
 *   - "임시 이메일" 경고 제거
 *   - 이메일 conatusipsi@gmail.com 통일
 */

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import HelpPage from "../page";

describe("/help — BUG-027 카피 정리", () => {
  it("검색바 안내: '곧 추가됩니다' 부드러운 메시지", () => {
    const { container } = render(<HelpPage />);
    const note = container.querySelector('[data-element="help-search-note"]');
    expect(note, "help-search-note 미노출").not.toBeNull();
    const text = note!.textContent ?? "";
    expect(text).toContain("곧 추가됩니다");
    expect(text).toContain("카테고리");
    // 회귀 가드 — "출시 직전" / "준비 중" 표현 제거됨
    expect(text).not.toContain("출시 직전");
  });

  it("이메일: conatusipsi@gmail.com 통일 + 임시 경고 제거", () => {
    const { container } = render(<HelpPage />);
    const text = container.textContent ?? "";
    expect(text).toContain("conatusipsi@gmail.com");
    // 회귀 가드 — "이메일 주소는 출시 전 임시입니다" 잔존 X
    expect(text).not.toContain("출시 전 임시");
    expect(text).not.toContain("이메일 주소는 출시 전");
    // 이전 임시 도메인 잔존 X
    expect(text).not.toContain("support@conatusipsi.com");
  });

  it("mailto 링크 — conatusipsi@gmail.com", () => {
    const { container } = render(<HelpPage />);
    const mailtoLinks = Array.from(container.querySelectorAll('a[href^="mailto:"]')) as HTMLAnchorElement[];
    expect(mailtoLinks.length).toBeGreaterThan(0);
    for (const a of mailtoLinks) {
      expect(a.getAttribute("href")).toBe("mailto:conatusipsi@gmail.com");
    }
  });
});
