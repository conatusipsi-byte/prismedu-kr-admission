"use client";

/**
 * HeroCta — 홈 히어로 CTA (로그인 상태 분기).
 *
 * 서버 컴포넌트인 / 페이지에서 사용. 로그인 여부에 따라 라벨/링크가 다름:
 *   - 비로그인 → "무료 가입하고 분석 받기" → /signup?returnUrl=/onboarding
 *   - 로그인  → "내 분석 보기" → /dashboard
 *
 * loading 동안에는 비로그인 디폴트 (CLS 최소화 — 같은 크기 버튼 유지).
 */

import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";

export function HeroCta(): React.ReactElement {
  const { user, loading } = useAuth();
  const loggedIn = !loading && !!user;

  return (
    <div
      className="animate-fade-up flex flex-col sm:flex-row gap-3 w-full sm:w-auto"
      style={{ animationDelay: "0.3s" }}
    >
      <Button asChild size="2xl" variant="primary" className="shadow-glow-brand">
        <Link href={loggedIn ? "/dashboard" : "/signup?returnUrl=/onboarding"}>
          {loggedIn ? "내 대시보드로" : "무료 가입하고 분석 받기"}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </Button>
      <Button asChild size="2xl" variant="outline">
        <Link href={loggedIn ? "/analysis" : "/admissions"}>
          {loggedIn ? "분석 시작하기" : "학과 둘러보기"}
        </Link>
      </Button>
    </div>
  );
}

/**
 * 페이지 하단 Final CTA — 다크 배경 위 흰색 버튼 variant.
 */
export function FinalCta(): React.ReactElement {
  const { user, loading } = useAuth();
  const loggedIn = !loading && !!user;

  return (
    <div className="flex flex-col sm:flex-row gap-3 mt-2 w-full sm:w-auto">
      <Button
        asChild
        size="2xl"
        variant="ghost"
        className="bg-white text-ink-950 hover:bg-white/90 shadow-xl focus-visible:ring-white"
      >
        <Link href={loggedIn ? "/analysis" : "/signup?returnUrl=/onboarding"}>
          {loggedIn ? "분석 시작하기" : "무료 가입하고 분석 받기"}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </Button>
      <Button asChild size="2xl" variant="ghost" className="text-white hover:bg-white/10 border border-white/20">
        <Link href="/pricing">요금제 보기</Link>
      </Button>
    </div>
  );
}
