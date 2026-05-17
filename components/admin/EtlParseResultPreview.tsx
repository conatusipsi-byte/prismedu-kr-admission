"use client";

/**
 * EtlParseResultPreview — admissionsStaging 파싱 결과 미리보기 (Day 10)
 *
 * 표시 항목:
 *   - trustLevel 뱃지 (trusted / trusted-fallback / suspicious 색상별)
 *   - toolChain (어떤 단계에서 성공했는지)
 *   - 학과명 후보 (rawCount 포함)
 *   - 트랙 후보 (matchedKeyword)
 *   - 수능최저 (autoEvaluable / complexity)
 *   - 반영비율 (있으면)
 *   - unparsedSections (운영자 보강용)
 *
 * P-002 정직성:
 *   - suspicious는 강조 (border-rose + 배경 + 안내)
 *   - 자동판정 불가 케이스(complexity=with_required 등)는 명시
 *   - "확정 합격" 표현 0건 (회귀 테스트가 강제)
 */

import * as React from "react";
import { AlertTriangle, CheckCircle2, FileWarning, Info, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { ParsedAdmissionPartial, ParserTrustLevel } from "../../scripts/etl/parsers/types";
import type { CsatMinimum } from "@/types/admission";

const TRUST_LABEL: Record<ParserTrustLevel, string> = {
  trusted: "신뢰 (UTF-8 파싱)",
  "trusted-fallback": "신뢰 (Adobe-Korea1 fallback)",
  suspicious: "검수 필요 (OCR)",
};

const TRUST_TONE: Record<ParserTrustLevel, string> = {
  trusted: "border-brand-300 bg-brand-50 text-brand-800 dark:border-brand-800/40 dark:bg-brand-950/20 dark:text-brand-300",
  "trusted-fallback": "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/15 dark:text-amber-300",
  suspicious: "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/15 dark:text-rose-300",
};

export interface EtlParseResultPreviewProps {
  parsed: ParsedAdmissionPartial;
  toolChain?: string[];
  csatMinimumFinalized?: CsatMinimum | null;
  /** suspicious 컨텍스트에서 강조 박스 자동 노출 */
  className?: string;
}

export function EtlParseResultPreview({
  parsed,
  toolChain = [],
  csatMinimumFinalized,
  className,
}: EtlParseResultPreviewProps): React.ReactElement {
  const isSuspicious = parsed.trustLevel === "suspicious";

  return (
    <div
      data-component="etl-parse-result-preview"
      data-trust-level={parsed.trustLevel}
      className={cn("flex flex-col gap-3", className)}
    >
      {/* trustLevel 뱃지 + toolChain */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={cn("border", TRUST_TONE[parsed.trustLevel])}>
          {parsed.trustLevel === "suspicious" ? (
            <AlertTriangle aria-hidden className="mr-1 h-3 w-3" />
          ) : parsed.trustLevel === "trusted-fallback" ? (
            <Info aria-hidden className="mr-1 h-3 w-3" />
          ) : (
            <CheckCircle2 aria-hidden className="mr-1 h-3 w-3" />
          )}
          {TRUST_LABEL[parsed.trustLevel]}
        </Badge>
        {toolChain.length > 0 && (
          <span data-element="tool-chain" className="text-2xs text-muted-foreground">
            {toolChain.join(" → ")}
          </span>
        )}
      </div>

      {/* suspicious 강조 박스 */}
      {isSuspicious && (
        <div
          data-element="suspicious-warning"
          className="rounded-md border border-rose-300 bg-rose-50 p-3 text-xs text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-200"
        >
          <div className="mb-1 flex items-center gap-1.5 font-semibold">
            <FileWarning aria-hidden className="h-3.5 w-3.5" />
            OCR 추출 결과 — 운영자 검수 필수
          </div>
          <p className="leading-relaxed">
            본 항목은 pdftotext가 한국어 추출에 실패해 Tesseract OCR로 폴백됐습니다.
            추출 텍스트에 인식 오류가 포함될 수 있으니 raw 텍스트와 비교해 직접 보강해주세요.
            승격 전까지 사이트(/admissions)에는 노출되지 않습니다.
          </p>
        </div>
      )}

      {/* 학과명 후보 */}
      <Card>
        <CardContent className="flex flex-col gap-2 py-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold">
            <Layers aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />
            학과명 후보 ({parsed.departmentNameCandidates.length})
          </div>
          {parsed.departmentNameCandidates.length === 0 ? (
            <p className="text-2xs text-muted-foreground">
              자동 추출 실패. 운영자가 직접 입력해주세요.
            </p>
          ) : (
            <ul data-element="department-candidates" className="flex flex-wrap gap-1">
              {parsed.departmentNameCandidates.map((name) => {
                const rawCount = parsed.rawCounts[name] ?? 0;
                return (
                  <Badge key={name} variant="outline" className="text-2xs">
                    {name} <span className="ml-1 text-muted-foreground">×{rawCount}</span>
                  </Badge>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* 트랙 후보 */}
      <Card>
        <CardContent className="flex flex-col gap-2 py-3">
          <div className="text-xs font-semibold">
            트랙 후보 ({parsed.trackKindCandidates.length})
          </div>
          {parsed.trackKindCandidates.length === 0 ? (
            <p className="text-2xs text-muted-foreground">
              자동 추출 실패. 운영자가 직접 선택해주세요.
            </p>
          ) : (
            <ul data-element="track-candidates" className="flex flex-col gap-1 text-2xs">
              {parsed.trackKindCandidates.map((c, i) => (
                <li key={i} className="flex items-center gap-2">
                  <Badge variant="outline" className="text-2xs">{c.kind}</Badge>
                  <span className="text-muted-foreground">매칭: "{c.matchedKeyword}"</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* 수능최저 */}
      {csatMinimumFinalized && (
        <Card>
          <CardContent className="flex flex-col gap-2 py-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              수능최저
              <Badge
                variant="outline"
                data-element="csat-min-complexity"
                data-auto-evaluable={csatMinimumFinalized.autoEvaluable ? "true" : "false"}
                className={cn(
                  "text-2xs",
                  csatMinimumFinalized.autoEvaluable
                    ? "border-brand-300 text-brand-700 dark:border-brand-800/40 dark:text-brand-300"
                    : "border-amber-300 text-amber-700 dark:border-amber-900/40 dark:text-amber-300",
                )}
              >
                {csatMinimumFinalized.complexity}
                {csatMinimumFinalized.autoEvaluable ? " · 자동판정" : " · 수동 확인 필요"}
              </Badge>
            </div>
            <p className="text-2xs">
              {csatMinimumFinalized.requiredCount}개 영역 합 {csatMinimumFinalized.sumGradeMax} 이내
              {csatMinimumFinalized.historyGradeMax != null && `, 한국사 ${csatMinimumFinalized.historyGradeMax}등급 이내`}
              {csatMinimumFinalized.englishGradeMax != null && `, 영어 ${csatMinimumFinalized.englishGradeMax}등급 이내`}
            </p>
            <p className="text-2xs text-muted-foreground">
              원문: {csatMinimumFinalized.originalText}
            </p>
          </CardContent>
        </Card>
      )}

      {/* 반영비율 */}
      {parsed.reflectionRatioPartial && (
        <Card>
          <CardContent className="flex flex-col gap-2 py-3">
            <div className="text-xs font-semibold">반영비율 (정시·논술)</div>
            <p className="text-2xs">
              국 {parsed.reflectionRatioPartial.korean} ·
              수 {parsed.reflectionRatioPartial.math} ·
              영 {parsed.reflectionRatioPartial.english} ·
              탐 {parsed.reflectionRatioPartial.investigation}
            </p>
            <p className="text-2xs text-muted-foreground">
              원문: {parsed.reflectionRatioPartial.originalText}
            </p>
          </CardContent>
        </Card>
      )}

      {/* unparsedSections — 운영자 검수 */}
      {parsed.unparsedSections.length > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-2 py-3">
            <div className="text-xs font-semibold">미파싱 영역 ({parsed.unparsedSections.length})</div>
            <p className="text-2xs text-muted-foreground">
              자동 추출 못 한 200자 이상 단락 — 운영자가 직접 비교·보강하세요.
            </p>
            <details data-element="unparsed-sections">
              <summary className="cursor-pointer text-2xs text-muted-foreground hover:underline">
                펼쳐 보기
              </summary>
              <div className="mt-2 flex flex-col gap-2">
                {parsed.unparsedSections.slice(0, 5).map((s, i) => (
                  <pre
                    key={i}
                    className="whitespace-pre-wrap rounded-md bg-muted p-2 text-2xs leading-relaxed"
                  >
                    {s}
                  </pre>
                ))}
              </div>
            </details>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
