/**
 * Dashboard / Insights / Tools 화면 안의 섹션 식별자 표준화.
 *
 * 섹션 클릭 / 가시화 / 스크롤 깊이 분석 시 자유 문자열 대신 이 union을 강제해
 * GA에서 dimension 일관성을 유지한다. 새 섹션 추가 시 여기에 append.
 */
export const SECTION_IDS = {
  // /dashboard
  HOME_HERO: "home_hero",
  HOME_TODAY_FOCUS: "home_today_focus",
  HOME_LIVE_STATS: "home_live_stats",
  HOME_URGENT_DEADLINE: "home_urgent_deadline",
  HOME_SPEC_CTA: "home_spec_cta",
  HOME_ADMISSION_BANNER: "home_admission_banner",
  HOME_MY_SCHOOLS: "home_my_schools",
  HOME_UPGRADE_NUDGE: "home_upgrade_nudge",

  // /insights
  INSIGHTS_STATS_DISTRIBUTION: "insights_stats_distribution",
  INSIGHTS_LIVE_STATS: "insights_live_stats",
  INSIGHTS_ADMISSION_FEED: "insights_admission_feed",
  INSIGHTS_GROWTH: "insights_growth",

  // /tools
  TOOLS_GRID: "tools_grid",
} as const;

export type SectionId = (typeof SECTION_IDS)[keyof typeof SECTION_IDS];
