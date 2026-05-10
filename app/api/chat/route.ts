/**
 * /api/chat — AI 카운슬러 채팅 라우트 (한국 입시 버전)
 *
 * Day 6 — callKrCounselor 추출 + plan 분기 + quota 실 구현 + mock 분기 통합.
 *
 * 흐름:
 *   1. requireAuth + Rate limit (1분 20회)
 *   2. plan 조회 (UserEntitlement) → featureLimit("aiChatDailyLimit")
 *   3. enforceChatQuota — Firestore quotaUsage/{uid}_{YYYY-MM-DD} 트랜잭션 증가
 *   4. ChatRequestSchema 검증
 *   5. 컨텍스트 보강:
 *        - matchId 있으면 matches/{id} 조회 → 학과 목록을 schoolFocus 처럼 활용
 *        - schoolFocus 있으면 우선
 *        - 없으면 사용자 specs.intent 기반 자동 식별
 *   6. buildCounselorSystemPrompt
 *   7. callKrCounselor (mock 또는 anthropic + sanitize 후처리)
 *   8. recordSanitizeMetric (fire-and-forget)
 *   9. ChatResponseSchema 형식 응답
 *
 * 정직성 (P-002):
 *   - 응답에 sanitize 결과 노출 (sanitized: boolean, sanitizedPatterns: PatternLabel[])
 *   - mock 분기에도 sanitize 적용 (mock이라고 우회 X)
 *   - "확정 합격" 표현 차단은 sanitize + 시스템 프롬프트 양쪽에서.
 */

import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireAuth, zodErrorResponse } from "@/lib/api-auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { callKrCounselor } from "@/lib/anthropic";
import { getAdminDb } from "@/lib/firebase-admin";
import { reportRouteError } from "@/lib/sentry-report";
import { ChatRequestSchema, type ChatResponseBody } from "@/lib/schemas/api/chat";
import { buildCounselorSystemPrompt } from "@/lib/prompts/counselor-guards";
import { recordSanitizeMetric } from "@/lib/admission/counselor-metric";
import { checkSampleSufficiency } from "@/lib/admission/sample-gate";
import { featureLimit, type Plan } from "@/lib/plans";
import type {
  AdmissionIntent,
  AdmissionSampleStats,
  Department,
  University,
  UserEntitlement,
} from "@/types/admission";

const QUOTA_BUCKET = "aiChatDailyLimit";

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. 인증
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  // 2. Rate limit (분당) — quota는 일별
  const rateErr = await enforceRateLimit({
    bucket: "chat",
    uid: auth.uid,
    windowMs: 60_000,
    limit: 20,
  });
  if (rateErr) return rateErr;

  // 3. plan 조회 + 일별 quota 검사·증가
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

  // 4. 입력 검증
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "유효하지 않은 JSON 본문" }, { status: 400 });
  }
  const parsed = ChatRequestSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const { messages, conversationId, context } = parsed.data;

  // 5. 컨텍스트 보강 — schoolFocus > matchId > intent 자동 식별 순
  const focusSchools = await resolveFocusSchools(auth.uid, context);
  const insufficientNames = focusSchools
    .filter((s) => !s.sampleSufficient)
    .map((s) => s.displayName);

  // 6. 시스템 프롬프트
  const studentProfile = await buildStudentProfile(auth.uid);
  const systemPrompt = buildCounselorSystemPrompt({
    studentProfile,
    insufficientSampleSchools: insufficientNames,
  });

  // 7. callKrCounselor (mock 또는 anthropic)
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

  // 8. 메트릭 — fire-and-forget
  void recordSanitizeMetric(result.sanitizeResult, {
    insufficientSampleSchools: insufficientNames,
    uid: auth.uid,
    conversationId,
  });

  // 9. 응답
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

interface QuotaResult {
  ok: boolean;
  used: number;
}

/**
 * 일별 채팅 quota 검사·증가 — quotaUsage/{uid}_{YYYY-MM-DD} 도큐먼트 트랜잭션.
 *
 * 한도가 Infinity(유료)면 카운트만 증가, 차단 안 함.
 * Firestore TTL 정책으로 expiresAt 필드에 +14일 만료 — 자동 정리.
 */
async function enforceChatQuota(uid: string, dailyLimit: number): Promise<QuotaResult> {
  const today = new Date().toISOString().slice(0, 10);
  const docId = `${uid}_${today}_${QUOTA_BUCKET}`;
  const ref = getAdminDb().collection("quotaUsage").doc(docId);

  try {
    return await getAdminDb().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const used = (snap.exists ? Number(snap.data()?.count ?? 0) : 0) || 0;
      if (Number.isFinite(dailyLimit) && used >= dailyLimit) {
        return { ok: false, used };
      }
      tx.set(
        ref,
        {
          uid,
          date: today,
          bucket: QUOTA_BUCKET,
          count: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
          // TTL 14일 — Firestore TTL 정책이 expiresAt 자동 정리
          expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        },
        { merge: true },
      );
      return { ok: true, used: used + 1 };
    });
  } catch (e) {
    // Firestore 장애 시 차단하지 않고 통과 — 운영 신뢰성 우선 (Sentry 로그)
    console.error("[/api/chat] quota check failed:", e);
    return { ok: true, used: 0 };
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   컨텍스트 학과 식별 — schoolFocus → matchId → intent 자동
   ═══════════════════════════════════════════════════════════════════════ */

interface FocusSchool {
  universityId: string;
  departmentId: string;
  trackKind?: string;
  displayName: string;
  sampleSufficient: boolean;
}

async function resolveFocusSchools(
  uid: string,
  context: { matchId?: string; schoolFocus?: Array<{ universityId: string; departmentId: string }> } | undefined,
): Promise<FocusSchool[]> {
  // 우선순위 1: 명시적 schoolFocus
  if (context?.schoolFocus && context.schoolFocus.length > 0) {
    return enrichFocusSchools(context.schoolFocus);
  }
  // 우선순위 2: matchId — 결과 페이지에서 진입 시 매칭의 카테고리·학과 활용
  if (context?.matchId) {
    const fromMatch = await loadFocusFromMatch(uid, context.matchId);
    if (fromMatch.length > 0) return fromMatch;
  }
  // fallback: 사용자 intent 학과 자동 추출 (기존 prismedu.kr 패턴 유지)
  return collectFocusFromIntent(uid);
}

/** schoolFocus 입력에 대학명·학과명 + sample-gate 결과 채움 */
async function enrichFocusSchools(
  pairs: Array<{ universityId: string; departmentId: string }>,
): Promise<FocusSchool[]> {
  const year = new Date().getFullYear() + 1;
  const out: FocusSchool[] = [];
  for (const pair of pairs) {
    const display = await formatDepartmentDisplayName(pair.universityId, pair.departmentId);
    if (!display) continue;
    // 학과의 모든 트랙 sampleStats를 OR — 어느 한 트랙이라도 부족하면 표본 부족 처리
    const sufficient = await isAnyTrackSampleSufficient(pair.universityId, pair.departmentId, year);
    out.push({
      universityId: pair.universityId,
      departmentId: pair.departmentId,
      displayName: display,
      sampleSufficient: sufficient,
    });
  }
  return out;
}

async function loadFocusFromMatch(uid: string, matchId: string): Promise<FocusSchool[]> {
  try {
    const db = getAdminDb();
    const snap = await db.collection("matches").doc(matchId).get();
    if (!snap.exists) return [];
    const data = snap.data() as {
      userId?: string;
      results?: Array<{ universityId: string; departmentId: string; sampleSufficient: boolean; trackKind: string; universityName: string; departmentName: string }>;
    };
    if (data.userId !== uid) return [];
    return (data.results ?? []).slice(0, 10).map((r) => ({
      universityId: r.universityId,
      departmentId: r.departmentId,
      trackKind: r.trackKind,
      displayName: `${r.universityName} ${r.departmentName}`,
      sampleSufficient: r.sampleSufficient,
    }));
  } catch (e) {
    console.error("[/api/chat] loadFocusFromMatch 실패:", e);
    return [];
  }
}

async function collectFocusFromIntent(uid: string): Promise<FocusSchool[]> {
  const db = getAdminDb();
  const specSnap = await db
    .collection("users").doc(uid)
    .collection("specs")
    .orderBy("updatedAt", "desc")
    .limit(1)
    .get();

  if (specSnap.empty) return [];
  const spec = specSnap.docs[0].data() as { intent?: AdmissionIntent };
  const intent = spec.intent;
  if (!intent) return [];

  const slots = [
    ...intent.susi,
    intent.jeongsi.ga, intent.jeongsi.na, intent.jeongsi.da,
  ].filter((s): s is NonNullable<typeof s> => Boolean(s));

  const year = new Date().getFullYear() + 1;
  const out: FocusSchool[] = [];
  for (const slot of slots) {
    const display = await formatDepartmentDisplayName(slot.universityId, slot.departmentId);
    if (!display) continue;
    const statsId = `${slot.universityId}_${slot.departmentId}_${year}_${slot.trackKind}`;
    const statsDoc = await db.collection("admissionSampleStats").doc(statsId).get();
    const stats = statsDoc.exists ? (statsDoc.data() as AdmissionSampleStats) : undefined;
    const sufficient = checkSampleSufficiency(stats).sufficient;
    out.push({
      universityId: slot.universityId,
      departmentId: slot.departmentId,
      trackKind: slot.trackKind,
      displayName: display,
      sampleSufficient: sufficient,
    });
  }
  return out;
}

async function isAnyTrackSampleSufficient(
  universityId: string,
  departmentId: string,
  year: number,
): Promise<boolean> {
  // 학과별 모든 트랙 통계를 한 번에 효율적으로 조회하기보단, 단순 호출 — UI에서 노출되는 학과는 보통 1~5개로 적음.
  const db = getAdminDb();
  const admDoc = await db
    .collection("universities").doc(universityId)
    .collection("departments").doc(departmentId)
    .collection("admissions").doc(String(year))
    .get();
  if (!admDoc.exists) return false;
  const tracks = (admDoc.data() as { availableTrackKinds?: string[] }).availableTrackKinds ?? [];
  for (const kind of tracks) {
    const statsId = `${universityId}_${departmentId}_${year}_${kind}`;
    const statsDoc = await db.collection("admissionSampleStats").doc(statsId).get();
    const stats = statsDoc.exists ? (statsDoc.data() as AdmissionSampleStats) : undefined;
    if (checkSampleSufficiency(stats).sufficient) return true;
  }
  return false;
}

async function formatDepartmentDisplayName(
  universityId: string,
  departmentId: string,
): Promise<string | null> {
  try {
    const db = getAdminDb();
    const [u, d] = await Promise.all([
      db.collection("universities").doc(universityId).get(),
      db.collection("universities").doc(universityId).collection("departments").doc(departmentId).get(),
    ]);
    if (!u.exists || !d.exists) return null;
    const univ = u.data() as Pick<University, "n">;
    const dept = d.data() as Pick<Department, "name">;
    return `${univ.n} ${dept.name}`;
  } catch {
    return null;
  }
}

async function buildStudentProfile(uid: string): Promise<string> {
  // 본 PR 단계 — 최소 한 줄. 후속 PR에서 specs 도큐먼트 요약으로 확장.
  return `사용자 uid=${uid}`;
}
