import type {NextConfig} from 'next';
import { withSentryConfig } from '@sentry/nextjs';

// 전역 보안 헤더. CSP는 Next.js 런타임 인라인 스크립트/스타일이 있어
// 'unsafe-inline'을 허용 — nonce 기반 CSP로 강화하려면 middleware 필요.
// 현재 목표는 clickjacking/MIME sniffing/referrer leak 등 기본 공격면 차단.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next.js 인라인 + Toss SDK + Google OAuth + Kakao OAuth
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.tosspayments.com https://*.googleapis.com https://*.gstatic.com https://apis.google.com https://accounts.google.com https://t1.kakaocdn.net https://developers.kakao.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
      "font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net",
      "img-src 'self' data: blob: https:",
      // Supabase Auth/REST/Realtime (wss) · Toss · Google/Kakao OAuth · Sentry
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.googleapis.com https://api.tosspayments.com https://accounts.google.com https://kauth.kakao.com https://kapi.kakao.com https://*.sentry.io https://*.ingest.sentry.io",
      "frame-src 'self' https://*.tosspayments.com https://accounts.google.com https://kauth.kakao.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // 개발 환경에서만 cross-origin 허용 (production은 동일 origin)
  allowedDevOrigins: process.env.NODE_ENV === "development" ? ["*"] : undefined,
  // TypeScript 에러는 빌드 실패로 처리 — 더 이상 prod에서 런타임 사고 안 남
  typescript: {
    ignoreBuildErrors: false,
  },
  // ESLint 에러도 빌드 실패로 처리 (warnings은 통과, errors만 차단)
  eslint: {
    ignoreDuringBuilds: false,
  },
  // lucide-react는 barrel export(~1,500 아이콘)라 naive `import { X } from "lucide-react"`가
  // 전체를 번들에 포함시킬 위험. optimizePackageImports로 SWC가 per-icon path로 rewrite →
  // 실제 사용된 아이콘만 남음. (L002)
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
      // Wikipedia 캠퍼스 사진 (CampusPhoto 컴포넌트)
      { protocol: 'https', hostname: 'upload.wikimedia.org', port: '', pathname: '/**' },
      // 학교 로고 (SchoolLogo 컴포넌트 — DDG primary, Google fallback)
      { protocol: 'https', hostname: 'icons.duckduckgo.com', port: '', pathname: '/**' },
      { protocol: 'https', hostname: 'www.google.com', port: '', pathname: '/s2/favicons' },
    ],
  },
};

// Sentry wrapper — DSN이 설정된 경우에만 활성화.
// 소스맵 업로드는 SENTRY_AUTH_TOKEN + org/project가 모두 있을 때만 수행 — 미설정 시 빌드 실패 방지.
//
// disableLogger 는 v10 부터 deprecated — webpack treeshake 옵션으로 이전:
//   webpack.treeshake.removeDebugLogging 로 SDK 의 console.* debug 호출을 빌드 시 제거.
const sentryBuildOptions = {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  telemetry: false,
  hideSourceMaps: true,
  widenClientFileUpload: true,
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },
};

export default process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(nextConfig, sentryBuildOptions)
  : nextConfig;
