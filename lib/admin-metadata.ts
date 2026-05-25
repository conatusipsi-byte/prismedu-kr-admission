/**
 * /admin/* metadata 위장 헬퍼 (BUG-018, 2026-05-25).
 *
 * 인증된 비-master 사용자가 admin 경로 접근 시:
 *   - 본문: `/admin/layout.tsx` 가 `notFound()` 호출 → root not-found 렌더
 *   - metadata: 본 헬퍼가 동일한 404 metadata 반환 → <title> 누설 차단
 *
 * 미인증 사용자는 middleware 단계에서 홈으로 redirect (HTML 응답 X). 본 헬퍼는
 * 인증된 비-master 케이스 (정찰 공격 표적) 를 차단.
 *
 * 정직성 (P-002):
 *   - admin 경로 존재 자체 비공개 (404 위장)
 *   - master 사용자만 실제 title 노출
 */

import "server-only";
import type { Metadata } from "next";
import { requireMasterAuthFromHeaders } from "@/lib/api-auth";

/** root not-found.tsx 의 metadata 와 정확히 동일. 비-master 응답에 사용. */
const DISGUISED_404_METADATA: Metadata = {
  title: "페이지를 찾을 수 없어요 — Conatus",
  robots: { index: false, follow: false },
};

/**
 * admin 페이지의 generateMetadata 에서 호출.
 *
 *   export const generateMetadata = () =>
 *     adminPageMetadata("컨설팅 예약 관리 — 운영 콘솔");
 */
export async function adminPageMetadata(realTitle: string): Promise<Metadata> {
  try {
    const auth = await requireMasterAuthFromHeaders();
    if (!auth.ok) return DISGUISED_404_METADATA;
  } catch {
    // 인증 검증 중 예외 → 안전 방향 (위장)
    return DISGUISED_404_METADATA;
  }
  return {
    title: realTitle,
    robots: { index: false, follow: false },
  };
}
