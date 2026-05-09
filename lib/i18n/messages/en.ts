/**
 * English message catalog — fallback locale.
 *
 * Must mirror `ko.ts` key-for-key. Missing keys fall back to ko at runtime
 * (via `t()` helper), but TypeScript enforces shape to catch drift at build time.
 */
import type { Messages } from "./ko";

const messages: Messages = {
  common: {
    cancel: "Cancel",
    confirm: "Confirm",
    save: "Save",
    delete: "Delete",
    retry: "Retry",
    back: "Back",
    next: "Next",
    loading: "Loading...",
    offline: "You're offline",
    offline_hint: "This page can't be loaded without a network connection.",
    home: "Home",
  },
  nav: {
    dashboard: "Home",
    analysis: "Analysis",
    chat: "Counsel",
    essays: "Essays",
    planner: "Planner",
    profile: "Profile",
  },
  landing: {
    title: "PRISM — US College Admissions Manager",
    tagline: "Find the colleges your profile can reach, in 3 seconds",
    cta_start: "Get started",
    feature_prediction: "Admission odds",
    feature_essay: "AI essay review",
    feature_planner: "Admissions planner",
  },
  errors: {
    generic_title: "Something went wrong",
    generic_body: "An unexpected error occurred. Please try again shortly.",
    network_title: "Network error",
    auth_required: "Sign-in required",
  },
};

export default messages;
