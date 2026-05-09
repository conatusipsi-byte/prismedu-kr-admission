/**
 * 카운슬러 UI 정책 회귀 — P-002 정직성 시각 표현 (Day 7 핵심)
 *
 * 검증 게이트:
 *   1. sanitized=true 메시지에 ⚠️ 배지 노출
 *   2. ⚠️ 배지 텍스트에 부정 표현(검열·차단·거부·막음·제거) 0건
 *   3. ⚠️ 배지 텍스트에 긍정 표현(정확한 정보·정제·신중) 1+개
 *   4. sanitizedPatterns 한국어 라벨 노출 (임의 합격률 추정 등)
 *   5. 무료 한도 0 → 입력 disabled
 *   6. 한도 도달 응답(429) → LockCard 노출 + 결제 CTA (정상 — quota 한도용)
 *   7. ChatContextBadge — 모드별 메타·표본 부족 안내
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ChatMessage, type ChatMessageData } from "../ChatMessage";
import { ChatInput } from "../ChatInput";
import { ChatContextBadge } from "../ChatContextBadge";
import { ChatInterface } from "../ChatInterface";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/chat",
}));

/* ═══════════════════════════════════════════════════════════════════════
   1. ChatMessage — sanitized 배지 + 톤
   ═══════════════════════════════════════════════════════════════════════ */

const NEGATIVE_TERMS = ["검열", "차단", "거부", "막음", "막혔", "제거됨", "삭제됨", "필터링"];
const POSITIVE_TERMS = ["정확한 정보", "정제", "신중", "보호"];

function aiMsg(overrides: Partial<ChatMessageData> = {}): ChatMessageData {
  return {
    id: "a1",
    role: "assistant",
    content: "테스트 응답입니다.",
    ...overrides,
  };
}

function userMsg(): ChatMessageData {
  return { id: "u1", role: "user", content: "안녕하세요" };
}

describe("ChatMessage — sanitized 배지", () => {
  it("sanitized=true → ⚠️ 안내 노티스 노출", () => {
    const { container } = render(
      <ChatMessage message={aiMsg({ sanitized: true, sanitizedPatterns: ["percent", "grade"] })} />,
    );
    expect(container.querySelector('[data-element="sanitize-notice"]')).not.toBeNull();
  });

  it("sanitized=false → 노티스 미노출", () => {
    const { container } = render(<ChatMessage message={aiMsg({ sanitized: false })} />);
    expect(container.querySelector('[data-element="sanitize-notice"]')).toBeNull();
  });

  it("sanitized 메시지 노티스 텍스트에 부정 표현 0건 (P-002)", () => {
    const { container } = render(
      <ChatMessage message={aiMsg({ sanitized: true, sanitizedPatterns: ["percent"] })} />,
    );
    const notice = container.querySelector('[data-element="sanitize-notice"]') as HTMLElement;
    const text = notice.textContent ?? "";
    for (const t of NEGATIVE_TERMS) {
      expect(text, `'${t}' 부정 표현 발견 — P-002 위반`).not.toContain(t);
    }
  });

  it("sanitized 메시지 노티스 텍스트에 긍정 표현 1+개 (P-002)", () => {
    const { container } = render(
      <ChatMessage message={aiMsg({ sanitized: true, sanitizedPatterns: ["percent"] })} />,
    );
    const notice = container.querySelector('[data-element="sanitize-notice"]') as HTMLElement;
    const text = notice.textContent ?? "";
    const found = POSITIVE_TERMS.filter((t) => text.includes(t));
    expect(found.length, `긍정 표현이 부족 — 발견: ${found.join(", ") || "없음"}`).toBeGreaterThanOrEqual(1);
  });

  it("sanitizedPatterns 한국어 라벨 노출 (예: '임의 합격률 추정')", () => {
    const { container } = render(
      <ChatMessage
        message={aiMsg({
          sanitized: true,
          sanitizedPatterns: ["percent", "grade", "score"],
        })}
      />,
    );
    const labels = container.querySelector('[data-element="sanitize-patterns"]')?.textContent ?? "";
    expect(labels).toMatch(/임의 합격률 추정/);
    expect(labels).toMatch(/임의 등급 추정/);
    expect(labels).toMatch(/임의 점수 추정/);
  });

  it("패턴 라벨 중복 제거 (같은 라벨 2회 등장 시 1번만)", () => {
    const { container } = render(
      <ChatMessage
        message={aiMsg({
          sanitized: true,
          sanitizedPatterns: ["percent", "percent", "percent"],
        })}
      />,
    );
    const labels = container.querySelector('[data-element="sanitize-patterns"]') as HTMLElement;
    const matches = labels?.textContent?.match(/임의 합격률 추정/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it("user 메시지는 sanitized 처리 X (사용자 본인 메시지)", () => {
    const { container } = render(<ChatMessage message={userMsg()} />);
    expect(container.querySelector('[data-element="sanitize-notice"]')).toBeNull();
  });

  it("user 메시지 → mint 배경 + 오른쪽 정렬", () => {
    const { container } = render(<ChatMessage message={userMsg()} />);
    const root = container.querySelector('[data-component="chat-message"]') as HTMLElement;
    expect(root.getAttribute("data-role")).toBe("user");
    expect(root.className).toMatch(/justify-end/);
  });

  it("'확정 합격' 표현은 sanitized 노티스에 등장하지 않음", () => {
    const { container } = render(
      <ChatMessage message={aiMsg({ sanitized: true, sanitizedPatterns: ["percent"] })} />,
    );
    const notice = container.querySelector('[data-element="sanitize-notice"]') as HTMLElement;
    expect(notice.textContent ?? "").not.toMatch(/확정\s*합격/);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   2. ChatInput — 한도 + 카운터
   ═══════════════════════════════════════════════════════════════════════ */

describe("ChatInput — 한도 + 카운터", () => {
  it("quotaRemaining=0 → 입력 disabled + placeholder 안내", () => {
    const { container } = render(
      <ChatInput onSend={vi.fn()} quotaRemaining={0} quotaLimit={5} />,
    );
    const root = container.querySelector('[data-component="chat-input"]') as HTMLElement;
    expect(root.getAttribute("data-disabled")).toBe("true");
    const ta = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(ta.disabled).toBe(true);
    expect(ta.placeholder).toMatch(/오늘 무료 상담 한도/);
  });

  it("quotaRemaining=3, quotaLimit=5 → '오늘 2/5턴 사용' 표시", () => {
    const { container } = render(
      <ChatInput onSend={vi.fn()} quotaRemaining={3} quotaLimit={5} />,
    );
    const counter = container.querySelector('[data-element="chat-quota"]');
    expect(counter?.textContent).toMatch(/오늘\s*2\s*\/\s*5턴 사용/);
  });

  it("quotaRemaining=null (유료) → 카운터 미노출", () => {
    const { container } = render(
      <ChatInput onSend={vi.fn()} quotaRemaining={null} quotaLimit={null} />,
    );
    expect(container.querySelector('[data-element="chat-quota"]')).toBeNull();
  });

  it("quotaRemaining=1 → 빨간 강조 (text-rose)", () => {
    const { container } = render(
      <ChatInput onSend={vi.fn()} quotaRemaining={1} quotaLimit={5} />,
    );
    const counter = container.querySelector('[data-element="chat-quota"]') as HTMLElement;
    expect(counter.className).toMatch(/rose/);
  });

  it("Enter → onSend 호출 (Shift+Enter는 줄바꿈)", () => {
    const onSend = vi.fn();
    const { container } = render(<ChatInput onSend={onSend} />);
    const ta = container.querySelector("textarea") as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "테스트 메시지" } });
    fireEvent.keyDown(ta, { key: "Enter", shiftKey: false });
    expect(onSend).toHaveBeenCalledWith("테스트 메시지");
  });

  it("Shift+Enter → onSend 미호출", () => {
    const onSend = vi.fn();
    const { container } = render(<ChatInput onSend={onSend} />);
    const ta = container.querySelector("textarea") as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "줄1" } });
    fireEvent.keyDown(ta, { key: "Enter", shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   3. ChatContextBadge — 모드별 메타
   ═══════════════════════════════════════════════════════════════════════ */

describe("ChatContextBadge — 모드별 표시", () => {
  it("matchId 있음 → '분석 결과 기반 상담'", () => {
    render(<ChatContextBadge matchId="match_user1_123" contextSchools={[]} />);
    expect(screen.getByText(/분석 결과 기반 상담/)).toBeInTheDocument();
  });

  it("schoolFocus 있음 → '학과 N개 컨텍스트'", () => {
    render(
      <ChatContextBadge
        contextSchools={[
          { universityId: "snu", departmentId: "med", displayName: "서울대 의예과", sampleSufficient: true },
          { universityId: "yonsei", departmentId: "biz", displayName: "연세대 경영학과", sampleSufficient: true },
        ]}
      />,
    );
    expect(screen.getByText(/학과\s*2개 컨텍스트/)).toBeInTheDocument();
    expect(screen.getByText(/서울대 의예과/)).toBeInTheDocument();
    expect(screen.getByText(/연세대 경영학과/)).toBeInTheDocument();
  });

  it("둘 다 없음 → '일반 상담 모드'", () => {
    render(<ChatContextBadge />);
    expect(screen.getByText(/일반 상담 모드/)).toBeInTheDocument();
  });

  it("표본 부족 학과 포함 → 별도 안내 박스", () => {
    const { container } = render(
      <ChatContextBadge
        contextSchools={[
          { universityId: "korea", departmentId: "liberal", displayName: "고려대 자유전공", sampleSufficient: false },
        ]}
      />,
    );
    const notice = container.querySelector('[data-element="insufficient-context-notice"]');
    expect(notice).not.toBeNull();
    expect(notice!.textContent).toMatch(/일반론|모집요강|표본/);
  });

  it("최대 5개까지 칩 노출, 초과는 +N 배지", () => {
    const { container } = render(
      <ChatContextBadge
        contextSchools={Array.from({ length: 7 }, (_, i) => ({
          universityId: `u${i}`,
          departmentId: `d${i}`,
          displayName: `학과${i}`,
          sampleSufficient: true,
        }))}
      />,
    );
    expect(container.textContent).toMatch(/\+2/);
  });

  it("표본 부족 학과 칩 — data-sample-sufficient='false'", () => {
    const { container } = render(
      <ChatContextBadge
        contextSchools={[
          { universityId: "korea", departmentId: "liberal", displayName: "고려대 자유전공", sampleSufficient: false },
        ]}
      />,
    );
    const chip = container.querySelector('[data-sample-sufficient="false"]');
    expect(chip).not.toBeNull();
    expect(chip!.textContent).toMatch(/표본 부족/);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   4. ChatInterface — 한도 초과 LockCard + 결제 CTA
   ═══════════════════════════════════════════════════════════════════════ */

describe("ChatInterface — 한도 초과 흐름", () => {
  it("429 응답 → LockCard 노출 + 입력 영역 사라짐 + 결제 CTA", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "오늘 무료 한도(5회)를 모두 사용했어요.",
          quota: { used: 5, limit: 5, plan: "free" },
        }),
        { status: 429, headers: { "content-type": "application/json" } },
      ),
    );

    const { container } = render(
      <ChatInterface
        welcomeMessage="안녕하세요"
        fetchOverride={fetchMock as unknown as typeof fetch}
      />,
    );
    // 메시지 전송
    const ta = container.querySelector("textarea") as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "한도 초과 트리거" } });
    fireEvent.keyDown(ta, { key: "Enter", shiftKey: false });

    await waitFor(() => {
      const root = container.querySelector('[data-component="chat-interface"]') as HTMLElement;
      expect(root.getAttribute("data-limit-reached")).toBe("true");
    });

    // LockCard 노출 + 입력 영역 사라짐
    expect(container.querySelector('[data-element="chat-limit-lock"]')).not.toBeNull();
    expect(container.querySelector('[data-component="chat-input"]')).toBeNull();
    // 결제 CTA (LockCard 내부 "/payment" 또는 "/pricing" 링크)
    const link = container.querySelector('a[href="/payment"], a[href="/pricing"]');
    expect(link, "LockCard에 결제 CTA 링크 없음").not.toBeNull();
  });

  it("한도 초과 LockCard 텍스트에 부정 표현 0건 (P-002 톤 일관)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ error: "한도 초과", quota: { used: 5, limit: 5, plan: "free" } }),
        { status: 429 },
      ),
    );
    const { container } = render(
      <ChatInterface fetchOverride={fetchMock as unknown as typeof fetch} />,
    );
    fireEvent.change(container.querySelector("textarea") as HTMLTextAreaElement, {
      target: { value: "트리거" },
    });
    fireEvent.keyDown(container.querySelector("textarea") as HTMLTextAreaElement, {
      key: "Enter", shiftKey: false,
    });
    await waitFor(() => {
      expect(container.querySelector('[data-element="chat-limit-lock"]')).not.toBeNull();
    });
    const lock = container.querySelector('[data-element="chat-limit-lock"]') as HTMLElement;
    const text = lock.textContent ?? "";
    for (const t of NEGATIVE_TERMS) {
      expect(text).not.toContain(t);
    }
  });

  it("정상 응답 + sanitized=true → ⚠️ 배지 자동 노출", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          message: { role: "assistant", content: "정확한 수치는 분석 페이지에서 확인하세요." },
          sanitized: true,
          sanitizedPatterns: ["grade", "percent"],
          usage: { inputTokens: 10, outputTokens: 20 },
          source: "mock",
          quotaRemaining: 4,
        }),
        { status: 200 },
      ),
    );
    const { container } = render(
      <ChatInterface fetchOverride={fetchMock as unknown as typeof fetch} />,
    );
    fireEvent.change(container.querySelector("textarea") as HTMLTextAreaElement, {
      target: { value: "이 학과 합격률 알려주세요" },
    });
    fireEvent.keyDown(container.querySelector("textarea") as HTMLTextAreaElement, {
      key: "Enter", shiftKey: false,
    });
    await waitFor(() => {
      expect(container.querySelector('[data-element="sanitize-notice"]')).not.toBeNull();
    });
    // 패턴 라벨 한국어 노출
    const notice = container.querySelector('[data-element="sanitize-notice"]') as HTMLElement;
    expect(notice.textContent).toMatch(/임의 등급 추정|임의 합격률 추정/);
  });
});
