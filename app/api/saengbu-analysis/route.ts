/**
 * POST /api/saengbu-analysis — 생기부(학생부) AI 정성 분석 (Pro 전용)
 *
 * 생기부 전체 텍스트 → 학생부종합전형 5축 루브릭 정성 분석.
 * spec-analysis 라우트 패턴 재사용(prismedu 자산): auth → rate → plan gate →
 * Anthropic(mock fallback) → JSON 강제 → 스키마 검증.
 *
 * 비용 통제 (API 비용은 운영 계정 부담):
 *   - Pro+ plan gate (canUseFeature) + per-min/per-day rate limit
 *   - ai-cache: 동일 생기부(content hash) 재분석은 캐시 반환 → 신규 토큰 0
 *   - 입력 30000자 상한(스키마) — 토큰·비용 폭주 방지
 *
 * 개인정보 (생기부 = 민감정보):
 *   - consent=true 필수(스키마 재검증) — 동의 없으면 분석 거부
 *   - 생기부 원문은 서버에 저장하지 않음(일회성). 캐시는 md5(content) 키 + 분석 결과만 저장(원문 X)
 *   - 로그에 생기부 본문을 남기지 않음 (uid·오류만 기록)
 *
 * 정직성(P-002)+윤리:
 *   - 근거 없는 영역 score=null("정보 부족") / 합격 보장·합격선 수치 생성 금지
 *   - score 는 역량 루브릭(참고용)이지 합격 가능성이 아님 (UI·caveat 명시)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, zodErrorResponse } from "@/lib/api-auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getAdminSupabase } from "@/lib/supabase-server";
import { getAnthropicClient, createMessageWithTimeout, ClaudeTimeoutError } from "@/lib/anthropic";
import { makeCacheKey, getCachedResponse, setCachedResponse } from "@/lib/ai-cache";
import { reportRouteError } from "@/lib/sentry-report";
import { canUseFeature, type Plan } from "@/lib/plans";
import {
  SaengbuAnalysisRequestSchema,
  type SaengbuAnalysisResponse,
  SAENGBU_AXES,
  type SaengbuAxis,
} from "@/lib/schemas/api/saengbu-analysis";

export const dynamic = "force-dynamic";
// 생기부는 길어 분석이 ~30~60초 걸릴 수 있음 → Vercel 함수 실행 상한 명시(앱 타임아웃 90초 + 여유).
export const maxDuration = 120;

const MODEL = "claude-sonnet-4-6"; // 정성 분석 — Sonnet(비용·품질 균형). spec-analysis 와 동일.
const MAX_TOKENS = 2048;
const CACHE_PREFIX = "saengbu_v1";

/** 캐시에 담는 분석 본문 (source/usage/cached 제외 — 원문 X). */
type SaengbuAnalysisCore = Omit<SaengbuAnalysisResponse, "source" | "usage" | "cached">;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  // 비용 통제 — 분당 3회(버스트 차단) + 일 20회(예산 보호). 토큰 소모 큰 분석.
  const minErr = await enforceRateLimit({ bucket: "saengbu_analysis", uid: auth.uid, windowMs: 60_000, limit: 3 });
  if (minErr) return minErr;
  const dayErr = await enforceRateLimit({ bucket: "saengbu_analysis_daily", uid: auth.uid, windowMs: 86_400_000, limit: 20 });
  if (dayErr) return dayErr;

  const plan = await loadPlan(auth.uid);
  if (!canUseFeature(plan, "saengbuAnalysisEnabled")) {
    return NextResponse.json(
      { error: "생기부 AI 분석은 Pro 전용 기능입니다.", upgradeUrl: "/pricing" },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "유효하지 않은 JSON 본문" }, { status: 400 });
  }
  const parsed = SaengbuAnalysisRequestSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const { text, focusMajor } = parsed.data;

  // 캐시 — content hash 키 (원문 미저장, md5 만). 동일 생기부 재분석 → 신규 토큰 0.
  const cacheKey = makeCacheKey(CACHE_PREFIX, { text, focusMajor: focusMajor ?? "" });
  const cached = await getCachedResponse<SaengbuAnalysisCore>(cacheKey);
  if (cached) {
    return NextResponse.json({
      ...cached,
      source: "anthropic" as const,
      cached: true,
      usage: { inputTokens: 0, outputTokens: 0 },
    } satisfies SaengbuAnalysisResponse);
  }

  try {
    const result = await runSaengbuAnalysis({ text, focusMajor, upstreamSignal: req.signal });
    // 실 호출 결과만 캐시(mock 은 캐시 안 함 — 키 등록 후 실분석으로 대체되게)
    if (result.source === "anthropic") {
      const { source: _s, usage: _u, cached: _c, ...core } = result;
      void setCachedResponse(cacheKey, core);
    }
    return NextResponse.json(result);
  } catch (e) {
    // 주의: 생기부 본문을 오류 컨텍스트에 포함하지 않는다 (PII).
    // 타임아웃은 "고장"이 아니라 "생기부가 길어 오래 걸림" → 명확히 안내 (null 점수 화면 X).
    if (e instanceof ClaudeTimeoutError) {
      reportRouteError("api.saengbu-analysis.timeout", e, { uid: auth.uid });
      return NextResponse.json(
        { error: "생기부가 길어 분석이 오래 걸려요. 생기부를 더 짧게 나눠 입력하거나 잠시 후 다시 시도해주세요." },
        { status: 504 },
      );
    }
    reportRouteError("api.saengbu-analysis", e, { uid: auth.uid });
    return NextResponse.json(
      { error: "분석 처리 중 오류가 발생했어요. 잠시 후 다시 시도해주세요." },
      { status: 502 },
    );
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   분석 실행 — Anthropic 또는 mock
   ═══════════════════════════════════════════════════════════════════════ */

interface RunInput {
  text: string;
  focusMajor?: string;
  upstreamSignal?: AbortSignal;
}

async function runSaengbuAnalysis(input: RunInput): Promise<SaengbuAnalysisResponse> {
  const client = getAnthropicClient();
  if (!client) return buildMockResponse(input);

  const completion = await createMessageWithTimeout(
    client,
    {
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: buildSystemPrompt(input.focusMajor),
      messages: [{ role: "user", content: buildUserPrompt(input.text, input.focusMajor) }],
    },
    // 관측 ~30초(out 2048토큰). 긴 생기부(3만자) 대비 90초로 상향 — 헤드룸 부족 시 타임아웃→고장처럼 보이던 문제 방지.
    { timeoutMs: 90_000, upstreamSignal: input.upstreamSignal },
  );

  const rawText = completion.content
    .filter((b) => b.type === "text")
    .map((b) => ("text" in b ? b.text : ""))
    .join("\n");

  const parsed = parseModelOutput(rawText, input.focusMajor);
  if (!parsed) return buildMockResponse(input); // 파싱 실패 → mock 폴백(빈 분석보다 일반론)

  return {
    ...parsed,
    source: "anthropic",
    cached: false,
    usage: {
      inputTokens: completion.usage.input_tokens,
      outputTokens: completion.usage.output_tokens,
    },
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   프롬프트 — JSON 출력 강제 (P-002 + 윤리)
   ═══════════════════════════════════════════════════════════════════════ */

function buildSystemPrompt(focusMajor?: string): string {
  const focusLine = focusMajor
    ? `학생 목표 전공/학과: "${focusMajor}". majorFit 에 이 전공 대비 적합성을 한국어로 평가하라(합격 보장·합격선 수치 금지).`
    : `목표 전공 미지정. majorFit 은 null 로 두고, 전공적합성(majorFit 축)은 일반 기준으로 평가하라.`;

  return `너는 한국 대학 입시 학생부종합전형(학종) 서류 평가를 보조하는 전문가다. 학생의 생활기록부(생기부) 텍스트를 읽고 5개 평가요소를 객관적으로 분석한다. 너의 출력은 학생·학부모가 보는 "참고용 정성 분석"이다.

${focusLine}

평가 5축(axes) — 모두 평가:
- academic(학업역량): 교과 성취·세특에 드러난 학업 충실도·지적 호기심·탐구력
- majorFit(전공적합성/진로역량): 전공 관련 활동·과목 선택·탐구의 깊이와 일관성
- activity(활동·경험): 창의적 체험활동(자율·동아리·진로)의 다양성·지속성·주도성
- community(인성·공동체역량): 행동특성·협업·리더십·나눔·성실성
- growth(발전가능성): 자기주도성·성장 궤적·잠재력

규칙(P-002 정직성 + 윤리 — 반드시 준수):
1. 생기부에 근거가 없는 축은 score=null 로 두고 comment 에 "정보 부족"을 명시한다. 절대 추정으로 점수를 만들지 마라.
2. score 는 0~100 정수의 "역량 루브릭(참고용)"이다. 합격 가능성·합격 확률이 아니다.
3. "확정 합격", "합격 보장", 특정 대학 합격선·등급컷·백분위 수치를 절대 만들지 마라.
4. strengths/weaknesses/recommendations 는 각각 한국어 한 문장(60자 내외).
5. caveats 에는 반드시 "AI 참고 분석이며 실제 합격을 보장하지 않는다", "최종 판단은 전문 컨설팅과 함께하라"는 취지를 포함하라(1~4개).
6. 생기부에 적힌 개인 식별정보(이름·학교명 등)는 분석에 사용하지 말고 출력에도 옮기지 마라.

출력 형식 — 반드시 다음 JSON 만 출력(앞뒤 설명·코드펜스 금지):
{
  "axes": [
    { "axis": "academic", "score": 0~100 또는 null, "comment": "..." },
    { "axis": "majorFit", ... },
    { "axis": "activity", ... },
    { "axis": "community", ... },
    { "axis": "growth", ... }
  ],
  "strengths": ["..."],
  "weaknesses": ["..."],
  "recommendations": ["..."],
  "majorFit": ${focusMajor ? `{ "major": "${focusMajor}", "comment": "..." }` : "null"},
  "caveats": ["..."]
}`;
}

function buildUserPrompt(text: string, focusMajor?: string): string {
  const focus = focusMajor ? `\n[목표 전공] ${focusMajor}\n` : "\n";
  return `아래는 학생의 생활기록부(생기부) 텍스트다. 시스템 프롬프트의 5축 루브릭으로 분석하고 지정된 JSON 만 출력하라.${focus}
[생기부 텍스트 시작]
${text}
[생기부 텍스트 끝]`;
}

/**
 * 모델 출력에서 JSON 추출 — 코드펜스/앞뒤 텍스트 robust. 최종 검증은 라우트의
 * 스키마(또는 호출부)가 담당하므로 여기선 형식만 정규화.
 */
function parseModelOutput(text: string, focusMajor?: string): SaengbuAnalysisCore | null {
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(cleaned.slice(start, end + 1));
    if (!obj || typeof obj !== "object") return null;

    // axes — 5축 순서·형식 정규화. 누락 축은 null score 로 채움(정직).
    const rawAxes: unknown[] = Array.isArray(obj.axes) ? obj.axes : [];
    const byAxis = new Map<string, { score: number | null; comment: string }>();
    for (const a of rawAxes) {
      if (a && typeof a === "object" && typeof (a as { axis?: unknown }).axis === "string") {
        const ax = a as { axis: string; score?: unknown; comment?: unknown };
        const score =
          typeof ax.score === "number" && Number.isFinite(ax.score)
            ? Math.max(0, Math.min(100, Math.round(ax.score)))
            : null;
        const comment = typeof ax.comment === "string" && ax.comment.trim() ? ax.comment.trim().slice(0, 400) : "정보 부족";
        byAxis.set(ax.axis, { score, comment });
      }
    }
    const axes = SAENGBU_AXES.map((axis: SaengbuAxis) => ({
      axis,
      score: byAxis.get(axis)?.score ?? null,
      comment: byAxis.get(axis)?.comment ?? "정보 부족 — 생기부에서 해당 영역 근거를 찾지 못했습니다.",
    }));

    const strList = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && s.trim().length > 0).map((s) => s.trim().slice(0, 200)).slice(0, 5) : [];

    let majorFit: SaengbuAnalysisCore["majorFit"] = null;
    if (focusMajor && obj.majorFit && typeof obj.majorFit === "object") {
      const mf = obj.majorFit as { comment?: unknown };
      if (typeof mf.comment === "string" && mf.comment.trim()) {
        majorFit = { major: focusMajor.slice(0, 60), comment: mf.comment.trim().slice(0, 500) };
      }
    }

    const caveats = strList(obj.caveats).map((c) => c.slice(0, 300));
    if (caveats.length === 0) {
      caveats.push("AI 참고 분석입니다. 실제 합격을 보장하지 않으며, 최종 판단은 전문 컨설팅과 함께하세요.");
    }

    return {
      axes,
      strengths: strList(obj.strengths),
      weaknesses: strList(obj.weaknesses),
      recommendations: strList(obj.recommendations),
      majorFit,
      caveats,
    };
  } catch {
    return null;
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   Mock — Anthropic 키 미등록/CI/테스트. 점수를 지어내지 않는다(P-002).
   ═══════════════════════════════════════════════════════════════════════ */

const AXIS_LABEL: Record<SaengbuAxis, string> = {
  academic: "학업역량",
  majorFit: "전공적합성",
  activity: "활동·경험",
  community: "인성·공동체역량",
  growth: "발전가능성",
};

function buildMockResponse(input: RunInput): SaengbuAnalysisResponse {
  // mock 은 점수를 추정하지 않는다 — 전 축 null + 안내. (실제 분석은 API 키 등록 후)
  const axes = SAENGBU_AXES.map((axis) => ({
    axis,
    score: null,
    comment: `${AXIS_LABEL[axis]} — 현재 Mock 모드(AI 키 미등록)라 점수를 산출하지 않습니다. 추정치를 만들지 않는 정직성 원칙(P-002)에 따른 것입니다.`,
  }));

  return {
    axes,
    strengths: ["생기부 텍스트가 정상 입력되었습니다 (실제 분석은 AI 키 등록 후 제공)."],
    weaknesses: [],
    recommendations: ["운영자에게 ANTHROPIC_API_KEY 등록을 요청하면 실제 5축 분석이 활성화됩니다."],
    majorFit: input.focusMajor
      ? { major: input.focusMajor.slice(0, 60), comment: "Mock 모드 — 목표 전공 적합성은 AI 키 등록 후 평가됩니다." }
      : null,
    caveats: [
      "현재 Mock 응답(ANTHROPIC_API_KEY 미등록)입니다. 점수를 지어내지 않기 위해 전 축을 '정보 부족'으로 둡니다 (P-002).",
      "AI 분석은 참고용이며 실제 합격을 보장하지 않습니다. 최종 판단은 전문 입시 컨설팅과 함께하세요.",
    ],
    source: "mock",
    cached: false,
    usage: { inputTokens: approxTokens(input.text), outputTokens: 128 },
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   유틸
   ═══════════════════════════════════════════════════════════════════════ */

function approxTokens(s: string): number {
  return Math.max(1, Math.ceil(s.length / 4));
}

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
