/**
 * 모든 localStorage·sessionStorage 키의 단일 정의처.
 *
 * 이전: 페이지·컴포넌트마다 inline 문자열로 키 정의 → 오타 + 리네임 어려움 + 레거시 키
 * 마이그레이션 누락. 한 곳에 모아 type-safe하게 참조.
 *
 * 명명 규칙: "prism_{domain}[_{subdomain}]"
 *   - 카테고리별 그루핑으로 legacy key cleanup이 명확
 *   - prefix로 시작하는 키는 sessionStorage 전용(동적 생성)
 */

export const STORAGE_KEYS = {
  // 사용자 데이터
  SPECS: "prism_specs",
  SNAPSHOTS: "prism_snapshots",
  ESSAYS: "prism_essays",
  TASKS: "prism_tasks",
  CHAT_HISTORY: "prism_chat_history",
  ANALYSIS_SORT: "prism_analysis_sort",
  ESSAY_REVIEW_DRAFT: "prism_review_draft",
  SPEC_ANALYSIS_CACHE: "prism_spec_analysis",
  WHAT_IF_FOCUS: "prism_what_if_focus",

  // UI 프리퍼런스
  THEME: "prism_theme",
  HAPTIC: "prism_haptic",
  CHIME: "prism_chime",

  // 동의·팝업
  ANALYTICS_CONSENT: "prism_analytics_consent",
  INSTALL_DISMISSED: "prism_install_dismissed",
  LANDING_ONBOARDING_SEEN: "prism_seen_landing_onboarding",
  DASHBOARD_TOUR_SEEN: "prism_dashboard_tour_seen",
} as const;

/** sessionStorage 전용 prefix (동적 키) */
export const STORAGE_PREFIXES = {
  STORY_CACHE: "prism_story_",
  REVEAL_SEEN: "prism_reveal_seen_",
  LOGO_CACHE: "logo_cache_",
  CAMPUS_CACHE: "campus_cache_",
  /** 도구 페이지별 첫-방문 인트로 dismiss 키 — 예: prism_tool_intro_seen_what-if */
  TOOL_INTRO_SEEN: "prism_tool_intro_seen_",
} as const;

/** 마이그레이션 후 cleanup 대상 — 'prism_' 버전업 시 일괄 삭제용 */
export const LEGACY_KEYS = [
  "prism_saved_specs",   // → prism_specs
  "prism_planner",       // → prism_tasks
  "prism_essay_review",  // → prism_essays 서브필드
  "prism_accent",        // 5-color accent 커스터마이즈 제거 (단일 브랜드 정체성)
] as const;

export type StorageKey = typeof STORAGE_KEYS[keyof typeof STORAGE_KEYS];
