/**
 * /api/chat — AI 카운슬러 채팅 라우트 (한국 입시).
 *
 * 흐름:
 *   1. requireAuth + Rate limit (1분 20회)
 *   2. plan 조회 (user_entitlements) → featureLimit("aiChatDailyLimit")
 *   3. enforceChatQuota — rate_limits 테이블 RPC 로 일별 카운터 + 한도 체크
 *   4. ChatRequestSchema 검증
 *   5. 컨텍스트 보강 — lib/admission/chat-context 의 resolveChatContext
 *   6. buildCounselorSystemPrompt
 *   7. callKrCounselor (mock 또는 anthropic + sanitize 후처리)
 *   8. recordSanitizeMetric (fire-and-forget, 발동 시에만)
 *   9. ChatResponseSchema 형식 응답
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, zodErrorResponse } from "@/lib/api-auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { callKrCounselor } from "@/lib/anthropic";
import { getAdminSupabase } from "@/lib/supabase-server";
import { reportRouteError } from "@/lib/sentry-report";
import { ChatRequestSchema, type ChatResponseBody } from "@/lib/schemas/api/chat";
import { buildCounselorSystemPrompt } from "@/lib/prompts/counselor-guards";
import { recordSanitizeMetric } from "@/lib/admission/counselor-metric";
import { resolveChatContext } from "@/lib/admission/chat-context";
import { featureLimit, type Plan } from "@/lib/plans";

const QUOTA_BUCKET = "aiChatDailyLimit";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  // 1. Rate limit (분당)
  const rateErr = await enforceRateLimit({
    bucket: "chat",
    uid: auth.uid,
    windowMs: 60_000,
    limit: 20,
  });
  if (rateErr) return rateErr;

  // 2. plan 조회 + 일별 quota 검사·증가
  const plan = await loadPlan(auth.uid);
  const dailyLimit = featureLimit(plan, "aiChatDailyLimit"); // free: 5, pro/elite: Infinity
  const quotaResult = await enforceChatQuota(auth.uid, dailyLimit);
  if (!quotaResult.ok) {
    return NextResponse.json(
      {
        error: `오늘 무료 한도(${dailyLimit}회)를 모두 사용하셨어요. 내일 다시 시도하시거나 업그레이드하세요.`,
        quota: { used: quotaResult.used, limit: dailyLimit, plan },
      },
      { status: 429 },
    );
  }

  // 3. 입력 검증
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "유효하지 않은 JSON 본문" }, { status: 400 });
  }
  const parsed = ChatRequestSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const { messages, conversationId, context } = parsed.data;

  // 4. 컨텍스트 보강 — schoolFocus > matchId > intent fallback
  const focusSchools = await resolveChatContext(auth.uid, context ?? {});
  const insufficientNames = focusSchools
    .filter((s) => !s.sampleSufficient)
    .map((s) => s.displayName);

  // 5. 시스템 프롬프트
  const studentProfile = await buildStudentProfile(auth.uid);
  const systemPrompt = buildCounselorSystemPrompt({
    studentProfile,
    insufficientSampleSchools: insufficientNames,
  });

  // 6. callKrCounselor (mock 또는 anthropic)
  let result: Awaited<ReturnType<typeof callKrCounselor>>;
  try {
    result = await callKrCounselor({
      systemPrompt,
      messages,
      insufficientSampleSchools: insufficientNames,
      plan,
      uid: auth.uid,
      conversationId,
      upstreamSignal: req.signal,
    });
  } catch (e) {
    reportRouteError("api.chat", e, { uid: auth.uid, conversationId });
    return NextResponse.json(
      { error: "AI 카운슬러 응답 처리 중 오류가 발생했어요. 잠시 후 다시 시도해주세요." },
      { status: 502 },
    );
  }

  // 7. 메트릭 — fire-and-forget
  void recordSanitizeMetric(result.sanitizeResult, {
    insufficientSampleSchools: insufficientNames,
    uid: auth.uid,
    conversationId,
  });

  // 8. 응답
  const response: ChatResponseBody = {
    message: { role: "assistant", content: result.response },
    sanitized: result.sanitizeResult.triggered,
    sanitizedPatterns: result.sanitizeResult.replacedSentences.map((r) => r.matchedPattern),
    usage: result.usage,
    source: result.source,
    quotaRemaining:
      Number.isFinite(dailyLimit) && dailyLimit > 0
        ? Math.max(0, dailyLimit - quotaResult.used)
        : null,
  };
  return NextResponse.json(response);
}

/* ═══════════════════════════════════════════════════════════════════════
   plan + quota
   ═══════════════════════════════════════════════════════════════════════ */

async function loadPlan(uid: string): Promise<Plan> {
  try {
    const sb = getAdminSupabase();
    const { data, error } = await sb
      .from("user_entitlements")
      .select("current_plan")
      .eq("user_id", uid)
      .maybeSingle();
    if (error || !data) return "free";
    return ((data as { current_plan: string }).current_plan as Plan) ?? "free";
  } catch {
    return "free";
  }
}

interface QuotaResult {
  ok: boolean;
  used: number;
}

/**
 * 일별 채팅 quota — rate_limits 테이블 + quota_check_and_increment RPC.
 *
 * 한도 Infinity(유료) 면 RPC 가 NULL limit 으로 카운트만 증가.
 * windowMs = 1일 (UTC midnight 까지로 약간 변형 — 단순화).
 */
async function enforceChatQuota(uid: string, dailyLimit: number): Promise<QuotaResult> {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const quotaKey = `quota_${uid}_${today}_${QUOTA_BUCKET}`;
  const windowStart = new Date(`${today}T00:00:00Z`);
  // TTL 14일
  const expiresAt = new Date(windowStart.getTime() + 14 * 24 * 60 * 60 * 1000);

  try {
    const sb = getAdminSupabase();
    const { data, error } = await sb.rpc("quota_check_and_increment", {
      p_quota_key: quotaKey,
      p_window_start: windowStart.toISOString(),
      p_expires_at: expiresAt.toISOString(),
      p_daily_limit: Number.isFinite(dailyLimit) && dailyLimit > 0 ? dailyLimit : null,
    });
    if (error) {
      console.error("[/api/chat] quota RPC failed:", error.message);
      // Fail open
      return { ok: true, used: 0 };
    }
    const row = Array.isArray(data) ? data[0] : data;
    return {
      ok: row?.allowed ?? true,
      used: row?.used ?? 0,
    };
  } catch (e) {
    console.error("[/api/chat] quota check threw:", e);
    return { ok: true, used: 0 };
  }
}

async function buildStudentProfile(uid: string): Promise<string> {
  // 본 PR 단계 — 최소 한 줄. 추후 user_specs 요약으로 확장.
  return `사용자 uid=${uid}`;
}
