import { useEffect, useRef } from "react";
import { trackPrismEvent } from "@/lib/analytics/events";
import type { SectionId } from "@/lib/analytics/section-ids";

/**
 * useSectionViewTracking — 섹션이 viewport에 들어올 때 한 번만 이벤트 발사.
 *
 * `event` 인자(현재는 insights_section_viewed 한 종류)로 GA에 어떤 화면의
 * 어떤 섹션이 노출됐는지 기록. 동일 섹션은 한 번만 fire (one-shot).
 *
 * use-animate-on-view 패턴과 동일: 동기 viewport 체크 + IntersectionObserver
 * + 250ms fallback (관찰자가 늦어도 데이터 손실 방지).
 */
export function useSectionViewTracking<T extends HTMLElement = HTMLDivElement>(
  sectionId: SectionId,
  event: "insights_section_viewed" = "insights_section_viewed",
  threshold = 0.25,
) {
  const ref = useRef<T>(null);
  const firedRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || firedRef.current) return;

    const fire = () => {
      if (firedRef.current) return;
      firedRef.current = true;
      trackPrismEvent(event, { section_id: sectionId });
    };

    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    if (rect.top < vh && rect.bottom > 0) {
      fire();
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          fire();
          observer.unobserve(el);
        }
      },
      { threshold },
    );
    observer.observe(el);

    return () => observer.disconnect();
  }, [sectionId, event, threshold]);

  return ref;
}
