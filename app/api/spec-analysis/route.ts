/**
 * POST /api/spec-analysis — 학종 비교과 정성 분석 (Pro/Elite 전용)
 *
 * 자율·동아리·진로·세특·행특 정량 입력 → AI 정성 분석.
 *
 * 흐름:
 *   1. requireAuth + Rate limit (1분 5회 — 분석은 토큰 소모 큼)
 *   2. plan 검사 — featureLimit("specAnalysisEnabled") false 면 403
 *   3. SpecAnalysisRequestSchema 검증
 *   4. Anthropic 호출 (mock fallback) — JSON 출력 강제
 *   5. SpecAnalysisResponseSchema 응답 + 정직성 caveat
 *
 * 정직성 (P-002):
 *   - 입력값 null 영역은 score=null + "정보 부족" comment (추정 X)
 *   - "확정 합격"·수치 단정 표현 차단은 시스템 프롬프트 차원에서 강제
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, zodErrorResponse } from "@/lib/api-auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getAdminDb } from "@/lib/firebase-admin";
import { getAnthropicClient, createMessageWithTimeout } from "@/lib/anthropic";
import { reportRouteError } from "@/lib/sentry-report";
import { canUseFeature, type Plan } from "@/lib/plans";
import {
  SpecAnalysisRequestSchema,
  type SpecAnalysisResponse,
} from "@/lib/schemas/api/spec-analysis";
import type { KrSpecsInput } from "@/lib/schemas/api/match";
import type { UserEntitlement } from "@/types/admission";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1500;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const rateErr = await enforceRateLimit({
    bucket: "spec_analysis",
    uid: auth.uid,
    windowMs: 60_000,
    limit: 5,
  });
  if (rateErr) return rateErr;

  const plan = await loadPlan(auth.uid);
  if (!canUseFeature(plan, "specAnalysisEnabled")) {
    return NextResponse.json(
      { error: "스펙 분석은 Pro 전용 기능입니다.", upgradeUrl: "/pricing" },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "유효하지 않은 JSON 본문" }, { status: 400 });
  }
  const parsed = SpecAnalysisRequestSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const { specs, focusMajor } = parsed.data;

  // 입력 데이터 충분도 사전 체크 — 모든 영역이 null 이면 분석 거절
  const filled = countFilledExtraFields(specs);
  if (filled === 0) {
    return NextResponse.json(
      {
        error:
          "비교과 입력이 비어있습니다. 자율·동아리·진로·세특·행특 중 하나 이상 입력해주세요.",
      },
      { status: 400 },
    );
  }

  try {
    const result = await runSpecAnalysis({
      specs,
      focusMajor,
      upstreamSignal: req.signal,
    });
    return NextResponse.json(result);
  } catch (e) {
    reportRouteError("api.spec-analysis", e, { uid: auth.uid });
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
  specs: KrSpecsInput;
  focusMajor?: string;
  upstreamSignal?: AbortSignal;
}

async function runSpecAnalysis(input: RunInput): Promise<SpecAnalysisResponse> {
  const client = getAnthropicClient();
  if (!client) {
    return buildMockResponse(input);
  }

  const systemPrompt = buildSystemPrompt(input.focusMajor);
  const userPrompt = buildUserPrompt(input.specs);

  const completion = await createMessageWithTimeout(
    client,
    {
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    },
    { timeoutMs: 30_000, upstreamSignal: input.upstreamSignal },
  );

  const rawText = completion.content
    .filter((b) => b.type === "text")
    .map((b) => ("text" in b ? b.text : ""))
    .join("\n");

  const parsed = parseModelOutput(rawText);
  if (!parsed) {
    // 파싱 실패 시 mock 으로 폴백 (사용자에겐 빈 분석보다 일반론이 낫다)
    return buildMockResponse(input);
  }

  return {
    ...parsed,
    source: "anthropic",
    usage: {
      inputTokens: completion.usage.input_tokens,
      outputTokens: completion.usage.output_tokens,
    },
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   프롬프트 — JSON 출력 강제
   ═══════════════════════════════════════════════════════════════════════ */

function buildSystemPrompt(focusMajor?: string): string {
  const focusLine = focusMajor
    ? `학생이 목표하는 전공/학과: ${focusMajor}\n전공 적합도 평가에 이를 반영하라.`
    : `학생이 목표하는 전공이 명시되지 않았다. 일반적 학종 평가 기준으로 분석하라.`;

  return `너는 한국 대학 입시(학생부종합전형) 비교과 정성 평가 전문가다. 학생의 정량 입력값(시간·횟수·수준)만 보고 강·약점을 객관적으로 짚는다.

${focusLine}

평가 영역(activities) — 5개 모두 평가:
- autonomous: 자율활동
- club: 동아리활동 (지속성·전공 연관성·심화도 포함)
- career: 진로활동 (전공 일치도 majorAlignment 1~5 활용)
- detailedAbility: 세특 (entriesCount, majorRelatedCount, qualityScore 1~5)
- behavioralCharacteristics: 행특 (qualityScore 1~5)

규칙(P-002 정직성):
1. 입력 필드가 모두 null 인 영역은 score=null 로 두고 comment 에 "정보 부족"을 명시한다. 추정으로 점수 매기지 마라.
2. score 는 0~100 정수. 상대 평가 아니다 — 절대 기준(시간·횟수·질).
3. "확정 합격" 표현, 특정 대학 합격선 수치를 절대 만들지 마라.
4. 강점/약점/추천은 한국어 한 문장씩(50자 내외).
5. caveats 에는 데이터 한계 또는 일반론적 분석임을 알리는 문구를 1~3개 포함하라.

출력 형식 — 반드시 다음 JSON 만 출력 (앞뒤 설명·코드펜스 금지):
{
  "activities": [
    { "area": "autonomous", "score": 0~100 또는 null, "comment": "..." },
    { "area": "club", ... },
    { "area": "career", ... },
    { "area": "detailedAbility", ... },
    { "area": "behavioralCharacteristics", ... }
  ],
  "strengths": ["...", "..."],
  "weaknesses": ["...", "..."],
  "recommendations": ["...", "..."],
  "caveats": ["..."]
}`;
}

function buildUserPrompt(specs: KrSpecsInput): string {
  const e = specs.extra;
  return `학생 비교과 입력값(정직성: null 은 미입력):

자율(autonomous):
- 활동 시간: ${e.autonomous.hours ?? "null"}h
- 참여 횟수: ${e.autonomous.participationCount ?? "null"}회

동아리(club):
- 활동 시간: ${e.club.hours ?? "null"}h
- 참여 횟수: ${e.club.participationCount ?? "null"}회
- 지속 학년 수: ${e.club.yearsPersistent ?? "null"}년

봉사(volunteering, 참고만):
- 시간: ${e.volunteering.hours ?? "null"}h, 횟수: ${e.volunteering.participationCount ?? "null"}회

진로(career):
- 활동 시간: ${e.career.hours ?? "null"}h
- 참여 횟수: ${e.career.participationCount ?? "null"}회
- 전공 일치도(1~5): ${e.career.majorAlignment ?? "null"}

세특(detailedAbility):
- 기재 항목 수: ${e.detailedAbility.entriesCount ?? "null"}
- 전공 관련 항목 수: ${e.detailedAbility.majorRelatedCount ?? "null"}
- 자가평가 질(1~5): ${e.detailedAbility.qualityScore ?? "null"}

행특(behavioralCharacteristics):
- 자가평가 질(1~5): ${e.behavioralCharacteristics.qualityScore ?? "null"}

학교 유형(schoolType): ${e.schoolType ?? "null"}
학년(gradeLevel): ${specs.basic.gradeLevel}, 계열(track): ${specs.basic.track}

위 입력으로 비교과 정성 분석을 수행하라. 시스템 프롬프트의 JSON 형식만 출력하라.`;
}

/**
 * 모델 응답에서 JSON 추출. 코드펜스/앞뒤 텍스트가 섞여 있어도 robust 하게 파싱.
 * 검증은 SpecAnalysisResponseSchema 가 라우트 레벨에서 수행하므로 여기선 형식만 맞춤.
 */
function parseModelOutput(text: string): Omit<SpecAnalysisResponse, "source" | "usage"> | null {
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
  // 첫 '{' ~ 마지막 '}' 추출
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) return null;
  const slice = cleaned.slice(start, end + 1);
  try {
    const obj = JSON.parse(slice);
    if (!obj || typeof obj !== "object") return null;
    const activities = Array.isArray(obj.activities) ? obj.activities : [];
    const strengths = Array.isArray(obj.strengths) ? obj.strengths.slice(0, 5) : [];
    const weaknesses = Array.isArray(obj.weaknesses) ? obj.weaknesses.slice(0, 5) : [];
    const recommendations = Array.isArray(obj.recommendations)
      ? obj.recommendations.slice(0, 5)
      : [];
    const caveats = Array.isArray(obj.caveats) ? obj.caveats.slice(0, 5) : [];
    return { activities, strengths, weaknesses, recommendations, caveats };
  } catch {
    return null;
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   Mock fallback — Anthropic 키 미등록 시
   ═══════════════════════════════════════════════════════════════════════ */

function buildMockResponse(input: RunInput): SpecAnalysisResponse {
  const e = input.specs.extra;

  const activities: SpecAnalysisResponse["activities"] = [
    buildMockActivity("autonomous", e.autonomous.hours, e.autonomous.participationCount),
    buildMockActivity("club", e.club.hours, e.club.participationCount, e.club.yearsPersistent),
    buildMockCareer(e.career),
    buildMockDetailed(e.detailedAbility),
    buildMockBehavioral(e.behavioralCharacteristics.qualityScore),
  ];

  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const recommendations: string[] = [];

  if ((e.club.yearsPersistent ?? 0) >= 2) {
    strengths.push("동아리 활동을 다년간 지속해 전공 적합성·성실성 측면에서 긍정적입니다.");
  }
  if ((e.career.majorAlignment ?? 0) >= 4) {
    strengths.push("진로 활동이 목표 전공과 잘 정렬되어 학종 서류 평가에 유리합니다.");
  }
  if ((e.detailedAbility.qualityScore ?? 0) <= 2 && (e.detailedAbility.entriesCount ?? 0) > 0) {
    weaknesses.push("세특 기재 항목 수에 비해 자가평가 질이 낮아 면접 대비 보강이 필요합니다.");
  }
  if (e.detailedAbility.entriesCount === null || e.detailedAbility.entriesCount === 0) {
    weaknesses.push("세특 데이터가 부족해 정성 평가가 제한됩니다.");
    recommendations.push("교과 담당 선생님과 상담해 전공 관련 세특 항목을 추가로 채워보세요.");
  }
  if ((e.career.participationCount ?? 0) < 3) {
    recommendations.push("진로 탐색 활동(직업 체험·전문가 강연 등)을 학기당 1회 이상 추가해보세요.");
  }

  if (strengths.length === 0) {
    strengths.push("입력된 비교과가 균형 있게 분포해 있어 추가 보강 시 학종 적합도 향상이 가능합니다.");
  }
  if (weaknesses.length === 0) {
    weaknesses.push("뚜렷한 약점은 보이지 않으나 영역별 심화도 점검이 필요합니다.");
  }
  if (recommendations.length === 0) {
    recommendations.push("현재 활동의 결과물(보고서·발표·후속 탐구)을 학생부에 가시화하세요.");
  }

  const caveats: string[] = [
    "본 분석은 Anthropic API 키 미등록으로 인한 정형 가이드 응답입니다 (P-002).",
    "정량 입력값 기반 일반론이며, 실제 학종 평가는 세특 본문·면접 등 정성 요소가 결정적입니다.",
  ];

  return {
    activities,
    strengths,
    weaknesses,
    recommendations,
    caveats,
    source: "mock",
    usage: { inputTokens: approxTokens(buildUserPrompt(input.specs)), outputTokens: 256 },
  };
}

function buildMockActivity(
  area: "autonomous" | "club",
  hours: number | null,
  count: number | null,
  yearsPersistent?: number | null,
): SpecAnalysisResponse["activities"][number] {
  if (hours === null && count === null && (yearsPersistent ?? null) === null) {
    return {
      area,
      score: null,
      comment: "정보 부족 — 입력값이 모두 비어있어 평가가 불가합니다 (P-002).",
    };
  }
  const baseHours = hours ?? 0;
  const baseCount = count ?? 0;
  const persistBonus = (yearsPersistent ?? 0) * 8;
  const score = Math.min(100, Math.max(0, Math.round(baseHours / 2 + baseCount * 3 + persistBonus)));
  const label = area === "autonomous" ? "자율활동" : "동아리활동";
  return {
    area,
    score,
    comment: `${label} 정량 입력 기반 평가입니다. 시간·횟수만으로는 깊이 평가가 어려우니 활동 결과물을 함께 점검하세요.`,
  };
}

function buildMockCareer(
  career: { hours: number | null; participationCount: number | null; majorAlignment: number | null },
): SpecAnalysisResponse["activities"][number] {
  if (
    career.hours === null &&
    career.participationCount === null &&
    career.majorAlignment === null
  ) {
    return {
      area: "career",
      score: null,
      comment: "정보 부족 — 진로활동 입력이 모두 비어있어 평가가 불가합니다 (P-002).",
    };
  }
  const align = career.majorAlignment ?? 3;
  const baseHours = career.hours ?? 0;
  const baseCount = career.participationCount ?? 0;
  const score = Math.min(100, Math.max(0, Math.round(baseHours / 2 + baseCount * 4 + align * 10)));
  return {
    area: "career",
    score,
    comment: `진로 활동 ${baseCount}회 / 전공 일치도 ${align}/5 기반 평가. 일치도 4 이상이면 학종 가산.`,
  };
}

function buildMockDetailed(
  d: { entriesCount: number | null; majorRelatedCount: number | null; qualityScore: number | null },
): SpecAnalysisResponse["activities"][number] {
  if (d.entriesCount === null && d.majorRelatedCount === null && d.qualityScore === null) {
    return {
      area: "detailedAbility",
      score: null,
      comment: "정보 부족 — 세특 입력이 모두 비어있어 평가가 불가합니다 (P-002).",
    };
  }
  const entries = d.entriesCount ?? 0;
  const relRatio = entries > 0 ? (d.majorRelatedCount ?? 0) / entries : 0;
  const quality = d.qualityScore ?? 3;
  const score = Math.min(100, Math.max(0, Math.round(entries * 4 + relRatio * 30 + quality * 8)));
  return {
    area: "detailedAbility",
    score,
    comment: `세특 ${entries}건 (전공관련 ${d.majorRelatedCount ?? 0}건, 질 ${quality}/5) — 기재량보다 전공 연관 비중이 평가 핵심.`,
  };
}

function buildMockBehavioral(
  qualityScore: number | null,
): SpecAnalysisResponse["activities"][number] {
  if (qualityScore === null) {
    return {
      area: "behavioralCharacteristics",
      score: null,
      comment: "정보 부족 — 행특 자가평가 미입력으로 평가가 불가합니다 (P-002).",
    };
  }
  return {
    area: "behavioralCharacteristics",
    score: Math.min(100, qualityScore * 18),
    comment: `행특 자가평가 ${qualityScore}/5. 행특은 담임의 종합 평가라 자가평가 외 외부 검토가 어렵습니다.`,
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   유틸
   ═══════════════════════════════════════════════════════════════════════ */

function countFilledExtraFields(specs: KrSpecsInput): number {
  const e = specs.extra;
  let n = 0;
  if (e.autonomous.hours !== null || e.autonomous.participationCount !== null) n++;
  if (
    e.club.hours !== null ||
    e.club.participationCount !== null ||
    e.club.yearsPersistent !== null
  ) {
    n++;
  }
  if (
    e.career.hours !== null ||
    e.career.participationCount !== null ||
    e.career.majorAlignment !== null
  ) {
    n++;
  }
  if (
    e.detailedAbility.entriesCount !== null ||
    e.detailedAbility.majorRelatedCount !== null ||
    e.detailedAbility.qualityScore !== null
  ) {
    n++;
  }
  if (e.behavioralCharacteristics.qualityScore !== null) n++;
  return n;
}

function approxTokens(s: string): number {
  return Math.max(1, Math.ceil(s.length / 4));
}

async function loadPlan(uid: string): Promise<Plan> {
  try {
    const db = getAdminDb();
    const snap = await db
      .collection("users").doc(uid)
      .collection("entitlements")
      .doc("current")
      .get();
    if (!snap.exists) return "free";
    return ((snap.data() as UserEntitlement).currentPlan ?? "free") as Plan;
  } catch {
    return "free";
  }
}
