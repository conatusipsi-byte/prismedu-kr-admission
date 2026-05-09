/**
 * 에세이 관련 공용 타입.
 * localStorage 캐시(prism_essays)와 Firestore 서브컬렉션(users/{uid}/essays/{id})의 스키마.
 *
 * 작성/편집: src/app/essays/page.tsx
 * 첨삭:     src/app/essays/review/page.tsx
 */

export interface EssayVersion {
  version: number;
  content: string;
  savedAt: string;   // ISO
  wordCount: number;
}

/** AI 타임머신 에세이 구조의 단일 섹션 (과거/전환점/성장/연결). */
export interface OutlineSection {
  title: string;
  korean_guide: string;
  english_starter: string;
}

/**
 * 레거시 OutlineSection 모양. 과거 API 응답·Firestore 캐시는 hint/starter 필드만 가짐.
 * Firestore에서 읽은 직후 `normalizeOutlineSection`으로 새 모양으로 변환.
 */
type LegacyOutlineSection = Partial<OutlineSection> & {
  title?: string;
  hint?: string;
  starter?: string;
};

function normalizeOutlineSection(raw: unknown): OutlineSection {
  const s = (raw ?? {}) as LegacyOutlineSection;
  return {
    title: s.title ?? "",
    korean_guide: s.korean_guide ?? s.hint ?? "",
    english_starter: s.english_starter ?? s.starter ?? "",
  };
}

export interface EssayOutline {
  past: OutlineSection;
  turning: OutlineSection;
  growth: OutlineSection;
  connection?: OutlineSection;
  /** ISO — 저장 시각. 레거시 outline(필드 없음)도 허용. */
  createdAt?: string;
}

/**
 * Firestore/캐시에서 읽은 outline을 새 스키마(korean_guide/english_starter)로 정규화.
 * 레거시 hint/starter만 가진 데이터도 안전하게 변환. 읽기 경계에서 한 번만 호출하면
 * 이후 컴포넌트는 새 필드만 다루면 된다.
 */
export function normalizeOutline(raw: unknown): EssayOutline | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const past = normalizeOutlineSection(o.past);
  const turning = normalizeOutlineSection(o.turning);
  const growth = normalizeOutlineSection(o.growth);
  // 4개 섹션 중 본문이 하나도 없으면 outline 없는 것으로 간주.
  if (!past.korean_guide && !turning.korean_guide && !growth.korean_guide) {
    return undefined;
  }
  return {
    past,
    turning,
    growth,
    connection: o.connection ? normalizeOutlineSection(o.connection) : undefined,
    createdAt: typeof o.createdAt === "string" ? o.createdAt : undefined,
  };
}

/**
 * 5-axis rubric breakdown — Stage 3 #10에서 추가.
 * SSE 마크다운 모드와 JSON 모드 모두에서 반환. 레거시 리뷰는 undefined로 호환.
 */
export interface EssayRubricScores {
  specificity: number;       // 구체성
  personalVoice: number;     // 개인성
  intellectualDepth: number; // 지적 깊이
  communityFit: number;      // 커뮤니티 적합도
  storytelling: number;      // 스토리텔링
}

export interface EssayReview {
  id: string;
  score: number;            // 1–10
  summary: string;          // 한 줄 요약
  firstImpression: string;  // 입학사정관 첫인상
  tone?: string;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];    // = improvements
  keyChange?: string;
  admissionNote?: string;
  revisedOpening?: string;
  /** 에세이 전체를 10점 수준으로 다시 쓴 버전. 에세이 원어와 동일 언어. */
  perfectExample?: string;
  /** Stage 3 #10 — 5-axis rubric. 레거시 리뷰는 undefined. */
  rubric?: EssayRubricScores;
  createdAt: string;        // ISO

  // --- 대학별 맞춤 rubric (Elite 전용) ---
  /** schools.json의 n 필드와 매칭되는 학교 식별자. 레거시 리뷰는 undefined. */
  universityId?: string;
  universityName?: string;
  /** true면 대학별 rubric 적용된 리뷰. 기본 첨삭은 false/undefined. */
  isUniversityRubric?: boolean;
  universitySpecificFeedback?: string;
  universityFit?: number;   // 0–10
}

export interface Essay {
  id: string;
  university: string;
  prompt: string;
  content: string;
  /** YYYY-MM-DD — UI 표시용 */
  lastSaved: string;
  /** ISO — race resolution용 (동시 편집 시 최신 선택) */
  updatedAt?: string;
  wordLimit?: number;
  versions?: EssayVersion[];
  reviews?: EssayReview[];
  /** AI 타임머신 구조 — 재생성 시 덮어씀. 단일 객체로 관리(리뷰처럼 누적 안 함). */
  outline?: EssayOutline;
}

/**
 * localStorage 캐시용 슬림화.
 *
 * Firestore가 source of truth — localStorage는 첫 paint 가속용 캐시일 뿐이라
 * 무거운 history(versions)는 메타데이터만 남기고 content는 잘라낸다.
 * 이 함수의 출력은 Essay 호환이지만 versions의 content는 빈 문자열.
 *
 * 한도: localStorage는 origin당 ~5MB. 에세이 한 개 본문이 2-5KB지만 versions[]가
 * 최대 10개 누적되면 essay 하나가 50KB → 100개 essay면 5MB 위협.
 */
export function slimEssaysForCache(essays: Essay[]): Essay[] {
  return essays.map((e) => {
    if (!e.versions || e.versions.length === 0) return e;
    // 최근 2개 버전만 본문 유지, 그 외는 메타만 (UI에서 "복원" 시 Firestore에서 풀로딩 가능)
    const trimmed = e.versions.map((v, i, arr) => {
      const isRecent = i >= arr.length - 2;
      return isRecent ? v : { ...v, content: "" };
    });
    return { ...e, versions: trimmed };
  });
}
