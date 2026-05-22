/**
 * POST /api/consulting/applications 회귀 테스트.
 *
 * 시나리오:
 *   1. 정상 제출 → 201 + { id, createdAt }
 *   2. 미인증 → 401
 *   3. entitlement 없음 → 403 + code='no_entitlement'
 *   4. 필수 필드 누락 (studentName) → 400
 *   5. 학년 invalid (4) → 400
 *   6. 질문 50자 미만 → 400
 *   7. consultationTopics 빈 배열 → 400
 *   8. targetUniversities 6개 → 400
 *   9. 잘못된 JSON 본문 → 400
 *   10. INSERT 실패 → 500
 *
 * 모킹:
 *   - requireAuth: ok=true (uid 부여) / 별 시나리오에서 401 반환
 *   - getConsultingEntitlement: hasAccess true/false 분기
 *   - getAdminSupabase: chainable insert→select→single mock
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const requireAuthMock = vi.fn();
const getEntitlementMock = vi.fn();
const insertMock = vi.fn();
const selectMock = vi.fn();
const singleMock = vi.fn();

vi.mock("@/lib/api-auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-auth")>("@/lib/api-auth");
  return {
    ...actual,
    requireAuth: (req: NextRequest) => requireAuthMock(req),
  };
});

vi.mock("@/lib/consulting/entitlement", () => ({
  getConsultingEntitlement: (uid: string) => getEntitlementMock(uid),
}));

vi.mock("@/lib/supabase-server", () => ({
  getAdminSupabase: () => ({
    from: () => ({
      insert: (payload: unknown) => {
        insertMock(payload);
        return {
          select: () => {
            selectMock();
            return { single: () => singleMock() };
          },
        };
      },
    }),
  }),
}));

vi.mock("server-only", () => ({}));

const validBody = {
  studentName: "홍길동",
  studentGrade: 3,
  highSchool: "한국고등학교",
  consultationTopics: ["정시 전략", "수시 전략"],
  currentGrades: "내신 1.8, 6모 국어 1등급",
  targetUniversities: ["서울대학교", "연세대학교"],
  questions:
    "정시와 수시 중 어느 쪽에 집중해야 할지 결정이 어렵습니다. 현재 내신과 모의고사 성적을 종합적으로 분석해 주세요. 또한 학종 자소서 방향성도 함께 상담받고 싶습니다.",
};

function buildReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/consulting/applications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  requireAuthMock.mockReset();
  getEntitlementMock.mockReset();
  insertMock.mockReset();
  selectMock.mockReset();
  singleMock.mockReset();

  requireAuthMock.mockResolvedValue({ ok: true, uid: "user-uid-1", email: "u@example.com" });
  getEntitlementMock.mockResolvedValue({
    hasAccess: true,
    remainingCredits: 1,
    totalUnexpired: 1,
    usedCount: 0,
  });
  singleMock.mockResolvedValue({
    data: { id: "app-1", created_at: "2026-05-22T13:00:00Z" },
    error: null,
  });
});

describe("POST /api/consulting/applications", () => {
  it("정상 제출 → 201 + { id, createdAt }", async () => {
    const { POST } = await import("../applications/route");
    const res = await POST(buildReq(validBody));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; createdAt: string };
    expect(body.id).toBe("app-1");
    expect(body.createdAt).toBe("2026-05-22T13:00:00Z");
    expect(insertMock).toHaveBeenCalledTimes(1);
    // snake_case 컬럼 매핑 확인
    const payload = insertMock.mock.calls[0][0];
    expect(payload).toMatchObject({
      user_id: "user-uid-1",
      student_name: "홍길동",
      student_grade: 3,
      high_school: "한국고등학교",
      consultation_topics: ["정시 전략", "수시 전략"],
      current_grades: "내신 1.8, 6모 국어 1등급",
      target_universities: ["서울대학교", "연세대학교"],
    });
  });

  it("미인증 → 401", async () => {
    requireAuthMock.mockResolvedValue({
      ok: false,
      reason: "missing_token",
      response: NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 }),
    });
    const { POST } = await import("../applications/route");
    const res = await POST(buildReq(validBody));
    expect(res.status).toBe(401);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("entitlement 없음 → 403 + code='no_entitlement'", async () => {
    getEntitlementMock.mockResolvedValue({
      hasAccess: false,
      remainingCredits: 0,
      totalUnexpired: 0,
      usedCount: 0,
    });
    const { POST } = await import("../applications/route");
    const res = await POST(buildReq(validBody));
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string; code: string };
    expect(body.code).toBe("no_entitlement");
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("필수 필드 누락 (studentName) → 400", async () => {
    const { POST } = await import("../applications/route");
    const { studentName: _omitted, ...rest } = validBody;
    void _omitted;
    const res = await POST(buildReq(rest));
    expect(res.status).toBe(400);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("학년 invalid (4) → 400", async () => {
    const { POST } = await import("../applications/route");
    const res = await POST(buildReq({ ...validBody, studentGrade: 4 }));
    expect(res.status).toBe(400);
  });

  it("질문 50자 미만 → 400", async () => {
    const { POST } = await import("../applications/route");
    const res = await POST(buildReq({ ...validBody, questions: "짧은 질문." }));
    expect(res.status).toBe(400);
  });

  it("consultationTopics 빈 배열 → 400", async () => {
    const { POST } = await import("../applications/route");
    const res = await POST(buildReq({ ...validBody, consultationTopics: [] }));
    expect(res.status).toBe(400);
  });

  it("targetUniversities 6개 → 400", async () => {
    const { POST } = await import("../applications/route");
    const six = ["서울대", "연세대", "고려대", "성균관대", "한양대", "서강대"];
    const res = await POST(buildReq({ ...validBody, targetUniversities: six }));
    expect(res.status).toBe(400);
  });

  it("잘못된 JSON 본문 → 400", async () => {
    const { POST } = await import("../applications/route");
    const res = await POST(buildReq("not-json"));
    expect(res.status).toBe(400);
  });

  it("INSERT 실패 → 500", async () => {
    singleMock.mockResolvedValue({ data: null, error: { message: "db error" } });
    const { POST } = await import("../applications/route");
    const res = await POST(buildReq(validBody));
    expect(res.status).toBe(500);
  });

  it("highSchool 빈 문자열 → null 로 저장", async () => {
    const { POST } = await import("../applications/route");
    const res = await POST(buildReq({ ...validBody, highSchool: "" }));
    expect(res.status).toBe(201);
    const payload = insertMock.mock.calls[0][0];
    expect(payload.high_school).toBeNull();
  });

  it("targetUniversities 미입력 → null 로 저장", async () => {
    const { POST } = await import("../applications/route");
    const { targetUniversities: _t, ...rest } = validBody;
    void _t;
    const res = await POST(buildReq(rest));
    expect(res.status).toBe(201);
    const payload = insertMock.mock.calls[0][0];
    expect(payload.target_universities).toBeNull();
  });
});
