"use client";

/**
 * ChatContextBadge — 현재 챗 컨텍스트 표시 (Day 8: 변경 버튼 추가)
 *
 * 진입 경로별:
 *   - matchId 있음: "분석 결과 기반 상담" + 매칭 학과 N개 칩
 *   - schoolFocus 있음: 학과 N개 칩 (최대 5)
 *   - 둘 다 없음: "일반 상담 모드"
 *
 * 표본 부족 학과 포함 시: 별도 안내 박스 — "일반론적 답변만 가능합니다"
 *
 * onChangeRequested prop 있으면 "변경" 버튼 노출 → 부모(ChatInterface)가
 * ChatContextDialog 열기.
 */

import * as React from "react";
import { GraduationCap, Info, Settings2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface ChatContextDept {
  universityId: string;
  departmentId: string;
  /** 사용자 노출 라벨 (e.g., "연세대학교 경영학과") */
  displayName: string;
  /** sample-gate 결과 — false면 표본 부족 안내 */
  sampleSufficient: boolean;
}

export interface ChatContextBadgeProps {
  /** 분석 결과 기반 진입 시 matchId */
  matchId?: string;
  /** 컨텍스트 학과 (matchId 또는 schoolFocus 또는 자동 추출) */
  contextSchools?: ChatContextDept[];
  /** "변경" 버튼 클릭 콜백 — 부모(ChatInterface)가 ChatContextDialog 열기 */
  onChangeRequested?: () => void;
  className?: string;
}

export function ChatContextBadge({
  matchId,
  contextSchools = [],
  onChangeRequested,
  className,
}: ChatContextBadgeProps): React.ReactElement {
  const insufficient = contextSchools.filter((s) => !s.sampleSufficient);
  const hasContext = !!matchId || contextSchools.length > 0;

  return (
    <div
      data-component="chat-context-badge"
      data-mode={matchId ? "match" : contextSchools.length > 0 ? "school-focus" : "general"}
      className={cn(
        "flex flex-col gap-2 rounded-lg border border-brand-200 bg-brand-50/40 p-3 dark:border-brand-900/40 dark:bg-brand-950/15",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-brand-800 dark:text-brand-200">
          {matchId ? (
            <>
              <Sparkles aria-hidden className="h-3.5 w-3.5" />
              분석 결과 기반 상담
            </>
          ) : contextSchools.length > 0 ? (
            <>
              <GraduationCap aria-hidden className="h-3.5 w-3.5" />
              학과 {contextSchools.length}개 컨텍스트
            </>
          ) : (
            <>
              <Sparkles aria-hidden className="h-3.5 w-3.5" />
              일반 상담 모드
            </>
          )}
        </div>
        {onChangeRequested && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onChangeRequested}
            className="h-7 px-2 text-2xs text-brand-800 hover:text-brand-900 dark:text-brand-200"
            data-testid="chat-context-change-trigger"
          >
            <Settings2 aria-hidden className="mr-0.5 h-3 w-3" />
            변경
          </Button>
        )}
      </div>

      {!hasContext && (
        <p className="text-2xs text-muted-foreground">
          학과를 지정하지 않은 일반 입시 상담입니다. 분석 결과 페이지에서 진입하면 학과별
          맞춤 답변이 가능해요.
        </p>
      )}

      {contextSchools.length > 0 && (
        <div data-element="context-schools" className="flex flex-wrap gap-1">
          {contextSchools.slice(0, 5).map((s) => (
            <Badge
              key={`${s.universityId}/${s.departmentId}`}
              variant="outline"
              data-sample-sufficient={s.sampleSufficient ? "true" : "false"}
              className={cn(
                "text-2xs",
                s.sampleSufficient
                  ? "border-brand-300 bg-brand-50 text-brand-800 dark:border-brand-800/40 dark:bg-brand-950/20 dark:text-brand-300"
                  : "border-zinc-300 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-300",
              )}
            >
              {s.displayName}
              {!s.sampleSufficient && " · 표본 부족"}
            </Badge>
          ))}
          {contextSchools.length > 5 && (
            <Badge variant="outline" className="text-2xs text-muted-foreground">
              +{contextSchools.length - 5}
            </Badge>
          )}
        </div>
      )}

      {insufficient.length > 0 && (
        <div
          data-element="insufficient-context-notice"
          className="rounded-md border border-amber-200 bg-amber-50/70 p-2 text-2xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/15 dark:text-amber-200"
        >
          <div className="mb-0.5 flex items-center gap-1.5 font-medium">
            <Info aria-hidden className="h-3 w-3" />
            컨텍스트 학과 {insufficient.length}개는 표본 부족
          </div>
          <p className="leading-relaxed">
            합격 사례가 누적될 때까지 일반론적 답변만 가능합니다. 모집요강·전형 정보
            같은 정형 안내는 그대로 받을 수 있어요.
          </p>
        </div>
      )}
    </div>
  );
}
