/**
 * Anthropic SDK client 싱글톤 + 한국 입시 카운슬러 호출 헬퍼.
 *
 * 책임 분리:
 *   - getAnthropicClient: SDK 인스턴스 (placeholder 키면 null)
 *   - createMessageWithTimeout: AbortController + 타임아웃 보장
 *   - callKrCounselor: 한국 입시 카운슬러 표준 호출 — plan 별 모델 분기 +
 *     ANTHROPIC_API_KEY 미등록 시 mock 분기 + sanitize 후처리 통합
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { MessageCreateParamsNonStreaming, Message } from "@anthropic-ai/sdk/resources/messages";
import {
  sanitizeCounselorResponse,
  type SanitizeResult,
} from "@/lib/admission/counselor-postprocess";
import type { Plan } from "@/lib/plans";

let cached: Anthropic | null | undefined;

export function getAnthropicClient(): Anthropic | null {
  if (cached !== undefined) return cached;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || key === "your_anthropic_api_key_here") {
    cached = null;
    return null;
  }
  // maxRetries: 일시적 408/429/5xx에 대해 지수 백오프로 자동 재시도.
  // timeout: 60s — perfectExample(6000 tok) 생성이 길어질 때 대비.
  cached = new Anthropic({ apiKey: key, maxRetries: 2, timeout: 60_000 });
  return cached;
}

/** 테스트에서 client 캐시 리셋용 — 운영 코드에서 호출 X */
export function __resetAnthropicCacheForTest(): void {
  cached = undefined;
}

/**
 * 요청별 AbortController + 타임아웃으로 감싼 Claude 호출.
 *
 * - SDK 기본 60s timeout에만 의존하면 라우트별로 다른 허용 시간을 걸 수 없고,
 *   client disconnect(유저가 탭 닫음)를 upstream으로 전파할 방법도 없음.
 * - `req.signal`을 넘기면 Next.js가 client abort 시 자동 전파 → 불필요한 토큰 소모 차단.
 * - 타임아웃 초과 시 `ClaudeTimeoutError`를 throw — 라우트가 504/408로 응답하기 쉽게.
 */
export class ClaudeTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Claude request exceeded ${timeoutMs}ms`);
    this.name = "ClaudeTimeoutError";
  }
}

export async function createMessageWithTimeout(
  client: Anthropic,
  params: MessageCreateParamsNonStreaming,
  opts: { timeoutMs: number; upstreamSignal?: AbortSignal },
): Promise<Message> {
  const { timeoutMs, upstreamSignal } = opts;
  const controller = new AbortController();
  let timedOut = false;

  const onUpstreamAbort = () => controller.abort();
  if (upstreamSignal) {
    if (upstreamSignal.aborted) controller.abort();
    else upstreamSignal.addEventListener("abort", onUpstreamAbort, { once: true });
  }

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await client.messages.create(params, { signal: controller.signal });
  } catch (e) {
    if (timedOut) throw new ClaudeTimeoutError(timeoutMs);
    throw e;
  } finally {
    clearTimeout(timer);
    if (upstreamSignal) upstreamSignal.removeEventListener("abort", onUpstreamAbort);
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   callKrCounselor — 한국 입시 카운슬러 표준 호출 (plan 분기 + mock 분기)
   ───────────────────────────────────────────────────────────────────────
   기존 chat 라우트가 인라인으로 처리하던 흐름을 함수 하나로 묶음:
     1. plan 별 모델 결정 (Haiku → Sonnet → Opus 순 비용 증가)
     2. ANTHROPIC_API_KEY 없으면 mock 응답 분기 (개발·CI 환경)
     3. sanitize 후처리 통합 (counselor-postprocess.ts)

   라우트는 buildCounselorSystemPrompt 결과를 systemPrompt로 넘기면 끝.
   sanitize 메트릭 기록은 라우트가 직접 처리 (server-only counselor-metric.ts).
   ═══════════════════════════════════════════════════════════════════════ */

export interface CallKrCounselorInput {
  /** 시스템 프롬프트 — buildCounselorSystemPrompt 결과 그대로 */
  systemPrompt: string;
  /** 대화 히스토리 — 최신 메시지가 마지막 */
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  /** sanitize 컨텍스트 — 표본 부족 학과 정식명 목록 */
  insufficientSampleSchools: string[];
  /** 사용자 plan — 모델·max_tokens 결정 */
  plan: Plan;
  /** 메트릭 키 (선택) */
  uid?: string;
  conversationId?: string;
  /** 라우트가 클라 abort 시 토스 호출 중단 */
  upstreamSignal?: AbortSignal;
  /** 테스트에서 mock 강제 — 운영 코드는 미설정 */
  forceMock?: boolean;
}

export interface CallKrCounselorResult {
  /** sanitize 통과한 최종 응답 텍스트 */
  response: string;
  /** sanitize 결과 — 라우트가 메트릭 기록·UI 배지 표시 */
  sanitizeResult: SanitizeResult;
  /** 토큰 사용량 */
  usage: { inputTokens: number; outputTokens: number };
  /** 응답 출처 — UI/로그에서 mock vs 실 호출 구분 */
  source: "anthropic" | "mock";
  /** 사용된 모델 식별자 */
  model: string;
}

/**
 * Plan 별 Claude 모델 매핑 — 비용·품질 균형.
 *
 * - free  → Haiku 4.5    (저렴, 응답 품질 일반 상담엔 충분)
 * - pro   → Sonnet 4.6   (고급 추론, 학종 전략 같은 다단계 사고)
 * - elite → Opus 4.7     (최고급, 24시간 우선 응답 플랜)
 *
 * 모델 ID는 CLAUDE.md 기준. 모델 deprecation 시 본 함수만 갱신하면 됨.
 */
export function selectCounselorModel(plan: Plan): string {
  if (plan === "elite") return "claude-opus-4-7";
  if (plan === "pro") return "claude-sonnet-4-6";
  return "claude-haiku-4-5-20251001";
}

/** Plan 별 max_tokens — 무료는 짧게, 유료는 길게. */
function selectMaxTokens(plan: Plan): number {
  if (plan === "elite") return 2048;
  if (plan === "pro") return 1536;
  return 1024;
}

/**
 * 카운슬러 호출 — Anthropic 또는 mock.
 *
 * 호출 흐름:
 *   1. forceMock || ANTHROPIC_API_KEY 부재 → buildMockCounselorResponse
 *   2. 그 외 → Claude messages.create (createMessageWithTimeout)
 *   3. sanitize 후처리
 *
 * sanitize 메트릭 기록은 호출자(라우트)가 result.sanitizeResult로 처리.
 */
export async function callKrCounselor(
  input: CallKrCounselorInput,
): Promise<CallKrCounselorResult> {
  const model = selectCounselorModel(input.plan);
  const maxTokens = selectMaxTokens(input.plan);

  const client = input.forceMock ? null : getAnthropicClient();

  if (!client) {
    // Mock 분기 — 개발 / CI / API 키 미등록 환경
    const mock = buildMockCounselorResponse(input);
    const sanitizeResult = sanitizeCounselorResponse(mock.text, {
      insufficientSampleSchools: input.insufficientSampleSchools,
      uid: input.uid,
      conversationId: input.conversationId,
    });
    return {
      response: sanitizeResult.sanitized,
      sanitizeResult,
      usage: mock.usage,
      source: "mock",
      model: `${model}-mock`,
    };
  }

  // 실 Anthropic 호출
  const completion = await createMessageWithTimeout(
    client,
    {
      model,
      max_tokens: maxTokens,
      system: input.systemPrompt,
      messages: input.messages.map((m) => ({ role: m.role, content: m.content })),
    },
    { timeoutMs: 30_000, upstreamSignal: input.upstreamSignal },
  );

  const rawText = completion.content
    .filter((b) => b.type === "text")
    .map((b) => ("text" in b ? b.text : ""))
    .join("\n");

  const sanitizeResult = sanitizeCounselorResponse(rawText, {
    insufficientSampleSchools: input.insufficientSampleSchools,
    uid: input.uid,
    conversationId: input.conversationId,
  });

  return {
    response: sanitizeResult.sanitized,
    sanitizeResult,
    usage: {
      inputTokens: completion.usage.input_tokens,
      outputTokens: completion.usage.output_tokens,
    },
    source: "anthropic",
    model,
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   Mock 응답 — Anthropic API 키 미등록 시
   ───────────────────────────────────────────────────────────────────────
   사용자 요청·표본 부족 컨텍스트별로 시나리오 분기. 정직성 원칙(P-002)을
   mock도 준수해야 함 — "확정 합격" 표현 0건. 단, sanitize 회귀 검증을 위해
   일부 mock은 의도적으로 수치를 포함 (sanitize가 차단하는지 검증).

   회귀 게이트 (lib/__tests__/anthropic-kr.test.ts):
     - 표본 부족 컨텍스트 + 수치 포함 mock → sanitize.triggered=true
     - 일반 컨텍스트 + 수치 mock → triggered=false (정형 답변 정당)
     - 모든 mock에 "확정 합격" 표현 0건
   ═══════════════════════════════════════════════════════════════════════ */

interface MockResponse {
  text: string;
  usage: { inputTokens: number; outputTokens: number };
}

const MOCK_PROBE_KEYWORDS = {
  /** 사용자 메시지에 등장하면 수치 시도형 mock 반환 — sanitize 검증용 */
  numericProbing: ["확률", "합격선", "등급", "백분위", "%", "표준점수", "커트라인", "몇 등급"],
  /** 표본 부족 안내가 자연스러운 키워드 */
  listingProbe: ["가능", "어떤지", "어디", "추천"],
};

const MOCK_NUMERIC_RESPONSES = [
  // ⚠️ 의도적으로 수치 포함 — 표본 부족 컨텍스트면 sanitize가 모두 차단해야 함.
  // 표본 충분 컨텍스트(또는 컨텍스트 없음)면 그대로 노출 — 정형 안내라 정당.
  "이 학과의 일반적인 합격선은 표준점수 280 부근으로 알려져 있어요. 다만 실제 합격은 모집요강과 본인 점수에 따라 달라집니다.",
  "보통 1.5등급 이내가 안정권이라고 하지만, 정확한 수치는 분석 페이지에서 확인하세요.",
];

const MOCK_GUIDANCE_RESPONSES = [
  // 수치 없는 일반론적 가이드 — sanitize 발동 안 함.
  "내신과 수능 균형이 핵심이에요. 학종은 세특·동아리의 전공적합성, 정시는 영역별 반영비를 우선 점검하세요.",
  "수시 6장은 안정·적정·도전을 4:1:1 또는 3:2:1로 구성하는 게 일반적이에요. 본인 강점에 맞는 전형(교과·학종·논술) 1~2개로 좁혀 준비하세요.",
  "정시 변환표는 수능 후 발표돼요. 그 전엔 표준점수와 백분위 기반 가추정만 가능하고, 본 분석은 참고용입니다. 모집요강 확인을 잊지 마세요.",
];

const MOCK_INSUFFICIENT_SAMPLE_RESPONSES = [
  // 표본 부족 학과 컨텍스트 — 일반론만 응답 (P-002 핵심)
  "선택하신 학과는 합격 사례 표본이 누적 중이라 합격 가능성을 정확히 답변드리기 어려워요. 모집요강·전형방법·지원 자격 같은 정형 정보는 학과 상세 페이지에서 확인할 수 있어요.",
  "표본이 더 모이면 분석 페이지에 합격 가능성이 자동으로 표시돼요. 그 전까지는 비슷한 학과의 입결과 본인 강점을 비교해 전략을 세워보시는 걸 추천해요.",
];

function buildMockCounselorResponse(input: CallKrCounselorInput): MockResponse {
  const lastUser = [...input.messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const isNumericProbe = MOCK_PROBE_KEYWORDS.numericProbing.some((k) => lastUser.includes(k));
  const hasInsufficientContext = input.insufficientSampleSchools.length > 0;

  let text: string;
  if (hasInsufficientContext) {
    // 표본 부족 컨텍스트 — 일반론으로 응답 (시스템 프롬프트도 동일하게 강제)
    text = pick(MOCK_INSUFFICIENT_SAMPLE_RESPONSES, lastUser);
  } else if (isNumericProbe) {
    // 수치 시도 질문 — 일부러 수치 포함된 mock 반환 (sanitize 회귀 검증)
    text = pick(MOCK_NUMERIC_RESPONSES, lastUser);
  } else {
    // 그 외 — 일반론 가이드
    text = pick(MOCK_GUIDANCE_RESPONSES, lastUser);
  }

  // 토큰 추정 — 단어 수 기반 단순 근사 (실 호출 usage 형식과 일관)
  const inputTokens = approxTokens(input.systemPrompt + input.messages.map((m) => m.content).join(" "));
  const outputTokens = approxTokens(text);

  return { text, usage: { inputTokens, outputTokens } };
}

/** 결정적 선택 — 같은 입력에 같은 응답 (테스트 안정성). */
function pick<T>(arr: readonly T[], seed: string): T {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const idx = Math.abs(h) % arr.length;
  return arr[idx];
}

/** 영문/한국어 모두 대략 4자/토큰. 토큰 수 정확도가 아닌 형식 일관 목적. */
function approxTokens(s: string): number {
  return Math.max(1, Math.ceil(s.length / 4));
}
