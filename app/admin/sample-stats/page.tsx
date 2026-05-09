/**
 * /admin/sample-stats — 합격사례 표본 집계 (Day 11 실 구현)
 *
 * master 권한은 admin/layout.tsx 단일 진입점에서 검증.
 */

import type { Metadata } from "next";
import { SampleStatsView } from "./SampleStatsView";

export const metadata: Metadata = {
  title: "표본 집계 — admin",
  robots: { index: false, follow: false },
};

export default function SampleStatsPage(): React.ReactElement {
  return <SampleStatsView />;
}
