/**
 * /admin/users — 사용자 관리 (Day 12)
 *
 * master 권한은 admin/layout.tsx 단일 진입점에서 검증.
 */

import type { Metadata } from "next";
import { UsersView } from "./UsersView";
import { adminPageMetadata } from "@/lib/admin-metadata";

// BUG-018: 비-master 접근 시 admin title 누설 차단.
export const generateMetadata = (): Promise<Metadata> =>
  adminPageMetadata("사용자 — admin");

export default function UsersPage(): React.ReactElement {
  return <UsersView />;
}
