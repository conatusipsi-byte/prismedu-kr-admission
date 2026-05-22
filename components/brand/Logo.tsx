"use client";

/**
 * Logo — Conatus 브랜드 로고 (다크/라이트 자동 분기).
 *
 * 자산 (BUG-003 fix, 2026-05-22 — 베이크인 배경 WEBP 를 투명 PNG 로 교체):
 *   - public/brand/logo-dark.png   다크 배경용 (1092×1092, RGBA alpha)
 *   - public/brand/logo-light.png  라이트 배경용 (500×500, RGBA alpha)
 *
 * Variant:
 *   - "full" (기본):        워드마크 포함 단일 PNG 그대로 표시.
 *   - "icon-with-text":     PNG 의 아이콘 영역만 CSS 로 크롭 후 옆에 HTML "Conatus" 텍스트.
 *                            워드마크가 작은 사이즈(Navbar h-10 등)에서 흐릿한 문제 해소.
 *                            HTML 텍스트라 어느 크기에서도 선명.
 *
 * SSR 안전성:
 *   - next-themes 의 resolvedTheme 은 hydration 전 undefined.
 *   - mount 전엔 light 자산을 default — CLS·hydration mismatch 방지.
 *
 * 사용 예:
 *   <Logo className="h-10" />                           // 큰 로고 (full PNG)
 *   <Logo variant="icon-with-text" className="h-10" />  // Navbar — 아이콘 + HTML 워드마크
 *
 * ⚠️ 자산 크기: light ≈124 KB, dark ≈360 KB (PNG 무압축 그라디언트).
 *    Next.js Image 가 브라우저별로 webp/avif 변환·lazy/priority 처리하므로 실제 전송량은 더 작음.
 *    출시 후 SVG 전환 검토 (TODO: post-launch — 추가 ~80% 절감 가능).
 *
 * ⚠️ icon-with-text 의 scale/translate 값은 현재 자산의 **아이콘 vs 워드마크 비율** 에
 *    fit 되어 있음 (아이콘이 소스의 상단 ≈56% 차지). 자산 갱신 시 ICON_CROP_* 상수 재조정 필요.
 */

import * as React from "react";
import Image from "next/image";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

type LogoVariant = "full" | "icon-with-text";

type LogoProps = {
  className?: string;
  /** LCP 최적화 — Navbar 처럼 above-the-fold 노출 시 true. 기본 false. */
  priority?: boolean;
  /** alt 텍스트 — full 모드에선 Image alt 로, icon-with-text 모드에선 visible 워드마크 텍스트로 사용. */
  alt?: string;
  /** 표시 모드. 기본 "full". */
  variant?: LogoVariant;
};

const LIGHT_SRC = "/brand/logo-light.png";
const DARK_SRC = "/brand/logo-dark.png";
/** 원본 자산 정사각 (1092 × 1092). aspect-square 유지. */
const NATIVE_DIM = 1092;

/**
 * 아이콘 영역 크롭 파라미터 — 소스 PNG 의 아이콘이 차지하는 비율 측정값 기반.
 *   - 아이콘 수직 범위: 소스 y=12~68% (높이 56%) → 1/0.56 ≈ 1.8× scale 로 가시영역 채움
 *   - 아이콘 수직 중심: 소스 y=40% (= viewport 중심 50% 보다 10% 위쪽)
 *     1.8× 확대 후 -18% 만큼 viewport 중심 위로 더 벗어남 → +18% translateY 로 보정
 */
const ICON_CROP_SCALE = 1.8;
const ICON_CROP_TRANSLATE_Y_PCT = 18;

export function Logo({
  className,
  priority = false,
  alt = "Conatus",
  variant = "full",
}: LogoProps): React.ReactElement {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  // mount 전: light 자산을 default — CLS·hydration mismatch 방지.
  // mount 후: theme 에 따라 swap.
  const src = mounted && resolvedTheme === "dark" ? DARK_SRC : LIGHT_SRC;

  if (variant === "icon-with-text") {
    return (
      <span
        className={cn("inline-flex items-center gap-2", className)}
        data-component="brand-logo"
        data-variant="icon-with-text"
        data-theme={mounted ? resolvedTheme : "light"}
      >
        {/* 아이콘 영역 — overflow-hidden + scale/translate 로 PNG 상단 아이콘만 노출.
            Image alt="" — 옆 워드마크 <span> 이 accessibility name 을 담당 (중복 방지). */}
        <span className="relative inline-block aspect-square h-full shrink-0 overflow-hidden">
          <Image
            src={src}
            alt=""
            fill
            priority={priority}
            sizes="80px"
            className="object-contain"
            style={{
              transform: `scale(${ICON_CROP_SCALE}) translateY(${ICON_CROP_TRANSLATE_Y_PCT}%)`,
            }}
          />
        </span>
        {/* 워드마크 — HTML 텍스트 (선명, 자산 변경 무관, theme-aware). */}
        <span className="font-display text-xl font-extrabold tracking-tighter leading-none text-foreground">
          {alt}
        </span>
      </span>
    );
  }

  return (
    <span
      className={cn(
        // 정사각 비율 강제 + 부모 height 따라감.
        "relative inline-block aspect-square shrink-0",
        className,
      )}
      data-component="brand-logo"
      data-variant="full"
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
