/**
 * POST /api/admission-fit — AI 적합도 분석 (Layer 1, Pro 전용)
 *
 * 학생 프로필(최신 분석 스냅샷) + 특정 학과/전형 요구(모집요강 실데이터) → AI 가 적합도
 * 등급(강/중/약 부합) + 강·약점 + 보강 추천 산출. 입결(합격선) 불필요. 합격 "확률" 아님.
 *
 * 비용 통제(최우선):
 *   - 학생이 특정 학과 1개에 대해 명시적으로 요청할 때만 호출 (검색/목록은 AI 0).
 *   - ai-cache: (프로필 + 학과/전형) 동일 재요청 → 0 토큰.
 *   - rate-limit: 분 5 / 일 30. + Pro 게이트. + 키 미등록 시 mock.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, zodErrorResponse } from "@/lib/api-auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getAdminSupabase } from "@/lib/supabase-server";
import { getAnthropicClient, createMessageWithTimeout, ClaudeTimeoutError } from "@/lib/anthropic";
import { makeCacheKey, getCachedResponse, setCachedResponse } from "@/lib/ai-cache";
import { reportRouteError } from "@/lib/sentry-report";
import { canUseFeature, type Plan } from "@/lib/plans";
import { fetchDepartmentDetail } from "@/lib/admission/fetch-detail";
import { normalizeKrSpecs } from "@/lib/matching-kr";
import { evaluateMinReq } from "@/lib/admission/min-req-classifier";
import { TRACK_KIND_LABELS } from "@/lib/admission/labels";
import {
  AdmissionFitRequestSchema,
  AdmissionFitCoreSchema,
  type AdmissionFitCore,
  type AdmissionFitResponse,
} from "@/lib/schemas/api/admission-fit";
import type { KrSpecsInput } from "@/lib/schemas/api/match";
import type { AdmissionTrack, AdmissionTrackKind, CsatMinimum, CsatScore, Grade } from "@/types/admission";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1200;
const CACHE_PREFIX = "admfit_v1";

type CsatMin = AdmissionFitResponse["csatMinimum"];
type Ctx = AdmissionFitResponse["context"];

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const minErr = await enforceRateLimit({ bucket: "admission_fit", uid: auth.uid, windowMs: 60_000, limit: 5 });
  if (minErr) return minErr;
  const dayErr = await enforceRateLimit({ bucket: "admission_fit_daily", uid: auth.uid, windowMs: 86_400_000, limit: 30 });
  if (dayErr) return dayErr;

  const plan = await loadPlan(auth.uid);
  if (!canUseFeature(plan, "specAnalysisEnabled")) {
    return NextResponse.json({ error: "AI 적합도 분석은 Pro 전용 기능입니다.", upgradeUrl: "/pricing" }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "유효하지 않은 JSON 본문" }, { status: 400 }); }
  const parsed = AdmissionFitRequestSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const { universityId, departmentId, trackKind } = parsed.data;

  // 학과/전형 요구 (모집요강 실데이터)
  const detail = await fetchDepartmentDetail(universityId, departmentId);
  if (!detail) return NextResponse.json({ error: "학과를 찾을 수 없습니다." }, { status: 404 });
  const track = (detail.admissions.tracks[trackKind] ?? [])[0];
  if (!track) return NextResponse.json({ error: "해당 전형 정보가 없습니다." }, { status: 404 });

  // 학생 프로필 — 최신 분석 스냅샷 재사용 (없으면 분석 폼 유도)
  const specs = await loadLatestSpecs(auth.uid);
  if (!specs) {
    return NextResponse.json(
      { error: "먼저 합격 분석 폼에서 내신·수능·생기부 정보를 입력해주세요.", actionUrl: "/analysis" },
      { status: 409 },
    );
  }

  const csatMinimum = computeCsatMinStatus(track.csatMinimum, specs);
  const context: Ctx = {
    universityName: detail.university.shortName ?? detail.university.n,
    departmentName: detail.department.name,
    trackKind,
    trackName: track.name,
  };

  // 캐시 — (프로필 + 학과/전형) 동일 시 0 토큰
  const cacheKey = makeCacheKey(CACHE_PREFIX, { specs, universityId, departmentId, trackKind });
  const cached = await getCachedResponse<AdmissionFitCore>(cacheKey);
  if (cached) {
    return NextResponse.json({
      ...cached, csatMinimum, context, source: "anthropic" as const, cached: true,
      usage: { inputTokens: 0, outputTokens: 0 },
    } satisfies AdmissionFitResponse);
  }

  try {
    const { core, source, usage } = await runFit({ specs, track, trackKind, context, csatMinimum, upstreamSignal: req.signal });
    if (source === "anthropic") void setCachedResponse(cacheKey, core);
    return NextResponse.json({ ...core, csatMinimum, context, source, cached: false, usage } satisfies AdmissionFitResponse);
  } catch (e) {
    if (e instanceof ClaudeTimeoutError) {
      reportRouteError("api.admission-fit.timeout", e, { uid: auth.uid });
      return NextResponse.json({ error: "분석이 오래 걸려요. 잠시 후 다시 시도해주세요." }, { status: 504 });
    }
    reportRouteError("api.admission-fit", e, { uid: auth.uid });
    return NextResponse.json({ error: "분석 처리 중 오류가 발생했어요. 잠시 후 다시 시도해주세요." }, { status: 502 });
  }
}

/* ─────────────────────────── 실행 (AI 또는 mock) ─────────────────────────── */

interface RunInput {
  specs: KrSpecsInput;
  track: AdmissionTrack;
  trackKind: AdmissionTrackKind;
  context: Ctx;
  csatMinimum: CsatMin;
  upstreamSignal?: AbortSignal;
}

async function runFit(input: RunInput): Promise<{ core: AdmissionFitCore; source: "anthropic" | "mock"; usage: { inputTokens: number; outputTokens: number } }> {
  const userPrompt = buildUserPrompt(input);
  const client = getAnthropicClient();
  if (!client) {
    return { core: buildMockFit(input), source: "mock", usage: { inputTokens: approxTokens(userPrompt), outputTokens: 220 } };
  }
  const completion = await createMessageWithTimeout(
    client,
    { model: MODEL, max_tokens: MAX_TOKENS, system: buildSystemPrompt(), messages: [{ role: "user", content: userPrompt }] },
    { timeoutMs: 45_000, upstreamSignal: input.upstreamSignal },
  );
  const rawText = completion.content.filter((b) => b.type === "text").map((b) => ("text" in b ? b.text : "")).join("\n");
  const usage = { inputTokens: completion.usage.input_tokens, outputTokens: completion.usage.output_tokens };
  const parsed = parseFit(rawText);
  if (!parsed) return { core: buildMockFit(input), source: "mock", usage };
  return { core: parsed, source: "anthropic", usage };
}

/* ─────────────────────────── 프롬프트 ─────────────────────────── */

function buildSystemPrompt(): string {
  return `너는 한국 대학 입시 "전형 적합도" 평가 전문가다. 학생 프로필과 특정 학과·전형이 강조하는 평가요소(전형방법·반영비율·수능최저·계열)를 비교해, 이 학생이 이 전형이 원하는 것에 얼마나 부합하는지 정성 판단한다.

규칙(정직성 — 반드시):
1. 이것은 "합격 확률/합격선/입결 수치"가 아니다. "전형 요구 대비 적합도"만 판단한다. 확정 합격·합격률 %·등급컷 수치를 절대 만들지 마라.
2. fitTier 는 strong(강한 부합)/moderate(부분 부합)/weak(약한 부합) 중 하나. 근거가 프로필·전형요구에 있어야 한다.
3. 근거가 부족하면 일반론임을 caveats 에 명시한다. 모르는 것을 지어내지 마라.
4. strengths/weaknesses/recommendations 는 각각 한국어 한 문장(60자 내외).
5. caveats 에 "본 분석은 합격을 보장하지 않으며 전형 요구 대비 적합도 참고용"이라는 취지를 1개 이상 포함하라.
6. 수능최저(수능최저학력기준)에 대해서는 아래 입력의 "수능최저: …(status=…)" 시스템 판정값만 근거로 한다. 충족/미충족이라는 정성적 사실만 언급하고, 등급합 등 구체 수치를 직접 계산·재서술하지 마라(임의 숫자 금지). 프로필의 "수능 성적 참고" 등급합은 일반 참고치로 수능최저 기준 등급합과 다르니, 두 값을 혼동해 인용하지 마라.

출력 — 다음 JSON 만(앞뒤 설명·코드펜스 금지):
{"fitTier":"strong|moderate|weak","summary":"...","strengths":["..."],"weaknesses":["..."],"recommendations":["..."],"caveats":["..."]}`;
}

function buildUserPrompt(input: RunInput): string {
  const n = normalizeKrSpecs(input.specs);
  const t = input.track;
  const stages = (t.stages ?? [])
    .map((s) => `${s.step}단계 ${Object.entries(s.components ?? {}).map(([k, v]) => `${k} ${v}`).join("/")}${s.multiplier ? ` (${s.multiplier}배수)` : ""}`)
    .join(" → ");
  return `[지원 전형]
대학·학과: ${input.context.universityName} ${input.context.departmentName}
전형: ${input.context.trackName} (${TRACK_KIND_LABELS[input.trackKind]}) · 계열 ${input.specs.basic.track}
전형방법(반영): ${stages || "정보 없음"}
수능최저: ${input.csatMinimum.note} (status=${input.csatMinimum.status})

[학생 프로필] (null=미입력)
내신 평균등급: ${fmt(n.naesinGpa)}
수능 성적 참고(일반 참고치 — 위 '수능최저' 시스템 판정과 별개, 혼동 금지): 등급합(국·수·탐) ${fmt(n.csatGradeSum)} / 영어 등급 ${fmt(n.englishGrade)} / 표준점수 평균 ${fmt(n.csatStdAvg)}
비교과 종합점수(0~12): ${fmt(n.extraScore)}

위 전형이 강조하는 요소(교과=내신, 학종=생기부/비교과·세특, 논술=논술+수능최저, 정시=수능) 대비
학생 프로필의 적합도를 판단하라. 시스템 프롬프트의 JSON 만 출력하라.`;
}

function fmt(v: number | null): string {
  return v == null ? "null" : String(Math.round(v * 10) / 10);
}

/* ─────────────────────────── 파싱 ─────────────────────────── */

function parseFit(text: string): AdmissionFitCore | null {
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(cleaned.slice(start, end + 1));
    const r = AdmissionFitCoreSchema.safeParse(obj);
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

/* ─────────────────────────── Mock (키 미등록/파싱 실패) ─────────────────────────── */

function buildMockFit(input: RunInput): AdmissionFitCore {
  const n = normalizeKrSpecs(input.specs);
  // 입결 없이 전형유형 정렬 + 입력 충실도로 보수적 tier. (점수 추정 X)
  const hasNaesin = n.naesinGpa != null;
  const hasExtra = n.extraScore != null;
  const tier: AdmissionFitCore["fitTier"] = hasNaesin && hasExtra ? "moderate" : "weak";
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const recommendations: string[] = [];
  if (hasNaesin) strengths.push("내신 정보가 입력되어 교과 중심 전형 적합도 판단의 기초가 마련됐습니다.");
  if (input.trackKind === "susi_comprehensive" && !hasExtra) {
    weaknesses.push("학종은 생기부·비교과가 핵심인데 비교과 입력이 부족합니다.");
    recommendations.push("생기부 AI 분석으로 세특·창체 적합도를 먼저 점검해보세요.");
  }
  if (input.csatMinimum.status === "not_met") {
    weaknesses.push("이 전형의 수능최저 기준을 현재 성적으로는 충족하지 못합니다.");
  }
  if (strengths.length === 0) strengths.push("프로필 입력을 보강하면 더 정확한 적합도 판단이 가능합니다.");
  if (weaknesses.length === 0) weaknesses.push("뚜렷한 약점은 보이지 않으나 전형별 핵심요소 점검이 필요합니다.");
  if (recommendations.length === 0) recommendations.push("이 전형이 강조하는 요소(반영비율)에 맞춰 강점 영역을 부각하세요.");
  return {
    fitTier: tier,
    summary: "현재 Mock 모드(AI 키 미등록)라 정형 가이드로 적합도를 안내합니다. 키 등록 시 프로필 기반 정밀 판단이 활성화됩니다.",
    strengths,
    weaknesses,
    recommendations,
    caveats: [
      "본 분석은 AI 키 미등록 상태의 정형 응답입니다 (정직성 P-002).",
      "합격을 보장하지 않으며, 전형 요구 대비 적합도 참고용입니다.",
    ],
  };
}

/* ─────────────────────────── 유틸 ─────────────────────────── */

function computeCsatMinStatus(min: CsatMinimum | undefined, specs: KrSpecsInput): CsatMin {
  if (!min) return { status: "none", note: "이 전형은 수능최저학력기준을 적용하지 않습니다." };
  if (!min.autoEvaluable) return { status: "complex", note: "수능최저 기준이 복잡해 자동 판정하지 않습니다 — 모집요강 원문 확인." };
  const csat = specsToCsat(specs);
  const r = evaluateMinReq(min, csat);
  if (!r.evaluable) return { status: "unknown", note: "수능 성적을 입력하면 충족 여부를 판정합니다." };
  if (r.met) return { status: "met", note: `수능최저 충족 (상위 ${min.requiredCount}개 합 ${r.sumGrade}등급 ≤ ${min.sumGradeMax})` };
  return { status: "not_met", note: "수능최저 미충족 — 기준 등급 합을 초과합니다." };
}

function specsToCsat(specs: KrSpecsInput): CsatScore | undefined {
  const c = specs.score.csat;
  if (c.korean.grade == null && c.math.grade == null && c.english.grade == null) return undefined;
  return {
    actual: c.actual,
    takenAt: "",
    korean: { grade: c.korean.grade as Grade, course: c.korean.course ?? undefined },
    math: { grade: c.math.grade as Grade, course: c.math.course ?? undefined },
    english: { grade: c.english.grade as Grade },
    history: { grade: c.history.grade as Grade },
    investigation: c.investigation.map((i) => ({ grade: i.grade as Grade, course: i.course, type: i.type })),
  } as CsatScore;
}

function approxTokens(s: string): number {
  return Math.max(1, Math.ceil(s.length / 4));
}

async function loadLatestSpecs(uid: string): Promise<KrSpecsInput | null> {
  try {
    const sb = getAdminSupabase();
    const { data } = await sb
      .from("matches")
      .select("specs_snapshot")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const snap = (data as { specs_snapshot: KrSpecsInput | null } | null)?.specs_snapshot ?? null;
    return snap && snap.basic ? snap : null;
  } catch {
    return null;
  }
}

async function loadPlan(uid: string): Promise<Plan> {
  try {
    const sb = getAdminSupabase();
    const { data, error } = await sb.from("user_entitlements").select("current_plan").eq("user_id", uid).maybeSingle();
    if (error || !data) return "free";
    return ((data as { current_plan: string }).current_plan as Plan) ?? "free";
  } catch {
    return "free";
  }
}
