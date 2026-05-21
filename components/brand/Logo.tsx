"use client";

/**
 * Logo — Conatus 브랜드 로고 (다크/라이트 자동 분기).
 *
 * 자산:
 *   - public/brand/logo-dark.webp   다크 배경 위 노출용
 *   - public/brand/logo-light.webp  화이트 배경 위 노출용
 *
 * 로고 이미지에 "Conatus" 워드마크가 이미 포함됨 → 호출 측에서 별도 텍스트 X.
 *
 * SSR 안전성:
 *   - next-themes 의 resolvedTheme 은 hydration 전 undefined.
 *   - mount 전엔 light 자산을 placeholder 로 (CLS 방지 + 깜빡임 최소화).
 *   - hidden alt 텍스트로 스크린리더 호환.
 *
 * 사용 예:
 *   <Logo className="h-10" />   // Navbar
 *   <Logo className="h-14" />   // Footer
 *
 * ⚠️ PNG/WEBP 자산이라 SVG 대비 무거움 (각 ≈42 KB).
 *    출시 후 SVG 또는 React 컴포넌트로 전환 검토 (TODO: post-launch).
 *    현재는 Next.js Image 로 자동 최적화(브라우저별 webp/avif 변환 + lazy/priority).
 */

import * as React from "react";
import Image from "next/image";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

type LogoProps = {
  className?: string;
  /** LCP 최적화 — Navbar 처럼 above-the-fold 노출 시 true. 기본 false. */
  priority?: boolean;
  /** 시각 노출용 alt — 텍스트 워드마크가 이미 이미지에 포함되므로 비워두면 "Conatus" 자동. */
  alt?: string;
};

const LIGHT_SRC = "/brand/logo-light.webp";
const DARK_SRC = "/brand/logo-dark.webp";
/** 원본 자산 정사각 (1092 × 1092). aspect-square 유지. */
const NATIVE_DIM = 1092;

export function Logo({ className, priority = false, alt = "Conatus" }: LogoProps): React.ReactElement {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  // mount 전: light 자산을 default — CLS·hydration mismatch 방지.
  // mount 후: theme 에 따라 swap.
  const src = mounted && resolvedTheme === "dark" ? DARK_SRC : LIGHT_SRC;

  return (
    <span
      className={cn(
        // 정사각 비율 강제 + 부모 height 따라감.
        "relative inline-block aspect-square shrink-0",
        className,
      )}
      data-component="brand-logo"
      data-theme={mounted ? resolvedTheme : "light"}
    >
      <Image
        src={src}
        alt={alt}
        width={NATIVE_DIM}
        height={NATIVE_DIM}
        priority={priority}
        // h-* 클래스로 컨테이너 사이즈가 정해지므로 fill 대신 width/height + sizes.
        sizes="(max-width: 768px) 56px, 56px"
        className="h-full w-full object-contain"
      />
    </span>
  );
}
