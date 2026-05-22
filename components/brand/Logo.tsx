"use client";

/**
 * Logo — Conatus 브랜드 로고 (다크/라이트 자동 분기).
 *
 * 자산 (BUG-003 fix, 2026-05-22 — 베이크인 배경 WEBP 를 투명 PNG 로 교체):
 *   - public/brand/logo-dark.png   다크 배경용 (1092×1092, RGBA alpha)
 *   - public/brand/logo-light.png  라이트 배경용 (500×500, RGBA alpha)
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
 * ⚠️ 자산 크기: light ≈124 KB, dark ≈360 KB (PNG 무압축 그라디언트).
 *    Next.js Image 가 브라우저별로 webp/avif 변환·lazy/priority 처리하므로 실제 전송량은 더 작음.
 *    출시 후 SVG 전환 검토 (TODO: post-launch — 추가 ~80% 절감 가능).
 *
 * ⚠️ 두 자산의 intrinsic 해상도가 다름 (light 500, dark 1092). NATIVE_DIM 은
 *    aspect ratio 보존용 — 둘 다 1:1 정사각이므로 표시상 문제 없음. 향후 자산 갱신 시
 *    light 도 1092 로 맞춰주면 srcset 계산이 더 일관됨.
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

const LIGHT_SRC = "/brand/logo-light.png";
const DARK_SRC = "/brand/logo-dark.png";
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
