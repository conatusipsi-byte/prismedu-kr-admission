"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * 페이지 진입 시각 → 클릭/이탈 시점 경과 ms 측정용 ref.
 *
 * 사용 예:
 *   const getDwell = usePageDwell();
 *   onClick={() => trackPrismEvent("foo", { dwell_time_ms: getDwell() })}
 *
 * 이전엔 페이지마다 mountedAtRef + useEffect 셋업을 중복 작성해
 * 측정 시점·반환값·SSR 가드가 미세하게 어긋나 있었음.
 *
 * SSR 안전: 서버에서는 0 반환 (Date.now() 호출 안 함).
 * 마운트 직후 클릭(Date.now() - 0 = 거대한 ms)을 막기 위해
 * effect 미실행 상태에서도 0 반환.
 *
 * 반환 getter는 useCallback으로 안정화 — useEffect 클린업 deps에 넣어도
 * 무한 루프 없이 react-hooks/exhaustive-deps 경고만 해소.
 */
export function usePageDwell(): () => number {
  const mountedAtRef = useRef<number>(0);

  useEffect(() => {
    mountedAtRef.current = Date.now();
  }, []);

  return useCallback(() => {
    if (!mountedAtRef.current) return 0;
    return Date.now() - mountedAtRef.current;
  }, []);
}
