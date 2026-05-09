/**
 * Landing 페이지 FAQ 데이터 — UI 렌더(FAQAccordion)와 SEO JSON-LD(LandingPage)
 * 두 곳에서 공유. id는 lib/analytics/events.ts 의 FaqQuestionId union과 일치해야
 * 분석 이벤트 타입 강제가 깨지지 않는다.
 */
import type { FaqQuestionId } from "@/lib/analytics/events";

export interface LandingFaqEntry {
  id: FaqQuestionId;
  question: string;
  /** Plain-text 답변 — JSON-LD FAQPage에 사용. */
  plainAnswer: string;
}

export const LANDING_FAQS: LandingFaqEntry[] = [
  {
    id: "plan_difference",
    question: "단건 결제와 시즌권은 어떻게 다른가요?",
    plainAnswer:
      "단건 결제는 1회 합격률 분석 + AI 카운슬러 24시간 무제한 사용권입니다. 시즌권은 수시·정시 한 시즌 동안 합격률 분석·비교·What-if 시뮬레이터를 무제한으로 사용할 수 있으며, 모집요강이 갱신되면 자동으로 최신 데이터가 반영됩니다.",
  },
  {
    id: "ai_accuracy",
    question: "합격 확률 분석은 얼마나 정확한가요?",
    plainAnswer:
      "공식 모집요강과 검증된 합격 사례를 기반으로 학과 단위로 분석합니다. 표본이 부족한 학과는 임의 수치를 만들어내는 대신 '데이터 부족'으로 표시합니다. 분석 결과는 참고용이며, 실제 합격 여부는 출제 난이도·경쟁률 변화 등 다양한 변수에 영향받습니다.",
  },
  {
    id: "korea_admissions",
    question: "수시·정시·재외국민 전형 모두 지원하나요?",
    plainAnswer:
      "수시(학생부종합·학생부교과·논술·실기)와 정시(가/나/다군)를 모두 지원합니다. 재외국민·외국인 전형은 자격 자가진단 후 별도 라우트(/admissions/jaeoegukmin)에서 안내됩니다. 자소서 첨삭은 한국 입시에서 제외되므로 제공하지 않습니다.",
  },
  {
    id: "refund_policy",
    question: "환불 정책은 어떻게 되나요?",
    plainAnswer:
      "단건 결제·시즌권 모두 결제 후 7일 이내 미사용 상태에서 전액 환불됩니다. 사용 이력이 있는 경우 잔여 기간에 대해 일할 계산됩니다. 자세한 내용은 https://conatusipsi.com/refund 페이지를 확인해주세요.",
  },
  {
    id: "privacy",
    question: "내 성적·생기부 정보는 안전한가요?",
    plainAnswer:
      "Firebase 보안 규칙과 SSL 암호화로 모든 입력 데이터를 보호합니다. 본인 외 누구도 성적·생기부 내용을 조회할 수 없으며, 계정 삭제 시 모든 개인정보가 즉시 영구 삭제됩니다. 자세한 수집·보관 기간은 https://conatusipsi.com/privacy 에서 확인하실 수 있습니다.",
  },
  {
    id: "payment",
    question: "결제는 어떻게 하나요?",
    plainAnswer:
      "토스페이먼츠로 신용카드·계좌이체·간편결제(카카오페이·네이버페이)를 지원합니다. 결제 후 즉시 분석·카운슬러 사용이 활성화되며, 영수증은 등록된 이메일로 자동 발송됩니다.",
  },
];
