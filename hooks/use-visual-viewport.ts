"use client";

import { useEffect, useState } from "react";

/**
 * useVisualViewport — iOS Safari/Android Chrome 모바일 키보드가 올라왔을 때
 * 가시 viewport 영역을 측정해 드롭다운/팝오버 maxHeight를 동적으로 산출.
 *
 * 문제:
 *   모바일에서 input focus → 소프트 키보드가 올라오면 화면 하단을 가린다.
 *   `100vh`나 `window.innerHeight`는 키보드 영역까지 포함하므로
 *   드롭다운이 키보드 뒤에 숨어 사용자가 결과를 보지 못하는 P0 버그 발생.
 *
 * 해법:
 *   visualViewport API로 키보드를 제외한 가시 영역을 polling.
 *   anchorRef bottom과 visualViewport bottom 사이의 거리를 maxHeight로 반환.
 *
 * Fallback:
 *   visualViewport 미지원(iOS Safari ≤12 등) → window.innerHeight 사용.
 *   ref가 없거나 SSR 시 → undefined 반환 (드롭다운은 자연 높이로 fallback).
 *
 * 사용 예:
 *   const inputBoxRef = useRef<HTMLDivElement>(null);
 *   const dropdownMaxH = useVisualViewportSpaceBelow(inputBoxRef, 16);
 *   <div ref={inputBoxRef}>
 *     <input />
 *     <div style={{ maxHeight: dropdownMaxH }}>...</div>
 *   </div>
 *
 * @param anchorRef 입력창(또는 anchor)을 참조하는 ref. 이 요소의 bottom 기준으로 계산.
 * @param marginPx anchor bottom과 dropdown 끝 사이 여유 공간 (기본 16px).
 * @param minPx 최소 보장 높이 (기본 120px — 이보다 작으면 키보드가 너무 많이 가린 상태).
 * @returns 가용 픽셀 높이 (number) or undefined (anchor 미장착).
 */
export function useVisualViewportSpaceBelow(
  anchorRef: React.RefObject<HTMLElement | null>,
  marginPx = 16,
  minPx = 120,
): number | undefined {
  const [maxH, setMaxH] = useState<number | undefined>();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const vp = window.visualViewport;
    const update = () => {
      const ref = anchorRef.current;
      if (!ref) return;
      const rect = ref.getBoundingClientRect();
      const visualBottom = vp ? vp.offsetTop + vp.height : window.innerHeight;
      const available = visualBottom - rect.bottom - marginPx;
      setMaxH(Math.max(minPx, available));
    };
    update();
    vp?.addEventListener("resize", update);
    vp?.addEventListener("scroll", update);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      vp?.removeEventListener("resize", update);
      vp?.removeEventListener("scroll", update);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [anchorRef, marginPx, minPx]);

  return maxH;
}
