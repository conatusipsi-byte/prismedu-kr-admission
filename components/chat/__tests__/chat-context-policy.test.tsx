/**
 * 카운슬러 컨텍스트 정책 회귀 (Day 8)
 *
 * 검증 게이트:
 *   1. 페이지 로드 시 ContextBadge 즉시 노출 (서버 hydrate — 빈 상태 X)
 *   2. matchId 진입 시 "분석 결과 기반 상담" 텍스트 즉시 표시
 *   3. ChatContextBadge "변경" 버튼 → ChatContextDialog 열림
 *   4. Dialog에서 학과 제거 + 추가 → draft 갱신
 *   5. 5개 한도 — Add 버튼 disabled + limit-notice 노출 (P-002 정직성 톤)
 *   6. 확인 → handleContextApply 호출 → conversationId 갱신 + 메시지 초기화
 *   7. 표본 부족 학과 추가 시 ContextBadge 안내 박스 자동 표시
 *   8. matchId 있을 때 "분석 결과 기반으로 복원" 버튼 노출
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ChatInterface } from "../ChatInterface";
import { ChatContextDialog } from "../ChatContextDialog";
import { ChatContextBadge, type ChatContextDept } from "../ChatContextBadge";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/chat",
}));

const SUFFICIENT_SCHOOLS: ChatContextDept[] = [
  { universityId: "yonsei", departmentId: "business", displayName: "연세대학교 경영학과", sampleSufficient: true },
  { universityId: "snu", departmentId: "med", displayName: "서울대학교 의예과", sampleSufficient: true },
];

const INSUFFICIENT_SCHOOL: ChatContextDept = {
  universityId: "korea",
  departmentId: "liberal",
  displayName: "고려대학교 자유전공학부",
  sampleSufficient: false,
};

/* ═══════════════════════════════════════════════════════════════════════
   1. 서버 hydrate — 즉시 노출
   ═══════════════════════════════════════════════════════════════════════ */

describe("ChatInterface — 서버 hydrate 즉시 노출", () => {
  it("contextSchools props 있으면 ContextBadge 즉시 학과 칩 노출 (빈 화면 X)", () => {
    const { container } = render(
      <ChatInterface
        contextSchools={SUFFICIENT_SCHOOLS}
        welcomeMessage="환영합니다"
      />,
    );
    expect(container.textContent).toContain("연세대학교 경영학과");
    expect(container.textContent).toContain("서울대학교 의예과");
  });

  it("matchId 진입 시 '분석 결과 기반 상담' 텍스트 즉시 표시", () => {
    const { container } = render(
      <ChatInterface
        matchId="match_user1_12345"
        contextSchools={SUFFICIENT_SCHOOLS}
        welcomeMessage="환영합니다"
      />,
    );
    expect(container.textContent).toMatch(/분석 결과 기반 상담/);
    const root = container.querySelector('[data-component="chat-context-badge"]') as HTMLElement;
    expect(root.getAttribute("data-mode")).toBe("match");
  });

  it("contextSchools 빈 배열 + matchId 없음 → '일반 상담 모드'", () => {
    const { container } = render(
      <ChatInterface contextSchools={[]} welcomeMessage="환영합니다" />,
    );
    expect(container.textContent).toMatch(/일반 상담 모드/);
  });

  it("표본 부족 학과 포함 시 안내 박스 즉시 노출", () => {
    const { container } = render(
      <ChatInterface
        contextSchools={[...SUFFICIENT_SCHOOLS, INSUFFICIENT_SCHOOL]}
        welcomeMessage="환영합니다"
      />,
    );
    expect(
      container.querySelector('[data-element="insufficient-context-notice"]'),
    ).not.toBeNull();
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   2. ChatContextBadge — 변경 버튼
   ═══════════════════════════════════════════════════════════════════════ */

describe("ChatContextBadge — '변경' 버튼", () => {
  it("onChangeRequested 미지정 → 변경 버튼 미노출", () => {
    render(<ChatContextBadge contextSchools={SUFFICIENT_SCHOOLS} />);
    expect(screen.queryByTestId("chat-context-change-trigger")).toBeNull();
  });

  it("onChangeRequested 지정 → 변경 버튼 노출 + 클릭 시 콜백 호출", () => {
    const onChange = vi.fn();
    render(<ChatContextBadge contextSchools={SUFFICIENT_SCHOOLS} onChangeRequested={onChange} />);
    const trigger = screen.getByTestId("chat-context-change-trigger");
    expect(trigger).toBeInTheDocument();
    fireEvent.click(trigger);
    expect(onChange).toHaveBeenCalled();
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   3. ChatContextDialog — 학과 제거·추가·5개 한도
   ═══════════════════════════════════════════════════════════════════════ */

describe("ChatContextDialog — 학과 추가·제거·한도", () => {
  beforeEach(() => {
    // 검색 결과 mock
  });

  it("열림 시 currentSchools draft에 노출 + X 버튼으로 제거", () => {
    // shadcn Dialog는 portal로 body에 렌더되므로 document.querySelector 사용.
    const onApply = vi.fn();
    render(
      <ChatContextDialog
        open={true}
        onOpenChange={vi.fn()}
        currentSchools={SUFFICIENT_SCHOOLS}
        onApply={onApply}
      />,
    );
    const draftRows = document.querySelectorAll('[data-element="draft-school-row"]');
    expect(draftRows.length).toBe(2);
    // 첫 학과 제거
    const removeBtn = screen.getByLabelText(/연세대학교 경영학과 제거/);
    fireEvent.click(removeBtn);
    // draft 1개로 줄어듦
    const after = document.querySelectorAll('[data-element="draft-school-row"]');
    expect(after.length).toBe(1);
  });

  it("5개 한도 도달 시 limit-notice 노출 + 정직성 톤 ('일관된 답변 품질을 위해')", () => {
    const fiveSchools: ChatContextDept[] = Array.from({ length: 5 }, (_, i) => ({
      universityId: `u${i}`,
      departmentId: `d${i}`,
      displayName: `학과${i}`,
      sampleSufficient: true,
    }));
    render(
      <ChatContextDialog
        open={true}
        onOpenChange={vi.fn()}
        currentSchools={fiveSchools}
        onApply={vi.fn()}
      />,
    );
    const notice = document.querySelector('[data-element="limit-notice"]');
    expect(notice).not.toBeNull();
    // 정직성 톤 — 부정 표현 X
    expect(notice!.textContent).toMatch(/일관된 답변 품질|최대 5개/);
    expect(notice!.textContent).not.toMatch(/검열|차단|거부/);
  });

  it("matchId + matchInitialSchools 있으면 '분석 결과 기반으로 복원' 버튼 노출", () => {
    render(
      <ChatContextDialog
        open={true}
        onOpenChange={vi.fn()}
        currentSchools={[]}
        matchId="match_user1_12345"
        matchInitialSchools={SUFFICIENT_SCHOOLS}
        onApply={vi.fn()}
      />,
    );
    expect(screen.getByTestId("restore-from-match")).toBeInTheDocument();
  });

  it("matchId 없으면 '복원' 버튼 미노출", () => {
    render(
      <ChatContextDialog
        open={true}
        onOpenChange={vi.fn()}
        currentSchools={[]}
        onApply={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("restore-from-match")).toBeNull();
  });

  it("학과 검색 결과에서 추가 → draft 갱신", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              university: { id: "kaist", n: "한국과학기술원", shortName: "KAIST" },
              department: { id: "cs", name: "전산학부" },
              sampleSufficient: true,
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    render(
      <ChatContextDialog
        open={true}
        onOpenChange={vi.fn()}
        currentSchools={[]}
        onApply={vi.fn()}
        fetchOverride={fetchMock as unknown as typeof fetch}
      />,
    );

    // 검색어 입력 (debounce 300ms) — Dialog는 portal이라 document.querySelector
    const searchInput = document.querySelector('input[placeholder*="검색"]') as HTMLInputElement;
    expect(searchInput).not.toBeNull();
    fireEvent.change(searchInput, { target: { value: "전산" } });

    await waitFor(
      () => {
        expect(document.querySelector('[data-element="search-hit"]')).not.toBeNull();
      },
      { timeout: 2000 },
    );

    // 추가 버튼
    const addBtn = screen.getByText(/^추가$/);
    fireEvent.click(addBtn);

    // draft에 추가됨
    expect(document.body.textContent).toContain("KAIST 전산학부");
  });

  it("표본 부족 학과 결과 → '표본 부족 학과' 라벨 노출", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              university: { id: "korea", n: "고려대학교", shortName: "고려대" },
              department: { id: "liberal", name: "자유전공학부" },
              sampleSufficient: false,
            },
          ],
        }),
        { status: 200 },
      ),
    );
    render(
      <ChatContextDialog
        open={true}
        onOpenChange={vi.fn()}
        currentSchools={[]}
        onApply={vi.fn()}
        fetchOverride={fetchMock as unknown as typeof fetch}
      />,
    );
    const searchInput = document.querySelector('input[placeholder*="검색"]') as HTMLInputElement;
    expect(searchInput).not.toBeNull();
    fireEvent.change(searchInput, { target: { value: "자유전공" } });
    await waitFor(
      () => {
        expect(document.body.textContent).toMatch(/표본 부족 학과/);
      },
      { timeout: 2000 },
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   4. ChatInterface — 컨텍스트 변경 시 conversationId 갱신 + 메시지 초기화
   ═══════════════════════════════════════════════════════════════════════ */

describe("ChatInterface — 컨텍스트 변경 효과", () => {
  it("변경 트리거 + Dialog 확인 → conversationId 갱신 + 메시지 초기화", async () => {
    const { container } = render(
      <ChatInterface
        contextSchools={SUFFICIENT_SCHOOLS}
        welcomeMessage="초기 환영"
      />,
    );

    const root = container.querySelector('[data-component="chat-interface"]') as HTMLElement;
    const initialConvId = root.getAttribute("data-conversation-id");
    expect(initialConvId).toMatch(/^conv_/);

    // 변경 트리거 → dialog 열림
    fireEvent.click(screen.getByTestId("chat-context-change-trigger"));
    await waitFor(() => {
      expect(screen.getByText(/상담 컨텍스트 변경/)).toBeInTheDocument();
    });

    // 첫 학과 제거 (draft에서)
    fireEvent.click(screen.getByLabelText(/연세대학교 경영학과 제거/));

    // 확인
    fireEvent.click(screen.getByText(/확인하고 새 대화 시작/));

    // conversationId 변경
    await waitFor(() => {
      const newId = root.getAttribute("data-conversation-id");
      expect(newId).not.toBe(initialConvId);
      expect(newId).toMatch(/^conv_/);
    });

    // 새 환영 메시지 (이전 메시지 초기화)
    expect(container.textContent).toMatch(/컨텍스트가 변경되어 새 대화|일반 모드로 변경/);
    // 이전 환영 미노출
    expect(container.textContent).not.toContain("초기 환영");
  });

  it("모든 학과 제거 후 확인 → '일반 모드로 변경' 환영 메시지", async () => {
    const { container } = render(
      <ChatInterface
        contextSchools={[SUFFICIENT_SCHOOLS[0]]}
        welcomeMessage="초기 환영"
      />,
    );
    fireEvent.click(screen.getByTestId("chat-context-change-trigger"));
    await waitFor(() => {
      expect(screen.getByLabelText(/연세대학교 경영학과 제거/)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText(/연세대학교 경영학과 제거/));
    fireEvent.click(screen.getByText(/확인하고 새 대화 시작/));

    await waitFor(() => {
      expect(container.textContent).toMatch(/일반 모드로 변경/);
    });
  });
});
