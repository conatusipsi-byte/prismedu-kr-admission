/**
 * Root layout — 한국 대학 입시 서비스 (conatusipsi.com)
 *
 * 본 PR 단계에서는 최소 골격. 풍부한 셸(AppShell·DesktopSidebar·AuthGate 등)은
 * 후속 PR에서 prismedu.kr 컴포넌트 복사 + 도메인 라벨 교체로 추가.
 */

import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { PublicNav } from "@/components/nav/PublicNav";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  metadataBase: new URL("https://conatusipsi.com"),
  title: {
    default: "conatusipsi — 한국 대학 입시 AI 추천",
    template: "%s | conatusipsi",
  },
  description:
    "전국 1,000여 학과의 모집요강·전형 정보를 한곳에서. AI가 분석하는 합격 가능성과 맞춤 입시 전략.",
  keywords: [
    "대학 입시", "수시", "정시", "학생부종합", "학생부교과", "논술", "수능", "내신",
    "합격 예측", "학과 추천", "conatusipsi",
  ],
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: "https://conatusipsi.com",
    title: "conatusipsi — 한국 대학 입시 AI 추천",
    description: "전국 1,000여 학과 모집요강·합격률 분석",
    siteName: "conatusipsi",
  },
  twitter: {
    card: "summary_large_image",
    title: "conatusipsi — 한국 대학 입시 AI 추천",
    description: "전국 1,000여 학과 모집요강·합격률 분석",
  },
  robots: { index: true, follow: true },
  alternates: { canonical: "https://conatusipsi.com" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#10B981" },
    { media: "(prefers-color-scheme: dark)", color: "#020617" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): React.ReactElement {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="font-body antialiased min-h-dvh">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[200] focus:bg-brand-600 focus:text-white focus:px-4 focus:py-2 focus:rounded-xl focus:shadow-lg"
        >
          메인 콘텐츠로 건너뛰기
        </a>
        <ThemeProvider>
          <AuthProvider>
            <PublicNav />
            <main id="main-content" className="min-h-dvh bg-background">
              {children}
            </main>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
