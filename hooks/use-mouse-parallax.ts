"use client";

import { useEffect, useRef, useState } from "react";

/**
 * useMouseParallax — 컨테이너 내 마우스 위치를 0..1 정규화해 반환.
 *
 * 데스크톱 hover 환경 전용 (모바일·hover:none은 비활성).
 * prefers-reduced-motion 사용자도 비활성.
 *
 * 사용:
 *   const { ref, x, y } = useMouseParallax<HTMLDivElement>();
 *   <div ref={ref} style={{ transform: `translate(${x*8}px, ${y*8}px)` }} />
 *
 *   x, y ∈ [-1, 1] (중앙 0).
 */
export function useMouseParallax<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    if (typeof window === "undefined") return;
    // 모바일/터치 환경에선 비활성
    if (!window.matchMedia("(hover: hover)").matches) return;
    // reduced motion 가드
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const el = ref.current;
    if (!el) return;

    let raf: number | null = null;
    const handle = (e: MouseEvent) => {
      if (raf !== null) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = (e.clientX - cx) / (rect.width / 2);
        const dy = (e.clientY - cy) / (rect.height / 2);
        // -1..1 clamp
        setPos({
          x: Math.max(-1, Math.min(1, dx)),
          y: Math.max(-1, Math.min(1, dy)),
        });
      });
    };
    const reset = () => setPos({ x: 0, y: 0 });

    window.addEventListener("mousemove", handle);
    el.addEventListener("mouseleave", reset);
    return () => {
      window.removeEventListener("mousemove", handle);
      el.removeEventListener("mouseleave", reset);
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, []);

  return { ref, x: pos.x, y: pos.y };
}
