/**
 * /admissions/jaeoegukmin — 재외국민·외국인 자격 자가진단 (Launch Blocker #2)
 *
 * P-013: 일반 한국 학생 입시 플로우와 분리. 외국 고교 출신 학생이
 *        일반 분석 폼에서 자격 미충족만 받고 이탈하는 것을 방지.
 *
 * 본 페이지는 Server Component (메타데이터·Hero) + 클라이언트 위임(Wizard·Result).
 */

import type { Metadata } from "next";
import { JaeoegukminEntryHero } from "@/components/admissions/JaeoegukminEntryHero";
import { JaeoegukminPageView } from "./JaeoegukminPageView";

export const metadata: Metadata = {
  title: "재외국민·외국인 입시 자격 진단 — conatusipsi",
  description:
    "외국 고교 출신 학생을 위한 재외국민·외국인·12년 외국교육이수자 전형 자가진단. 자격 분류 후 적합한 대학 안내.",
  openGraph: {
    type: "article",
    locale: "ko_KR",
    title: "재외국민·외국인 입시 자격 진단",
    description: "외국 고교 출신 학생을 위한 자격 자가진단",
  },
  alternates: { canonical: "/admissions/jaeoegukmin" },
  robots: { index: true, follow: true },
};

export default function JaeoegukminPage() {
  return (
    <>
      <JaeoegukminEntryHero />
      <JaeoegukminPageView />
    </>
  );
}
