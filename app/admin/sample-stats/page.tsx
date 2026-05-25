/**
 * /admin/sample-stats — 합격사례 표본 집계 (Day 11 실 구현)
 *
 * master 권한은 admin/layout.tsx 단일 진입점에서 검증.
 */

import type { Metadata } from "next";
import { SampleStatsView } from "./SampleStatsView";
import { adminPageMetadata } from "@/lib/admin-metadata";

// BUG-018: 비-master 접근 시 admin title 누설 차단.
export const generateMetadata = (): Promise<Metadata> =>
  adminPageMetadata("표본 집계 — admin");

export default function SampleStatsPage(): React.ReactElement {
  return <SampleStatsView />;
}
