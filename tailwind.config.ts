
import type {Config} from 'tailwindcss';
import tailwindcssAnimate from 'tailwindcss-animate';

export default {
  darkMode: ['class'],
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        // Pretendard Variable는 globals.css에서 import. Inter는 @fontsource-variable/inter.
        sans: ['"Pretendard Variable"', 'Pretendard', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'Roboto', 'sans-serif'],
        body: ['"Pretendard Variable"', 'Pretendard', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'Roboto', 'sans-serif'],
        // Display: 히어로 헤드라인. Pretendard 800 + tabular-nums 영문.
        display: ['"Pretendard Variable"', 'Pretendard', '"Inter Variable"', 'Inter', 'sans-serif'],
        // Numeric: 가격·통계용 (tabular-nums 자동 적용은 별도 클래스).
        numeric: ['"Inter Variable"', 'Inter', '"Pretendard Variable"', 'sans-serif'],
        headline: ['"Inter Variable"', 'Inter', '"Pretendard Variable"', 'Pretendard', 'sans-serif'],
        code: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
        xs:   ['0.75rem',  { lineHeight: '1rem' }],
        sm:   ['0.8125rem',{ lineHeight: '1.15rem' }],
        base: ['0.9375rem',{ lineHeight: '1.45rem' }],
        lg:   ['1.125rem', { lineHeight: '1.65rem' }],
        xl:   ['1.3125rem',{ lineHeight: '1.75rem' }],
        '2xl':['1.5rem',   { lineHeight: '1.9rem' }],
        '3xl':['1.875rem', { lineHeight: '2.25rem' }],
        '4xl':['2.25rem',  { lineHeight: '2.5rem' }],
        '5xl':['3rem',     { lineHeight: '1.05' }],
        // Display tier — hero headlines. tight tracking, near-1 leading.
        '6xl':['3.75rem',  { lineHeight: '1.05', letterSpacing: '-0.035em' }],
        '7xl':['4.5rem',   { lineHeight: '1.02', letterSpacing: '-0.04em' }],
        '8xl':['5.5rem',   { lineHeight: '1.0',  letterSpacing: '-0.045em' }],
      },
      letterSpacing: {
        // Pretendard 한글 본문 — 자연스러운 호흡.
        body: '-0.011em',
        // Display headlines — Linear/Vercel 스타일 빡빡한 트래킹.
        tight: '-0.025em',
        tighter: '-0.035em',
        tightest: '-0.045em',
      },
      colors: {
        // ─────────────────────────────────────────────────────────────
        // BRAND — Conatus Green (Emerald). spec 2026-05 rebrand.
        // 이전 mint(#00C9A7, hue 170)에서 emerald(#10B981, hue 160)로 시프트.
        // 모든 신규 코드는 brand-* 사용. Stage 3에서 mint-* 클래스 일괄 rename 예정.
        // ─────────────────────────────────────────────────────────────
        brand: {
          50:  '#ECFDF5',
          100: '#D1FAE5',
          200: '#A7F3D0',
          300: '#6EE7B7',
          400: '#34D399',
          500: '#10B981',
          600: '#059669',
          700: '#047857',
          800: '#065F46',
          900: '#064E3B',
          950: '#022C22',
        },
        // 임시 alias — mint-* 사용 코드가 자동으로 emerald 톤이 되도록.
        // Stage 3 rename 후 제거.
        mint: {
          50:  '#ECFDF5',
          100: '#D1FAE5',
          200: '#A7F3D0',
          300: '#6EE7B7',
          400: '#34D399',
          500: '#10B981',
          600: '#059669',
          700: '#047857',
          800: '#065F46',
          900: '#064E3B',
          950: '#022C22',
        },
        // ─────────────────────────────────────────────────────────────
        // INK — Linear-style cool neutrals. 차가운 그레이 (slate 계열).
        // surface·border·body text 의 표준 neutral.
        // ─────────────────────────────────────────────────────────────
        ink: {
          50:  '#F8FAFC',
          100: '#F1F5F9',
          200: '#E2E8F0',
          300: '#CBD5E1',
          400: '#94A3B8',
          500: '#64748B',
          600: '#475569',
          700: '#334155',
          800: '#1E293B',
          900: '#0F172A',
          950: '#020617',
        },
        // ─────────────────────────────────────────────────────────────
        // ACCENTS — 단색 + soft variant. 카테고리·강조용.
        // iris  : 학과별 분석 / data viz (blue-violet)
        // violet: AI 카운슬러 (deep purple) — 기존 accent-vivid 와 같은 hue
        // amber : 시즌 자동 갱신 / pricing 추천 (Tailwind 기본 amber-500과 동일)
        // rose  : 경고·주의 (Tailwind 기본 rose-500과 동일)
        // ─────────────────────────────────────────────────────────────
        iris: {
          DEFAULT: '#7C7CF7',
          soft: '#EEF1FF',
          50:  '#EEF1FF',
          100: '#E0E5FF',
          300: '#A5AAFB',
          500: '#7C7CF7',
          600: '#6366F1',
          700: '#4F46E5',
        },
        // shadcn semantic tokens — HSL 변수 통해 다크모드 자동 대응
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        'accent-vivid': {
          DEFAULT: 'hsl(var(--accent-vivid))',
          foreground: 'hsl(var(--accent-vivid-foreground))',
          soft: 'hsl(var(--accent-vivid-soft))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
          soft: 'hsl(var(--success-soft))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
          soft: 'hsl(var(--warning-soft))',
        },
        info: {
          DEFAULT: 'hsl(var(--info))',
          foreground: 'hsl(var(--info-foreground))',
          soft: 'hsl(var(--info-soft))',
        },
        hero: {
          DEFAULT: 'hsl(var(--hero-text))',
          muted: 'hsl(var(--hero-text-muted) / 0.75)',
          overlay: 'hsl(var(--hero-overlay) / 0.12)',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))',
        },
        cat: {
          safety: { DEFAULT: 'hsl(var(--cat-safety))', fg: 'hsl(var(--cat-safety-fg))', soft: 'hsl(var(--cat-safety-soft))' },
          target: { DEFAULT: 'hsl(var(--cat-target))', fg: 'hsl(var(--cat-target-fg))', soft: 'hsl(var(--cat-target-soft))' },
          hard:   { DEFAULT: 'hsl(var(--cat-hard))',   fg: 'hsl(var(--cat-hard-fg))',   soft: 'hsl(var(--cat-hard-soft))' },
          reach:  { DEFAULT: 'hsl(var(--cat-reach))',  fg: 'hsl(var(--cat-reach-fg))',  soft: 'hsl(var(--cat-reach-soft))' },
        },
      },
      spacing: {
        'card':       '1.25rem',
        'card-lg':    '1.5rem',
        'section':    '1.5rem',
        'section-lg': '2.5rem',
        'gutter-sm':  '1rem',
        'gutter':     '1.5rem',
        'gutter-lg':  '2rem',
      },
      maxWidth: {
        'content-narrow': '48rem',
        'content':        '64rem',
        'content-wide':   '80rem',
        'content-full':   '96rem',
      },
      borderRadius: {
        // shadcn alias + Linear-style 큰 라운드 추가
        sm: 'calc(var(--radius) - 4px)',
        md: 'calc(var(--radius) - 2px)',
        lg: 'var(--radius)',
        // xl/2xl/3xl 는 Tailwind 기본 사용 (12/16/24) — globals.css에 디자인 토큰 변수 정의.
      },
      boxShadow: {
        // Linear-style 다층 그림자
        'sm':  '0 1px 2px rgba(15,23,42,0.04), 0 1px 1px rgba(15,23,42,0.03)',
        'md':  '0 4px 12px -2px rgba(15,23,42,0.06), 0 2px 4px -2px rgba(15,23,42,0.04)',
        'lg':  '0 12px 24px -6px rgba(15,23,42,0.10), 0 4px 8px -2px rgba(15,23,42,0.06)',
        'xl':  '0 24px 48px -12px rgba(15,23,42,0.18)',
        '2xl': '0 32px 64px -16px rgba(15,23,42,0.25)',
        // Brand-tinted glow
        'glow-brand':  '0 0 0 1px rgba(16,185,129,0.2), 0 12px 40px -8px rgba(16,185,129,0.25)',
        'glow-iris':   '0 0 0 1px rgba(124,124,247,0.2), 0 12px 40px -8px rgba(124,124,247,0.25)',
        'glow-violet': '0 0 0 1px rgba(168,85,247,0.2), 0 12px 40px -8px rgba(168,85,247,0.25)',
      },
      transitionTimingFunction: {
        toss: 'cubic-bezier(0.22, 1, 0.36, 1)',
        // Vercel-style spring decel
        spring: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-20px)' },
        },
        'float-sm': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        'fade-up':    { from: { opacity: '0', transform: 'translateY(12px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'fade-in':    { from: { opacity: '0' }, to: { opacity: '1' } },
        'scale-in':   { from: { opacity: '0', transform: 'scale(0.95)' }, to: { opacity: '1', transform: 'scale(1)' } },
        'slide-right':{ from: { opacity: '0', transform: 'translateX(-8px)' }, to: { opacity: '1', transform: 'translateX(0)' } },
        'count-pulse':{ '0%, 100%': { transform: 'scale(1)' }, '50%': { transform: 'scale(1.15)' } },
        'page-enter': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'page-exit':  { from: { opacity: '1', transform: 'translateY(0)' }, to: { opacity: '0', transform: 'translateY(-4px)' } },
        'page-forward':{ from: { opacity: '0', transform: 'translateX(16px)' }, to: { opacity: '1', transform: 'translateX(0)' } },
        'page-back':  { from: { opacity: '0', transform: 'translateX(-16px)' }, to: { opacity: '1', transform: 'translateX(0)' } },
        'notification-pop': {
          '0%': { transform: 'scale(0)', opacity: '0' },
          '60%': { transform: 'scale(1.2)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        // Hero text shimmer — gradient 텍스트가 좌→우 빛 흐름.
        'text-shimmer': {
          '0%': { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition: '200% center' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up':   'accordion-up 0.2s ease-out',
        'float':          'float 6s ease-in-out infinite',
        'float-sm':       'float-sm 4s ease-in-out infinite',
        'fade-up':        'fade-up 0.4s ease-out both',
        'fade-in':        'fade-in 0.3s ease-out both',
        'scale-in':       'scale-in 0.3s ease-out both',
        'slide-right':    'slide-right 0.3s ease-out both',
        'count-pulse':    'count-pulse 0.4s ease-in-out',
        'page-enter':     'page-enter 0.3s ease-out both',
        'page-forward':   'page-forward 0.3s cubic-bezier(0.22, 1, 0.36, 1) both',
        'page-back':      'page-back 0.3s cubic-bezier(0.22, 1, 0.36, 1) both',
        'notification-pop': 'notification-pop 0.4s cubic-bezier(0.22, 1, 0.36, 1) both',
        'text-shimmer':   'text-shimmer 6s linear infinite',
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
