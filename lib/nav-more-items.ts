import { User, CreditCard, BarChart3, HelpCircle, type LucideIcon } from "lucide-react";

/**
 * BottomNav(모바일)와 DesktopSidebar(PC) "더보기" 메뉴의 단일 소스.
 * 모바일 sheet ↔ PC dialog가 같은 항목을 보여주도록 보장.
 *
 * 자주 쓰지 않지만 직접 진입 경로가 필요한 페이지만 등록.
 * (스펙 분석·What-If·대학 비교·플래너는 /tools hub에 이미 있음)
 *
 * Ordering rationale: 사용자 멘탈모델(내정보 → 핵심기능 → 결제 → 도움말)
 *   1) profile — "내가 누구인지"
 *   2) analysis — 전체 합격 확률 (legacy 라벨 제거: 실서비스 페이지)
 *   3) pricing — 결제 전 비교
 *   4) subscription — 결제 후 관리
 *   5) help — 마지막 fallback
 */
export interface MoreNavItem {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  href: string;
}

export const MORE_NAV_ITEMS: MoreNavItem[] = [
  { id: "profile",      label: "프로필",     description: "내 정보·스펙 관리",          icon: User,       href: "/profile" },
  { id: "analysis",     label: "전체 분석",  description: "합격 확률·강약점 종합 리포트", icon: BarChart3,  href: "/analysis" },
  { id: "pricing",      label: "요금제",     description: "Free·Pro·Elite 비교",        icon: CreditCard, href: "/pricing" },
  { id: "subscription", label: "구독 관리",  description: "결제 내역·플랜 변경",         icon: CreditCard, href: "/subscription" },
  { id: "help",         label: "도움말·FAQ", description: "사용법·자주 묻는 질문",        icon: HelpCircle, href: "/help" },
];
