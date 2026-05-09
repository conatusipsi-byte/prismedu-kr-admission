/**
 * 전자상거래법상 통신판매업자 표시 의무 정보.
 * 환경변수 미설정 시 placeholder 반환 — 출시 전 반드시 채워야 함.
 */

/**
 * 모든 사용자 대면 고객지원 이메일의 single source.
 * 환경변수(NEXT_PUBLIC_BIZ_EMAIL)가 채워지면 그 값이 사용되며, 미설정 시 placeholder.
 *
 * 직접 import 사용 가능 — 컴포넌트가 getBusinessInfo() 전체 객체를 가져올 필요 없음:
 *   import { SUPPORT_EMAIL } from "@/lib/business-info";
 *
 * 과거 prism-app.com / prism-edu.com 등 여러 주소가 산재했었음 — Phase 11에서 통일.
 */
export const SUPPORT_EMAIL: string =
  process.env.NEXT_PUBLIC_BIZ_EMAIL || "support@prismedu.kr";

export interface BusinessInfo {
  name: string;
  representative: string;
  registrationNumber: string;
  telecomNumber: string;
  address: string;
  email: string;
  phone?: string;
  privacyOfficer: string;
  privacyOfficerEmail: string;
  isPlaceholder: boolean;
}

const PLACEHOLDER: BusinessInfo = {
  name: "(주)PRISM",
  representative: "대표자명",
  registrationNumber: "000-00-00000",
  telecomNumber: "0000-서울-00000",
  address: "서울특별시",
  email: "support@prismedu.kr",
  phone: undefined,
  privacyOfficer: "개인정보보호책임자",
  privacyOfficerEmail: "privacy@prismedu.kr",
  isPlaceholder: true,
};

export function getBusinessInfo(): BusinessInfo {
  const fromEnv = {
    name: process.env.NEXT_PUBLIC_BIZ_NAME ?? "",
    representative: process.env.NEXT_PUBLIC_BIZ_REPRESENTATIVE ?? "",
    registrationNumber: process.env.NEXT_PUBLIC_BIZ_REGISTRATION_NUMBER ?? "",
    telecomNumber: process.env.NEXT_PUBLIC_BIZ_TELECOM_NUMBER ?? "",
    address: process.env.NEXT_PUBLIC_BIZ_ADDRESS ?? "",
    email: process.env.NEXT_PUBLIC_BIZ_EMAIL ?? "",
    phone: process.env.NEXT_PUBLIC_BIZ_PHONE || undefined,
    privacyOfficer: process.env.NEXT_PUBLIC_BIZ_PRIVACY_OFFICER ?? "",
    privacyOfficerEmail: process.env.NEXT_PUBLIC_BIZ_PRIVACY_OFFICER_EMAIL ?? "",
  };

  const hasRealInfo = !!(
    fromEnv.name &&
    fromEnv.representative &&
    fromEnv.registrationNumber &&
    fromEnv.telecomNumber
  );

  if (hasRealInfo) {
    return { ...fromEnv, isPlaceholder: false };
  }

  return PLACEHOLDER;
}
