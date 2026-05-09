/**
 * /chat — AI 카운슬러 페이지 (Server Component, Day 8: 서버 hydrate)
 *
 * Day 7까지: 클라가 mount 후 fetch → 빈 화면 깜빡임
 * Day 8: 서버에서 cookies → uid → matchId/schoolFocus 컨텍스트 조회 → ChatPageView로 전달
 *
 * 인증 처리:
 *   - 미인증·세션 만료 → 일반 모드로 폴백 (인증 페이지 미정 — 로그인 미들웨어 차후 PR)
 *     사용자는 페이지에 진입해 메시지를 보내면 /api/chat가 401 반환 → ChatInterface가 안내.
 *   - 본인 외 matchId 접근 → 빈 컨텍스트로 폴백 (열거 차단)
 */

import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { getAdminAuth } from "@/lib/firebase-admin";
import { SESSION_COOKIE_NAME } from "@/lib/api-auth";
import { resolveChatContext, type ChatContextSchool } from "@/lib/admission/chat-context";
import { ChatPageView } from "./ChatPageView";

export const metadata: Metadata = {
  title: "AI 카운슬러 — conatusipsi",
  description: "한국 대학 입시 AI 카운슬러 — 정직성 원칙 기반 책임감 있는 상담.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface ChatPageSearchParams {
  matchId?: string;
  schoolFocus?: string | string[];
}

async function loadInitialContext(searchParams: ChatPageSearchParams): Promise<{
  contextSchools: ChatContextSchool[];
  authenticated: boolean;
}> {
  // 1. 세션 쿠키 → uid (미인증이면 빈 컨텍스트)
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!session) return { contextSchools: [], authenticated: false };

  let uid: string;
  try {
    const decoded = await getAdminAuth().verifySessionCookie(session, true);
    uid = decoded.uid;
  } catch {
    return { contextSchools: [], authenticated: false };
  }

  // 2. searchParams → matchId / schoolFocus 추출
  const matchId = typeof searchParams.matchId === "string" ? searchParams.matchId : undefined;
  const schoolFocus = parseSchoolFocusParam(searchParams.schoolFocus);

  // 3. 컨텍스트 조회 (resolveChatContext 우선순위: schoolFocus > matchId > intent)
  const contextSchools = await resolveChatContext(uid, { matchId, schoolFocus });
  return { contextSchools, authenticated: true };
}

function parseSchoolFocusParam(raw: string | string[] | undefined): Array<{ universityId: string; departmentId: string }> {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  const out: Array<{ universityId: string; departmentId: string }> = [];
  for (const v of arr.slice(0, 5)) {
    const [u, d] = v.split("/");
    if (!u || !d) continue;
    if (!/^[a-zA-Z0-9_-]{1,50}$/.test(u) || !/^[a-zA-Z0-9_-]{1,50}$/.test(d)) continue;
    out.push({ universityId: u, departmentId: d });
  }
  return out;
}

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<ChatPageSearchParams>;
}): Promise<React.ReactElement> {
  const params = await searchParams;
  const { contextSchools, authenticated } = await loadInitialContext(params);
  const matchId = typeof params.matchId === "string" ? params.matchId : undefined;
  const schoolFocus = parseSchoolFocusParam(params.schoolFocus);

  return (
    <div
      data-page="chat"
      className="mx-auto flex h-[calc(100dvh-4rem)] max-w-content flex-col px-gutter-sm md:px-gutter lg:px-gutter-lg py-6"
    >
      <Suspense fallback={null}>
        <ChatPageView
          initialContextSchools={contextSchools}
          matchId={matchId}
          schoolFocus={schoolFocus}
          authenticated={authenticated}
        />
      </Suspense>
    </div>
  );
}
