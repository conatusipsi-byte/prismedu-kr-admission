/**
 * /admin/sanitize-monitor — 카운슬러 가드 모니터링 (Launch Blocker #3)
 *
 * P-002 정직성 운영 방어선. 출시 시점에 동작 필수.
 *
 * 현재 상태 (준비 중):
 *   - master 권한: app/admin/layout.tsx 의 requireMasterAuthFromHeaders 로 강제됨(가드 정상).
 *   - 데이터: mock-sanitize-events 시연 데이터. 화면 상단에 "준비 중 — Mock" 배너 상시 노출.
 *
 * ⚠️ TODO(P2 범위 밖): Firestore monitoring/sanitizeEvents 연결 → 실 데이터 교체 + 배너 제거.
 *    그 전까지는 mock 배너로 정직하게 "준비 중" 명시(가짜 기능 노출 방지).
 */

import type { Metadata } from "next";
import { SanitizeMonitorView } from "./SanitizeMonitorView";
import { adminPageMetadata } from "@/lib/admin-metadata";

// BUG-018: 비-master 접근 시 admin title 누설 차단.
export const generateMetadata = (): Promise<Metadata> =>
  adminPageMetadata("카운슬러 가드 모니터링 — admin");

export default function SanitizeMonitorPage() {
  return <SanitizeMonitorView />;
}
