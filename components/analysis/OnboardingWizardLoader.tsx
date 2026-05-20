"use client";

/**
 * OnboardingWizardLoader — /onboarding 에서 사용자가 이전에 저장한 입시 프로필을
 * /api/user/specs 로 가져와 OnboardingWizard 에 initialValue 로 주입.
 *
 * 재방문 사용자가 빈 폼에서 처음부터 다시 입력하지 않도록 prefill. track 은
 * user_specs 에 저장되지 않으므로 null 로 시작 (사용자가 재선택).
 */

import * as React from "react";
import { Loader2 } from "lucide-react";
import { fetchWithAuth } from "@/lib/api-client";
import {
  OnboardingWizard,
  EMPTY_ONBOARDING,
  type OnboardingPayload,
} from "./OnboardingWizard";
import type { GradeLevel } from "./BasicInfoStep";
import type { NaesinTermEntry } from "./NaesinGradeInput";
import type { CsatScoreInputValue } from "./CsatScoreInput";
import type { Grade } from "@/types/admission";

interface SpecRow {
  id: string;
  as_of: { schoolYear: 1 | 2 | 3; semester: 1 | 2 };
  school_record: {
    gpaByTerm: Array<{
      schoolYear: 1 | 2 | 3;
      semester: 1 | 2;
      relativeGpa: number;
      absoluteGpa?: number;
      totalUnits?: number;
    }>;
  };
  csat: null | {
    actual: boolean;
    korean: { grade: number; standard?: number; percentile?: number };
    math: { grade: number; standard?: number; percentile?: number };
    english: { grade: number };
    history: { grade: number };
    investigation: Array<{
      course: string;
      type: "social" | "science" | "vocational";
      grade: number;
      standard?: number;
      percentile?: number;
    }>;
  };
}

export function OnboardingWizardLoader(): React.ReactElement {
  const [initial, setInitial] = React.useState<OnboardingPayload | null>(null);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchWithAuth<{ items: SpecRow[] }>("/api/user/specs");
        if (cancelled) return;
        const latest = data.items?.[0];
        setInitial(latest ? specRowToPayload(latest) : null);
      } catch {
        /* 비로그인·네트워크 에러 → 빈 폼으로 진입 */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        저장된 프로필 불러오는 중…
      </div>
    );
  }

  return <OnboardingWizard initialValue={initial ?? EMPTY_ONBOARDING} />;
}

/**
 * user_specs row → OnboardingPayload reverse map.
 *
 * track 은 user_specs 에 미저장이라 null. 사용자가 step 1에서 재선택해야 함
 * (입력 흐름상 빠르게 끝나는 단계라 UX 영향 최소).
 */
function specRowToPayload(row: SpecRow): OnboardingPayload {
  const gradeLevel: GradeLevel =
    row.as_of.schoolYear === 1 ? "high1" : row.as_of.schoolYear === 2 ? "high2" : "high3";

  const naesin: NaesinTermEntry[] = row.school_record.gpaByTerm.map((e) => ({
    schoolYear: e.schoolYear,
    semester: e.semester,
    relativeGpa: e.relativeGpa,
    absoluteGpa: e.absoluteGpa ?? null,
    totalUnits: e.totalUnits ?? null,
  }));

  const csat: CsatScoreInputValue = row.csat
    ? {
        actual: row.csat.actual,
        korean: {
          standard: row.csat.korean.standard ?? null,
          percentile: row.csat.korean.percentile ?? null,
          grade: row.csat.korean.grade as Grade,
          course: null,
        },
        math: {
          standard: row.csat.math.standard ?? null,
          percentile: row.csat.math.percentile ?? null,
          grade: row.csat.math.grade as Grade,
          course: null,
        },
        english: { grade: row.csat.english.grade as Grade },
        history: { grade: row.csat.history.grade as Grade },
        investigation: row.csat.investigation.map((i) => ({
          course: i.course,
          type: i.type,
          grade: i.grade as Grade,
          standard: i.standard ?? null,
          percentile: i.percentile ?? null,
        })),
      }
    : {
        actual: false,
        korean: { standard: null, percentile: null, grade: null, course: null },
        math: { standard: null, percentile: null, grade: null, course: null },
        english: { grade: null },
        history: { grade: null },
        investigation: [],
      };

  return {
    basic: {
      gradeLevel,
      track: null, // user_specs 에 미저장 — 사용자 재선택
      abroadHighSchool: null,
    },
    score: { naesin, csat },
    extra: EMPTY_ONBOARDING.extra,
  };
}
