"use client";

/**
 * useHaptic — 모바일 햅틱 진동 trigger (navigator.vibrate 기반).
 *
 * 지원:
 *   - Android Chrome / Firefox: ✓
 *   - iOS Safari: ✗ (Apple 정책으로 vibrate API 미지원)
 *   - Capacitor/Cordova WebView: ✓ (네이티브 plugin 별도 호출)
 *   - Desktop: 일반적으로 noop
 *
 * 미지원 환경에서는 silent fallback (에러 없음).
 */

type HapticPattern = "light" | "medium" | "heavy" | "success" | "warning" | "error";

const PATTERNS: Record<HapticPattern, number | number[]> = {
  light: 8,
  medium: 16,
  heavy: 32,
  success: [10, 30, 10],   // tick-tick
  warning: [16, 60, 16],   // 짧은 휴지 후 두 번
  error: [40, 30, 40],     // 강한 두 번
};

let userOptOut = false;
if (typeof window !== "undefined") {
  try {
    userOptOut = localStorage.getItem("prism_haptic") === "off";
  } catch {}
}

export function setHapticEnabled(on: boolean) {
  userOptOut = !on;
  try { localStorage.setItem("prism_haptic", on ? "on" : "off"); } catch {}
}
export function isHapticEnabled() {
  return !userOptOut;
}

/**
 * 단일 햅틱 trigger. 리액트 컴포넌트에서 onClick 등에 그대로 호출.
 *   haptic("success");
 *   haptic("light");
 *
 * 훅 형태가 아니라 모듈 함수 — 어디서나 import해서 즉시 사용.
 */
export function haptic(pattern: HapticPattern = "light") {
  if (typeof navigator === "undefined" || !navigator.vibrate) return;
  if (userOptOut) return;
  // prefers-reduced-motion 환경도 햅틱은 별개 (motion sensitivity ≠ tactile sensitivity).
  // 그러나 예의상 둘 다 줄여 의도하지 않은 자극 최소화.
  try {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    navigator.vibrate(PATTERNS[pattern]);
  } catch {
    // silent fail
  }
}
