/**
 * 앱 스토어 다운로드 URL.
 *
 * 출시 시점 Vercel 환경변수에 입력. 미설정 시 "#" fallback —
 * 의도적으로 클릭해도 페이지 이동이 발생하지 않도록 함.
 */
export const APP_STORE_URLS = {
  ios: process.env.NEXT_PUBLIC_APP_STORE_URL || "#",
  android: process.env.NEXT_PUBLIC_PLAY_STORE_URL || "#",
} as const;

export type AppPlatform = "ios" | "android" | "desktop";

/**
 * 단순 UA sniffing — Apple 정책상 모바일 기기는 정확한 스토어로 보내야 함.
 * SSR 환경에서는 "desktop"으로 fallback (서버에는 navigator 없음).
 */
export function detectPlatform(): AppPlatform {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return "ios";
  if (/android/i.test(ua)) return "android";
  return "desktop";
}
