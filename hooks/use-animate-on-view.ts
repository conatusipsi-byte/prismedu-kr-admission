import { useRef, useEffect, useState } from "react";

/**
 * useAnimateOnView — 요소가 viewport에 들어올 때 isVisible=true.
 *
 * 안전장치:
 *   1. 마운트 직후 동기 viewport 체크 — 이미 보이는 위쪽 요소(hero 등)는
 *      Observer 콜백을 기다리지 않고 즉시 visible로 (PageTransition + remount 환경에서
 *      observer가 늦게 fire 돼 hero가 안 보이던 버그 방지).
 *   2. 250ms 후 fallback — observer가 어떤 이유로 fire 안 되면 강제로 visible로.
 *      Worst case: animation 없이 그냥 표시 (콘텐츠는 보이는 게 더 중요).
 */
export function useAnimateOnView(threshold = 0.1) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // 1) 동기 체크: 이미 viewport 안에 있으면 즉시 visible
    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const vw = window.innerWidth || document.documentElement.clientWidth;
    const inViewportNow =
      rect.top < vh && rect.bottom > 0 && rect.left < vw && rect.right > 0;
    if (inViewportNow) {
      setIsVisible(true);
      return;
    }

    // 2) IntersectionObserver — 스크롤로 진입할 때
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold }
    );
    observer.observe(el);

    // 3) Fallback: 250ms 후에도 트리거 안 되면 강제 visible (콘텐츠 표시 우선)
    const fallback = setTimeout(() => setIsVisible(true), 250);

    return () => {
      observer.disconnect();
      clearTimeout(fallback);
    };
  }, [threshold]);

  return { ref, isVisible };
}
