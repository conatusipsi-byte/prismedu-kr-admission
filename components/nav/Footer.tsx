"use client";

/**
 * Footer — 4단 컬럼.
 *
 * 좌측: 로고 + 미션 + 다크모드 토글
 * 우측 3단: 제품 · 회사 · 법적 고지
 * 하단: ⓒ · 외부 링크 (이메일·X·GitHub)
 *
 * /admin/* 와 /login 에선 자체 레이아웃이 있으므로 미노출.
 */

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mail } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/theme-toggle";

const PRODUCT_LINKS = [
  { href: "/admissions", label: "학과 검색" },
  { href: "/pricing", label: "요금제" },
  { href: "/help", label: "도움말" },
] as const;

const COMPANY_LINKS = [
  { href: "/about", label: "회사 소개" },
  { href: "/changelog", label: "변경 사항" },
  { href: "/contact", label: "문의" },
] as const;

const LEGAL_LINKS = [
  { href: "/terms", label: "이용약관" },
  { href: "/privacy", label: "개인정보 처리방침" },
  { href: "/refund", label: "환불 정책" },
] as const;

export function Footer(): React.ReactElement | null {
  const pathname = usePathname();
  if (pathname?.startsWith("/admin") || pathname === "/login" || pathname === "/signup") return null;

  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border/60 bg-background">
      <div className="mx-auto max-w-content-wide px-gutter-sm md:px-gutter lg:px-gutter-lg py-12 md:py-16">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-12 md:gap-12">
          {/* Brand column */}
          <div className="col-span-2 md:col-span-5 flex flex-col gap-5">
            <Link href="/" className="inline-flex items-center gap-2.5">
              <Logo className="h-9 w-9" />
              <span className="font-display text-base font-bold tracking-tight">conatusipsi</span>
            </Link>
            <p className="text-sm leading-relaxed text-muted-foreground max-w-xs">
              정직한 데이터로 입시를 설계합니다. 표본이 부족한 학과는 추측 수치를 보여드리지 않아요.
            </p>
            <div className="flex items-center gap-2 pt-1">
              <ThemeToggle size="sm" />
              <a
                href="mailto:hello@conatusipsi.com"
                aria-label="이메일 보내기"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background/60 text-foreground/70 transition-colors hover:bg-background hover:text-foreground"
              >
                <Mail className="h-4 w-4" />
              </a>
              <a
                href="https://x.com/conatusipsi"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="X (Twitter)"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background/60 text-foreground/70 transition-colors hover:bg-background hover:text-foreground"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817-5.97 6.817H1.674l7.73-8.835L1.254 2.25h6.83l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
              <a
                href="https://github.com/conatusipsi-byte"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background/60 text-foreground/70 transition-colors hover:bg-background hover:text-foreground"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                  <path d="M12 .5a12 12 0 0 0-3.79 23.4c.6.1.83-.26.83-.58v-2.02c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.1-.75.08-.73.08-.73 1.21.08 1.85 1.25 1.85 1.25 1.08 1.85 2.83 1.31 3.52 1 .11-.78.42-1.31.76-1.62-2.66-.3-5.46-1.33-5.46-5.93 0-1.31.47-2.39 1.24-3.23-.12-.3-.54-1.52.12-3.17 0 0 1-.32 3.3 1.23a11.4 11.4 0 0 1 6 0c2.3-1.55 3.3-1.23 3.3-1.23.66 1.65.24 2.87.12 3.17.77.84 1.24 1.92 1.24 3.23 0 4.61-2.81 5.62-5.49 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.69.83.58A12 12 0 0 0 12 .5z" />
                </svg>
              </a>
            </div>
          </div>

          {/* Product */}
          <FooterColumn title="제품" links={PRODUCT_LINKS} />
          {/* Company */}
          <FooterColumn title="회사" links={COMPANY_LINKS} />
          {/* Legal */}
          <FooterColumn title="법적 고지" links={LEGAL_LINKS} />
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-border/60 pt-6 text-2xs text-muted-foreground md:flex-row md:items-center md:justify-between">
          <p>ⓒ {year} conatusipsi. All rights reserved.</p>
          {/* 사업자등록번호 · 통신판매신고 — 클라이언트(방준현) 등록 완료 후
              env 또는 인라인 텍스트로 노출. 미등록 상태에서 "출시 직전 등록 예정"
              문구를 그대로 노출하면 신뢰도 하락 + 통신판매업 미신고로 결제 CTA
              노출 위험 → 등록 전까지 라인 자체를 감추고, 베타 안내는 헤더/메인 카피에 둠. */}
          <p className="font-numeric tabular-nums">베타 운영 중 · 정식 출시 2026.09</p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: readonly { href: string; label: string }[];
}): React.ReactElement {
  return (
    <div className="col-span-1 md:col-span-2 lg:col-span-2 flex flex-col gap-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      <ul className="flex flex-col gap-2">
        {links.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className="text-sm text-foreground/80 transition-colors hover:text-foreground"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
