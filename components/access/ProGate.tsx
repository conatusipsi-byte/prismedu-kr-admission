"use client";

/**
 * ProGate — Pro/Elite 전용 기능 잠금 컴포넌트
 *
 * 사용:
 *   <ProGate feature="compare" description="...">
 *     {/* Pro 사용자에게 보일 실제 컨텐츠 (현재 PR엔 stub) *\/}
 *   </ProGate>
 *
 * 무료 사용자: 잠금 카드 + /pricing 링크
 * Pro/Elite: children 렌더 (auth-context.profile.plan 기준)
 *
 * 본 PR 단계: plan 정보 미연결 시 항상 잠금 노출 (안전 방향).
 * GET /api/user/dashboard 응답에 entitlement 필드 wiring 후 자동 활성화.
 */

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Lock, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export interface ProGateProps {
  feature: string;
  /** 잠금 화면 상단 카피 — 이 기능이 무엇인지 1~2줄 */
  description: string;
  /** Pro 사용자에게 보일 컨텐츠 */
  children?: React.ReactNode;
  /** 잠금 카드 위/아래에 노출할 features bullet 3~5개 */
  highlights?: string[];
}

export function ProGate({
  feature,
  description,
  children,
  highlights,
}: ProGateProps): React.ReactElement {
  const { profile, loading } = useAuth();
  const plan = profile?.plan ?? "free";
  const isUnlocked = plan === "pro" || plan === "elite";

  if (loading) {
    return (
      <Card className="p-card-lg animate-pulse">
        <div className="h-32" />
      </Card>
    );
  }

  if (isUnlocked && children) {
    return <>{children}</>;
  }

  return (
    <Card className="p-card-lg border-brand-300 dark:border-brand-700 bg-brand-50/40 dark:bg-brand-950/30">
      <div className="flex flex-col items-center text-center gap-4 py-6">
        <div className="w-14 h-14 rounded-2xl bg-brand-500 text-white flex items-center justify-center">
          <Lock className="h-6 w-6" />
        </div>
        <div className="space-y-1.5 max-w-md">
          <p className="inline-flex items-center gap-1.5 text-2xs font-semibold rounded-full bg-brand-100 dark:bg-brand-900/60 text-brand-700 dark:text-brand-300 px-2.5 py-1">
            <Sparkles className="h-3 w-3" />
            Pro 전용 기능
          </p>
          <h2 className="text-lg font-bold text-foreground">
            {feature}
          </h2>
          <p className="text-sm text-muted-foreground break-keep-all leading-relaxed">
            {description}
          </p>
        </div>

        {highlights && highlights.length > 0 && (
          <ul className="space-y-1.5 text-left max-w-sm">
            {highlights.map((h) => (
              <li
                key={h}
                className="text-sm text-foreground flex items-start gap-2"
              >
                <span className="text-brand-500 mt-0.5">✓</span>
                <span className="break-keep-all">{h}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto pt-2">
          <Button
            asChild
            size="lg"
            className="bg-brand-600 hover:bg-brand-700"
          >
            <Link href="/pricing">
              요금제 보기
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/payment">시즌권 결제</Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}
