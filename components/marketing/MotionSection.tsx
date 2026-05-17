"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

// React의 onAnimationStart/onAnimationEnd/onAnimationIteration/onDragStart/onDragEnd/onDrag는
// CSS animation/HTML5 drag 이벤트로, framer-motion 동일 prop과 시그니처가 충돌. omit.
type ReactHtmlSafe<T> = Omit<
  React.HTMLAttributes<T>,
  "onAnimationStart" | "onAnimationEnd" | "onAnimationIteration" | "onDragStart" | "onDragEnd" | "onDrag"
>;

type MotionSectionProps = ReactHtmlSafe<HTMLElement> & {
  as?: "section" | "div" | "article" | "ol" | "ul";
  /** stagger child elements ms (only effective when wrapping a list with MotionItem children) */
  stagger?: number;
  /** distance to slide in (px) */
  y?: number;
  delay?: number;
};

/**
 * MotionSection — scroll-triggered entrance wrapper.
 *
 * - whileInView, viewport={{ once: true }}: 한 번만 발동
 * - prefers-reduced-motion 자동 비활성
 * - margin "-10%": 뷰포트 진입 직전부터 트리거 (스크롤 어색함 방지)
 */
export function MotionSection({
  as = "section",
  className,
  stagger,
  y = 24,
  delay = 0,
  children,
  ...rest
}: MotionSectionProps): React.ReactElement {
  const reduced = useReducedMotion();
  const MotionComp = motion[as] as typeof motion.section;

  const variants = stagger
    ? {
        hidden: {},
        show: {
          transition: { staggerChildren: stagger / 1000, delayChildren: delay },
        },
      }
    : {
        hidden: { opacity: 0, y },
        show: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1], delay },
        },
      };

  return (
    <MotionComp
      initial={reduced ? false : "hidden"}
      whileInView="show"
      viewport={{ once: true, margin: "-10%" }}
      variants={variants}
      className={cn(className)}
      {...rest}
    >
      {children}
    </MotionComp>
  );
}

type MotionItemProps = ReactHtmlSafe<HTMLElement> & {
  as?: "li" | "div" | "article";
  y?: number;
};

export function MotionItem({
  as = "div",
  className,
  y = 16,
  children,
  ...rest
}: MotionItemProps): React.ReactElement {
  const MotionComp = motion[as] as typeof motion.div;
  return (
    <MotionComp
      variants={{
        hidden: { opacity: 0, y },
        show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
      }}
      className={cn(className)}
      {...rest}
    >
      {children}
    </MotionComp>
  );
}
