/**
 * API 입력 검증용 Zod 스키마.
 *
 * 범위:
 *   - Claude API를 호출하는 엔드포인트의 body 검증
 *   - 악성 과대 입력 차단 (토큰·비용·Firestore 쓰기 보호)
 *   - 타입 내로잉 → 하위 코드에서 `as any` 필요 없음
 *
 * 사용법:
 *   const parsed = ProfileSchema.safeParse(body.profile);
 *   if (!parsed.success) return NextResponse.json({ error: ... }, { status: 400 });
 */
import { z } from "zod";

/** 공통: 과대 문자열 차단 — 한국어 100자 ~ 일반 폼 필드 */
const shortStr = z.string().trim().max(200);
/** 에세이 제목·학교명 등 중간 길이 필드 */
const midStr = z.string().trim().max(500);
/** 에세이 본문 — 최대 50KB 상한 (Common App 주 에세이 ~650단어 × 여유).
 *  min(1): 짧은 에세이는 라우트의 UX 핸들러(250자 미만 안내)에 맡긴다. */
const essayBody = z.string().trim().min(1).max(50_000);

/**
 * 학생 프로필 — 모든 숫자형 필드가 문자열로 올 수도 있어 coerce.
 * 옵셔널 필드는 undefined/empty string 양쪽 허용.
 */
export const ProfileSchema = z.object({
  name: shortStr.optional().or(z.literal("")),
  grade: shortStr.optional().or(z.literal("")),
  gpa: z.union([z.coerce.number().min(0).max(4.5), z.literal(""), z.undefined()]).optional(),
  sat: z.union([z.coerce.number().min(400).max(1600), z.literal(""), z.undefined()]).optional(),
  toefl: z.union([z.coerce.number().min(0).max(120), z.literal(""), z.undefined()]).optional(),
  major: shortStr.optional().or(z.literal("")),
  dreamSchool: shortStr.optional().or(z.literal("")),
  highSchool: shortStr.optional().or(z.literal("")),
  schoolType: shortStr.optional().or(z.literal("")),
  clubs: midStr.optional().or(z.literal("")),
  leadership: midStr.optional().or(z.literal("")),
  research: midStr.optional().or(z.literal("")),
  internship: midStr.optional().or(z.literal("")),
  athletics: midStr.optional().or(z.literal("")),
  specialTalent: midStr.optional().or(z.literal("")),
}).passthrough(); // 알려지지 않은 필드는 통과 (새 필드 추가 시 API가 먼저 죽지 않도록)

export const EssayOutlineInputSchema = z.object({
  prompt: z.string().trim().min(1).max(2000),
  university: shortStr.optional(),
  profile: ProfileSchema.optional(),
});

export const SpecAnalysisInputSchema = z.object({
  profile: ProfileSchema,
});

export const StoryInputSchema = z.object({
  school: z.object({
    name: shortStr,
    rank: z.number().optional(),
    prob: z.number().min(0).max(100).optional(),
    cat: shortStr.optional(),
    satRange: z.string().max(20).optional(),
    gpa: z.union([z.number(), z.string().max(20)]).optional(),
    acceptRate: z.union([z.number(), z.string().max(20)]).optional(),
  }).passthrough(),
  specs: z.object({
    gpa: z.union([z.coerce.number().min(0).max(4.5), z.literal(""), z.undefined()]).optional(),
    sat: z.union([z.coerce.number().min(400).max(1600), z.literal(""), z.undefined()]).optional(),
    toefl: z.union([z.coerce.number().min(0).max(120), z.literal(""), z.undefined()]).optional(),
    major: shortStr.optional().or(z.literal("")),
    ecTier: z.union([z.coerce.number().min(1).max(4), z.literal(""), z.undefined()]).optional(),
  }).passthrough(),
});

export const AdmissionDetailInputSchema = z.object({
  school: z.object({
    name: shortStr,
    rank: z.number().optional(),
    acceptRate: z.union([z.number(), z.string()]).optional(),
    satRange: z.string().optional(),
    gpa: z.union([z.number(), z.string()]).optional(),
    prob: z.number().optional(),
    cat: z.string().optional(),
  }).passthrough(),
  profile: ProfileSchema,
});

export const EssayReviewInputSchema = z.object({
  essay: essayBody,
  prompt: z.string().trim().max(2000).optional(),
  university: shortStr.optional(),
  /** schools.json의 n 필드와 매칭되는 학교 식별자 — Elite 대학별 rubric 모드용. */
  universityId: shortStr.optional(),
  grade: shortStr.optional(),
  gpa: z.union([z.coerce.number().min(0).max(4.5), z.literal(""), z.undefined()]).optional(),
  sat: z.union([z.coerce.number().min(400).max(1600), z.literal(""), z.undefined()]).optional(),
  major: shortStr.optional(),
}).passthrough();

/** 유사 합격자 매칭 — Elite는 university 고정 가능, 그 외는 dreamSchool 기반. */
export const SimilarAdmissionInputSchema = z.object({
  profile: ProfileSchema,
  /** 특정 대학 필터. 미지정 시 profile.dreamSchool 자동 사용. */
  university: shortStr.optional(),
  limit: z.coerce.number().int().min(1).max(20).optional(),
});

/** 합격 사례 Elite 분석 — matchId(seed-*) + 유저 프로필 */
export const AdmissionAnalyzeInputSchema = z.object({
  matchId: shortStr,
  profile: ProfileSchema,
});

export const ChatInputSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  history: z.array(z.object({
    role: z.string(),
    content: z.string(),
  }).passthrough()).max(50).optional(),
});

/** 공통 400 응답 빌더 — 첫 번째 검증 실패 메시지를 꺼내 사용자 친화 한국어로. */
export function zodErrorResponse(err: z.ZodError): { error: string } {
  const first = err.issues[0];
  const path = first?.path.join(".") || "입력";
  return { error: `${path} 값이 올바르지 않아요.` };
}
