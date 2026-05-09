/**
 * /admin/* server layout — master 권한 단일 검증 지점
 *
 * 흐름:
 *   1. middleware (Edge): __session 쿠키 부재 시 홈 redirect.
 *   2. **본 layout (Node)**: 쿠키 검증 + admins 컬렉션 active=true 확인.
 *   3. 통과 시 client AdminShell이 헤더·사이드바 렌더, 자식 페이지 표시.
 *
 * notFound() 사용 이유: 비-master 인증 사용자에게 "/admin 경로가 존재한다"는
 * 정보를 흘리지 않기 위해 403 대신 404로 응답. 미인증 사용자는 middleware 단계에서
 * 이미 홈으로 빠져 본 layout에 도달하지 않음.
 *
 * 각 page.tsx에서 별도 가드를 추가할 필요 없음 — 본 layout이 모든 /admin/* 진입을 막음.
 */

import { notFound } from "next/navigation";
import { requireMasterAuthFromHeaders } from "@/lib/api-auth";
import { AdminShell } from "./AdminShell";

export const dynamic = "force-dynamic"; // 쿠키 의존 — 빌드 시 prerender 금지

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = await requireMasterAuthFromHeaders();
  if (!auth.ok) notFound();

  return <AdminShell>{children}</AdminShell>;
}
