"use client";

/**
 * /admin/* 공통 UI 셸 (Client Component)
 *
 * 헤더 + 사이드바 + main 영역. planned 링크 차단을 위한 onClick 핸들러 때문에
 * client. 마스터 권한 검증은 부모 server layout (`app/admin/layout.tsx`)가 담당.
 */

import Link from "next/link";
import {
  ShieldAlert,
  Database,
  Activity,
  CloudUpload,
  FileBarChart,
  Users,
  ShoppingBag,
  ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ADMIN_NAV = [
  { href: "/admin", label: "대시보드", icon: ClipboardList, status: "planned" },
  { href: "/admin/sanitize-monitor", label: "카운슬러 가드", icon: ShieldAlert, status: "active" },
  { href: "/admin/etl-upload", label: "PDF 업로드", icon: CloudUpload, status: "active" },
  { href: "/admin/etl-status", label: "ETL 검수", icon: Activity, status: "active" },
  { href: "/admin/sample-stats", label: "표본 집계", icon: FileBarChart, status: "active" },
  { href: "/admin/admissions", label: "모집요강", icon: Database, status: "planned" },
  { href: "/admin/users", label: "사용자", icon: Users, status: "active" },
  { href: "/admin/orders", label: "주문", icon: ShoppingBag, status: "planned" },
] as const;

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <div data-component="admin-layout" className="min-h-dvh">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-content-full items-center gap-3 px-gutter-sm py-3 md:px-gutter">
          <span
            data-element="admin-badge"
            className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-2 py-0.5 text-xs font-semibold text-white"
          >
            <ShieldAlert aria-hidden className="h-3 w-3" />
            ADMIN
          </span>
          <h1 className="text-sm font-semibold">conatusipsi 운영 콘솔</h1>
          <Link
            href="/"
            className="ml-auto text-xs text-muted-foreground hover:underline"
          >
            ← 사용자 사이트로
          </Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-content-full md:grid-cols-[200px_1fr]">
        <aside className="hidden border-r bg-background md:block">
          <nav className="flex flex-col gap-1 p-3" aria-label="admin 메뉴">
            {ADMIN_NAV.map((item) => {
              const Icon = item.icon;
              const isPlanned = item.status === "planned";
              return (
                <Link
                  key={item.href}
                  href={isPlanned ? "#" : item.href}
                  aria-disabled={isPlanned}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition",
                    isPlanned
                      ? "cursor-not-allowed text-muted-foreground/60"
                      : "hover:bg-muted hover:text-foreground",
                  )}
                  onClick={(e) => isPlanned && e.preventDefault()}
                >
                  <Icon aria-hidden className="h-3.5 w-3.5" />
                  <span>{item.label}</span>
                  {isPlanned && (
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      준비 중
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="px-gutter-sm py-6 md:px-gutter">{children}</main>
      </div>
    </div>
  );
}
