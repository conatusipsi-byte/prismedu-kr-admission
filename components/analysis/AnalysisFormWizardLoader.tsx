"use client";

/**
 * AnalysisFormWizardLoader — /analysis 진입 시 사용자가 온보딩에서 저장한
 * 프로필을 자동 prefill 해서 AnalysisFormWizard 에 주입.
 *
 * 분석 폼 / 온보딩 폼 / 스펙 분석 폼이 같은 BasicInfo·Score·Extra 컴포넌트를
 * 공유하므로, /api/user/specs reverse map 도 공유.
 */

import * as React from "react";
import { Loader2 } from "lucide-react";
import { fetchWithAuth } from "@/lib/api-client";
import {
  AnalysisFormWizard,
  EMPTY_ANALYSIS_FORM,
  type AnalysisFormPayload,
} from "./AnalysisFormWizard";
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
  track?: "humanities" | "natural" | "arts" | null;
  high_school?: { code: string; name: string; region: string } | null;
}

export interface AnalysisFormWizardLoaderProps {
  /** 폼 제출 override — /spec-analysis 등 다른 라우트 호출. 미지정 시 wizard 내부의 /api/match 호출 */
  onSubmit?: (payload: AnalysisFormPayload) => Promise<void> | void;
}

export function AnalysisFormWizardLoader({
  onSubmit,
}: AnalysisFormWizardLoaderProps = {}): React.ReactElement {
  const [initial, setInitial] = React.useState<AnalysisFormPayload | null>(null);
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
        /* 비로그인·네트워크 에러 → 빈 폼으로 진입 (분석 폼은 비로그인도 입력 가능) */
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

  return (
    <AnalysisFormWizard
      initialValue={initial ?? EMPTY_ANALYSIS_FORM}
      onSubmit={onSubmit}
    />
  );
}

function specRowToPayload(row: SpecRow): AnalysisFormPayload {
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
      track: row.track ?? null,
      abroadHighSchool: row.high_school ? "no" : null,
      highSchool: row.high_school ?? null,
    },
    score: { naesin, csat },
    extra: EMPTY_ANALYSIS_FORM.extra,
  };
}
