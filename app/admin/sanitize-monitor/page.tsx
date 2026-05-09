/**
 * /admin/sanitize-monitor — 카운슬러 가드 모니터링 (Launch Blocker #3)
 *
 * P-002 정직성 운영 방어선. 출시 시점에 동작 필수.
 *
 * 본 PR 단계:
 *   - mock-sanitize-events 데이터로 초기 fetch 시연
 *   - master 권한 검증은 페이지 진입 직후 수행 권장 (현재 stub — 실 구현 시 requireMasterAuth)
 *
 * ⚠️ TODO: Firestore 연결 — 현재는 mock 데이터.
 *    실 구현은 /api/admin/sanitize-monitor 라우트 호출 + master 가드.
 */

import type { Metadata } from "next";
import { SanitizeMonitorView } from "./SanitizeMonitorView";

export const metadata: Metadata = {
  title: "카운슬러 가드 모니터링 — admin",
  robots: { index: false, follow: false }, // 검색 엔진 차단
};

export default function SanitizeMonitorPage() {
  return <SanitizeMonitorView />;
}
