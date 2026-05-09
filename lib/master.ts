/**
 * Master account 서버 단일 판정.
 *
 * **서버 전용 모듈.** `MASTER_EMAILS`(NEXT_PUBLIC_ 없음)만 신뢰하므로 클라이언트 번들에
 * 이메일 목록이 포함되지 않는다. 클라이언트는 `/api/auth/session`에서 내려주는
 * `isMaster` 불리언만 참조한다.
 *
 * 미설정 시 마스터 계정 없는 상태 — 일반 유저와 동일 쿼터.
 */

import "server-only";

export const MASTER_EMAILS: readonly string[] = (process.env.MASTER_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function isMasterEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return MASTER_EMAILS.includes(email.toLowerCase());
}
