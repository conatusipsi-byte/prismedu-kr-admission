import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Logo — conatusipsi 모노그램.
 *
 * 'c' 곡선 안쪽에 학사모(graduation cap) 미니 모티프.
 * brand-500 → iris 그라디언트로 칠해진 squircle 배경.
 *
 * size는 컨테이너의 className으로 제어 (h-8 w-8 등). 내부 SVG는 100% 채움.
 * 단색 모드(`solid` prop)는 다크모드 카드 위 그림자 표현용.
 */
type LogoProps = {
  className?: string;
  solid?: boolean;
};

export function Logo({ className, solid = false }: LogoProps): React.ReactElement {
  const gradId = React.useId();
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex items-center justify-center overflow-hidden",
        // squircle ≈ rounded-2xl 가까운 ratio (24/32 px = 0.75)
        "rounded-[10px]",
        solid && "bg-brand-600",
        className,
      )}
    >
      {!solid && (
        <span
          className="absolute inset-0 rounded-[10px]"
          style={{
            background: `linear-gradient(135deg, hsl(160 84% 39%) 0%, hsl(243 91% 73%) 100%)`,
          }}
        />
      )}
      <svg
        viewBox="0 0 32 32"
        fill="none"
        className="relative h-full w-full p-[18%] text-white"
      >
        <defs>
          <linearGradient id={`${gradId}-c`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.95)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.7)" />
          </linearGradient>
        </defs>
        {/* 외곽 'c' arc — 좌측이 열린 형태, 학사모와 시각 균형 */}
        <path
          d="M22 7.2c-2.2-1.8-5-2.7-7.8-2.5C8.6 5.1 4.6 9.4 4.6 14.7c0 5.5 4.3 9.9 9.8 10 2.7 0 5.2-1 7-2.7"
          stroke={`url(#${gradId}-c)`}
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />
        {/* 학사모 — 'c' 내부 우상단에 컴팩트하게 */}
        <g transform="translate(15.5 9.5)">
          {/* 모자 윗판 */}
          <path
            d="M0 2 L6 0 L12 2 L6 4 Z"
            fill="white"
          />
          {/* 술 띠 */}
          <line x1="11" y1="2.5" x2="11" y2="5.5" stroke="white" strokeWidth="0.6" strokeLinecap="round" />
          <circle cx="11" cy="6" r="0.7" fill="white" />
        </g>
      </svg>
    </span>
  );
}
