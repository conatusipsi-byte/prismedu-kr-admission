/**
 * /profile — 프로필·성적 수정 페이지 (인증 사용자)
 *
 * 사이트맵 §2.3: onboarding 폼 컴포넌트 재사용 (수정 모드).
 * 본 PR 단계에선 wizard로 가는 진입점만 노출하고, 수정·재실행은 /onboarding이
 * 기존 spec을 미리 채워주도록 추후 GET /api/user/specs 본체 PR에서 wiring.
 *
 * robots: noindex.
 */

import type { Metadata } from "next";
import { ProfileView } from "./ProfileView";

export const metadata: Metadata = {
  title: "프로필 — conatusipsi",
  description: "계정·성적·생기부 정보 수정 및 알림 설정",
  robots: { index: false, follow: false },
  alternates: { canonical: "/profile" },
};

export const dynamic = "force-dynamic";

export default function ProfilePage(): React.ReactElement {
  return (
    <div
      data-page="profile"
      className="mx-auto max-w-content-narrow px-gutter-sm md:px-gutter py-6 lg:py-10"
    >
      <ProfileView />
    </div>
  );
}
