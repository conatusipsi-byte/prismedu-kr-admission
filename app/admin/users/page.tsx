/**
 * /admin/users — 사용자 관리 (Day 12)
 *
 * master 권한은 admin/layout.tsx 단일 진입점에서 검증.
 */

import type { Metadata } from "next";
import { UsersView } from "./UsersView";

export const metadata: Metadata = {
  title: "사용자 — admin",
  robots: { index: false, follow: false },
};

export default function UsersPage(): React.ReactElement {
  return <UsersView />;
}
