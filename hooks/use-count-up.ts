"use client";

import { useEffect, useRef, useState } from "react";

/**
 * useCountUp — 숫자가 0(또는 from)에서 target까지 부드럽게 카운트 업.
 *
 * requestAnimationFrame 기반, ease-out cubic 보간.
 * target이 변하면 현재 값에서 새 target으로 트윈 (재시작 아님).
 *
 * 사용:
 *   const display = useCountUp(95, { duration: 1200 });
 *   <span className="tabular-nums">{display}%</span>
 */
export function useCountUp(
  target: number,
  options: {
    /** 애니메이션 길이 (ms) — 기본 800 */
    duration?: number;
    /** 소수점 자릿수 — 기본 0 */
    decimals?: number;
    /** 초기값 — 기본 0 */
    from?: number;
    /** 비활성화 (즉시 target 표시) */
    disabled?: boolean;
  } = {}
) {
  const { duration = 800, decimals = 0, from = 0, disabled = false } = options;
  const [value, setValue] = useState<number>(disabled ? target : from);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<{ time: number; from: number } | null>(null);

  useEffect(() => {
    if (disabled) {
      setValue(target);
      return;
    }
    // reduced motion 사용자 — 즉시 표시
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setValue(target);
      return;
    }

    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    startRef.current = { time: performance.now(), from: value };

    const tick = (now: number) => {
      if (!startRef.current) return;
      const elapsed = now - startRef.current.time;
      const t = Math.min(1, elapsed / duration);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      const next = startRef.current.from + (target - startRef.current.from) * eased;
      setValue(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // value를 deps에 넣지 않음 — 매 tick마다 useEffect 재실행 방지.
    // 트윈 시작점은 startRef로 잡힘.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration, disabled]);

  return decimals > 0 ? value.toFixed(decimals) : Math.round(value);
}
