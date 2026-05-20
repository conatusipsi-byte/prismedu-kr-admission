"use client";

/**
 * AnalysisCtaBox — 학과 상세 사이드바의 "합격 가능성" CTA.
 *
 * 로그인 상태에 따라 라벨/링크가 달라짐:
 *   - 비로그인 → /login?returnUrl=...
 *   - 로그인  → /analysis (해당 학과 컨텍스트 가지고 분석 시작)
 *
 * Server Component(학과 상세 페이지)는 그대로 두고 본 클라이언트 박스만 hydrate.
 */

import * as React from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface AnalysisCtaBoxProps {
  universityId: string;
  departmentId: string;
}

export function AnalysisCtaBox({
  universityId,
  departmentId,
}: AnalysisCtaBoxProps): React.ReactElement {
  const { user, loading } = useAuth();
  const detailPath = `/admissions/${universityId}/${departmentId}`;

  // 로그인 여부에 따라 라벨·링크 분기. loading 중엔 비로그인 디폴트 유지 (스켈레톤은 과함).
  const href = loading || !user ? `/login?returnUrl=${encodeURIComponent(detailPath)}` : "/analysis";
  const label = loading || !user ? "무료로 분석 시작" : "이 학과 분석하기";

  return (
    <div className="rounded-3xl border border-brand-200 bg-gradient-to-br from-brand-50 via-brand-50/30 to-iris/10 dark:from-brand-950/50 dark:via-brand-950/20 dark:to-iris/8 dark:border-brand-800/60 p-6">
      <Badge variant="pill-brand" size="sm" className="mb-3">
        AI 분석
      </Badge>
      <h3 className="text-lg font-bold tracking-tight mb-2 break-keep-all">
        이 학과 내 합격 가능성
      </h3>
      <p className="text-xs text-muted-foreground mb-5 break-keep-all leading-relaxed">
        {user
          ? "내신·수능·생기부를 입력하면 Safety/Match/Reach 분류를 즉시 받아볼 수 있어요."
          : "내신·수능·생기부 입력 시 Safety/Match/Reach 분류를 즉시 받아볼 수 있어요."}
      </p>
      <Button asChild size="lg" variant="primary" className="w-full shadow-glow-brand">
        <Link href={href}>{label}</Link>
      </Button>
    </div>
  );
}
