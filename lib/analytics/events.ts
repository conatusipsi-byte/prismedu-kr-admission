import type { Plan } from "@/lib/plans";
import type { SectionId } from "@/lib/analytics/section-ids";

/**
 * 업그레이드 CTA 진입점 분류 — funnel 분석에서 어느 화면이 전환을 만드는지 추적.
 * 새 위치 추가 시 여기 union을 늘리면 호출처가 타입 강제됨.
 */
export type UpgradeSource =
  | "essay_review"
  | "essay_rubric"
  | "essay_outline"
  | "admission_card"
  | "admission_detail"
  | "what_if"
  | "spec_analysis"
  | "parent_report"
  | "analysis_locked"
  | "dashboard_more_schools"
  | "chat_limit";

/** 대시보드 TodayFocusCard 우선순위 분기 식별자. 추가 시 여기에 append. */
export type TodayFocusType =
  | "due_today"
  | "due_soon"
  | "profile_incomplete"
  | "no_essays"
  | "stale_analysis";

export interface PrismEventPayloads {
  pricing_page_viewed: { plan: Plan };
  upgrade_cta_clicked: { source: UpgradeSource; targetPlan: Plan };
  essay_review_submitted: {
    plan: Plan;
    universityId?: string;
    model: "base" | "elite_rubric";
  };
  essay_review_phase_changed: { from: EssayReviewPhase; to: EssayReviewPhase };
  essay_review_reset: { rubric_score: number | null };
  essay_review_streaming_started: {
    universityId?: string;
    model: "base" | "elite_rubric";
  };
  essay_review_streaming_completed: {
    duration_ms: number;
    output_tokens?: number;
  };
  essay_review_streaming_error: { reason: string };
  essay_review_parse_error_copied: { length: number };
  essay_review_parse_error_downloaded: { length: number };
  admission_detail_viewed: { plan: Plan; matchId: string };
  planner_generated: { plan: Plan; taskCount: number };
  sample_pdf_downloaded: Record<string, never>;
  parent_report_viewed: { plan: Plan; reportType: string };
  parent_token_issued: { plan: "pro" | "elite" };
  parent_token_shared: { method: "web_share" | "clipboard" };
  parent_token_revoked: Record<string, never>;
  parent_view_opened: { plan: "pro" | "elite"; reportType: "basic" | "weekly" };
  today_focus_shown: { type: TodayFocusType };
  today_focus_clicked: { type: TodayFocusType; target: string };
  landing_sample_viewed: Record<string, never>;
  landing_sample_cta_clicked: { target: string };
  landing_section_viewed: { section: LandingSection };
  landing_faq_opened: { question_id: FaqQuestionId };
  pricing_app_download_clicked: {
    platform: "ios" | "android";
    source: "cta_button" | "bottom_section";
  };
  account_delete_requested: Record<string, never>;
  account_delete_confirmed: Record<string, never>;
  insights_page_viewed: { plan: Plan };
  tools_page_viewed: { plan: Plan };
  tools_card_clicked: { tool_id: string; dwell_time_ms: number };
  bottom_nav_clicked: { tab_id: string };
  // Stage 3 #11 Phase 3 — IA analytics polish
  dashboard_section_clicked: { section_id: SectionId; position: number };
  dashboard_scroll_depth: { max_percent: number };
  insights_section_viewed: { section_id: SectionId };
  tools_to_external_route: { tool_id: string; target_route: string };
  bottom_nav_more_opened: { items_visible: string[] };
  ia_funnel_dashboard_to_action: { action: string; click_count: number };
  ia_funnel_dashboard_exit: { exit_route: string; time_on_dashboard_ms: number };
  ia_migration_nudge_shown: Record<string, never>;
  ia_migration_nudge_dismissed: { source: "insights" | "tools" | "main" };
  // Landing onboarding slides
  onboarding_started: { trigger: "first_visit" | "replay" };
  onboarding_slide_viewed: { slide_index: number };
  onboarding_completed: Record<string, never>;
  onboarding_skipped: { at_slide: number };
  onboarding_dismissed: { at_slide: number };
}

export type LandingSection =
  | "trust_signals"
  | "live_stats"
  | "how_it_works"
  | "sample_showcase"
  | "personas"
  | "faq";

export type EssayReviewPhase = "input" | "loading" | "result";

export type FaqQuestionId =
  | "plan_difference"
  | "refund_policy"
  | "ai_accuracy"
  | "privacy"
  | "korea_admissions"
  | "payment";

export type PrismEventName = keyof PrismEventPayloads;

/**
 * Consent-gated GA 이벤트 발사. window.gtag가 없으면 (consent 거부 또는 SSR) no-op.
 * 타입 강제 wrapper로 이벤트 이름·payload 스키마 일치 보장.
 */
export function trackPrismEvent<E extends PrismEventName>(
  name: E,
  params: PrismEventPayloads[E],
): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as { gtag?: (...args: unknown[]) => void };
  if (typeof w.gtag === "function") {
    w.gtag("event", name, params);
  }
}
