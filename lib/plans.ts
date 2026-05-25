export type Plan = "free" | "pro" | "elite";
// 결제·쿼터 코드가 기존 타입 이름을 공유 — 마이그레이션 기간 동안 alias 유지.
export type PlanType = Plan;
export type BillingCycle = "monthly" | "yearly";
export type ParentReportType = "none" | "sample" | "basic" | "weekly";

export interface PlanFeatures {
  schoolAnalysisLimit: number | "unlimited";
  aiChatDailyLimit: number | "unlimited";
  essayStorageLimit: number | "unlimited";
  essayReviewLimit: number | "unlimited";
  whatIfEnabled: boolean;
  specAnalysisEnabled: boolean;
  autoPlannerEnabled: boolean;
  parentReportType: ParentReportType;
  universityRubricEnabled: boolean;
  admissionMatchingEnabled: boolean;
  prioritySupportHours: number; // 0 = 없음, 24 = 24시간 우선 응답
}

export interface PlanDef {
  id: Plan;
  displayName: string;
  monthlyPrice: number; // KRW
  yearlyPrice: number; // KRW
  yearlyDiscount: number; // %
  features: PlanFeatures;
  highlights: string[];
}

export const PLANS: Record<Plan, PlanDef> = {
  free: {
    id: "free",
    displayName: "Free",
    monthlyPrice: 0,
    yearlyPrice: 0,
    yearlyDiscount: 0,
    features: {
      schoolAnalysisLimit: 5,
      aiChatDailyLimit: 5,
      essayStorageLimit: 1,
      essayReviewLimit: 0,
      whatIfEnabled: false,
      specAnalysisEnabled: false,
      autoPlannerEnabled: false,
      parentReportType: "sample",
      universityRubricEnabled: false,
      admissionMatchingEnabled: false,
      prioritySupportHours: 0,
    },
    highlights: [
      "대학 5개 합격 확률 분석",
      "AI 상담 하루 5회",
      "에세이 1개 저장",
      "학부모 샘플 리포트",
    ],
  },
  pro: {
    id: "pro",
    displayName: "Pro",
    monthlyPrice: 49000,
    yearlyPrice: 490000,
    yearlyDiscount: 17,
    features: {
      schoolAnalysisLimit: "unlimited",
      aiChatDailyLimit: "unlimited",
      essayStorageLimit: "unlimited",
      essayReviewLimit: "unlimited",
      whatIfEnabled: true,
      specAnalysisEnabled: true,
      autoPlannerEnabled: true,
      parentReportType: "basic",
      universityRubricEnabled: false,
      admissionMatchingEnabled: false,
      prioritySupportHours: 0,
    },
    highlights: [
      "1,001개 대학 전체 분석",
      "AI 상담 무제한",
      "AI 에세이 첨삭 무제한",
      "스펙 분석 리포트",
      "자동 플래너 생성",
    ],
  },
  elite: {
    id: "elite",
    displayName: "Elite",
    monthlyPrice: 149000,
    yearlyPrice: 990000,
    yearlyDiscount: 45,
    features: {
      schoolAnalysisLimit: "unlimited",
      aiChatDailyLimit: "unlimited",
      essayStorageLimit: "unlimited",
      essayReviewLimit: "unlimited",
      whatIfEnabled: true,
      specAnalysisEnabled: true,
      autoPlannerEnabled: true,
      parentReportType: "weekly",
      universityRubricEnabled: true,
      admissionMatchingEnabled: true,
      prioritySupportHours: 24,
    },
    highlights: [
      "Pro의 모든 기능 +",
      "대학별 맞춤 에세이 첨삭",
      "합격자 케이스 매칭 분석",
      "학부모 주간 리포트 자동 발송",
      "12월 마감 24시간 우선 응답",
    ],
  },
};

export function getPlan(planId: string | undefined | null): PlanDef {
  return PLANS[normalizePlan(planId)];
}

/**
 * 레거시 basic/premium 플랜명을 Pro/Elite로 승급 매핑.
 * Firestore에 남아있는 과거 유저 필드를 API 레이어에서 정규화할 때 사용.
 */
export function normalizePlan(raw: unknown): Plan {
  if (raw === "pro" || raw === "elite" || raw === "free") return raw;
  if (raw === "basic") return "pro";
  if (raw === "premium") return "elite";
  return "free";
}

/**
 * boolean·"unlimited"·number 형태의 features 필드에 대해 "접근 가능"을 판정.
 * parentReportType처럼 enum 문자열을 쓰는 필드는 이 함수로 판정하지 말고
 * `getPlan(plan).features.parentReportType !== "none"` 처럼 직접 비교할 것.
 */
export function canUseFeature(plan: Plan, feature: keyof PlanFeatures): boolean {
  const p = PLANS[plan];
  const val = p.features[feature];
  if (typeof val === "boolean") return val;
  if (typeof val === "string") return val === "unlimited";
  if (typeof val === "number") return val > 0;
  return false;
}

/**
 * features 필드 값이 "unlimited" 또는 Infinity이면 Infinity 반환, 그 외는 숫자 그대로.
 * 쿼터·UI 표시용 숫자 한도를 뽑을 때 사용.
 */
export function featureLimit(plan: Plan, feature: keyof PlanFeatures): number {
  const val = PLANS[plan].features[feature];
  if (val === "unlimited") return Infinity;
  if (typeof val === "number") return val;
  if (typeof val === "boolean") return val ? Infinity : 0;
  return 0;
}

/* ═══════════════════════════════════════════════════════════════════════
   PRODUCTS_KR — 한국 시장용 단건/구독 상품 카탈로그 (Day 5)
   ───────────────────────────────────────────────────────────────────────
   types/admission.ts 의 ProductKind 와 1:1 매핑.

   ⚠️ 일부 가격은 placeholder — 클라이언트 확정 후 P-014 정책으로
   `docs/policy.md` 에 등록해야 한다. 본 PR 단계에선 결제 흐름 검증만 목적.
   QA round 2 ④ (2026-05-25): season_pass·consult_one·season_consult_* 가격 확정.
   ⚠️ 토스 시크릿은 dev_test 키로 작업 — staging 가입 후 live 키로 교체.

   P-001 정합성:
   - report_one (단건 분석 리포트)은 사용자가 특정 학과를 선택해 결제하지 않는다.
     사용자는 "리포트 1회"를 결제하고 분석 폼을 채워 결과를 받는 흐름이라
     표본 부족 학과를 직접 결제 대상으로 지정하는 건 구조적으로 불가.
   - season_pass / subscription_*: 학과 무관하게 전체 활성화. 표본 부족 학과의
     분석은 여전히 비공개(insufficient_sample)지만 결제 환불 사유 X.
   ═══════════════════════════════════════════════════════════════════════ */

import type { ConsultingTimeSlot, ProductKind } from "@/types/admission";

/** 번들 동봉 내용 정의 (PRODUCTS_KR 카탈로그 메타) */
export interface ProductBundleContent {
  kind: "subscription" | "consulting";
  count: number;
  /** 컨설팅 시기 지정 — count 와 길이 일치 필요. 없으면 시기 미지정. */
  timeSlots?: ConsultingTimeSlot[];
}

export interface ProductDefKr {
  /** types/admission.ts ProductKind와 일치 */
  kind: ProductKind;
  /** 사용자 노출명 — 결제창·영수증 */
  displayName: string;
  /** 짧은 설명 — 카드에 노출 */
  shortDescription: string;
  /** 결제 금액 (KRW). earlybird 기간엔 earlybirdPriceKrw 가 표시 우선. */
  priceKrw: number;
  /** QA round 2 ④ (2026-05-25) — 얼리버드 가격 (활성 기간 ≤ earlybirdUntil) */
  earlybirdPriceKrw?: number;
  /** 정가 (얼리버드 종료 후) — UI 에서 취소선 노출 시 사용 */
  regularPriceKrw?: number;
  /** 얼리버드 종료일 (ISO date). 이후엔 priceKrw 기준. */
  earlybirdUntil?: string;
  /** 토스 결제 주기. 단건은 "once". */
  period: "once" | "monthly" | "yearly";
  /** 권한 유효 기간 (일). 만료일 = 결제일 + durationDays. */
  durationDays: number;
  /**
   * 권한 매핑 — 결제 완료 시 UserEntitlement.active 에 추가될 메타.
   * featureFlag 는 클라/서버 모두에서 권한 체크에 사용.
   */
  grants: {
    /** 사용자 plan 승급 (구독 상품만 적용, 단건은 free 유지) */
    upgradePlan?: Plan;
    /** 학과 분석 권한 — Free preview 컷 해제 여부 */
    unlocksAnalysis?: boolean;
    /** 1:1 컨설팅 1회 사용권 (consult_one 한정) */
    consultCredits?: number;
  };
  /**
   * P-001 룰 — 사용자가 카드 클릭 시점에 표본 부족 학과가 선택돼 있으면 결제 차단.
   * report_one 같은 학과 미지정 단건엔 false. season_pass는 학과 무관 false.
   */
  blocksOnInsufficientSample: boolean;
  /** 출시 시점 노출 여부. P-014 가격 확정 전엔 일부 비활성화 가능. */
  enabled: boolean;
  /** 카드 highlight bullet — 사용자 의사결정 보조 */
  highlights: string[];
  /** placeholder 표기 사유 — UI 가격 라벨에 ⚠️ 마커로 노출 (P-002 정직성) */
  isPricePlaceholder: boolean;
  /**
   * 상품 카테고리 — UI 분류·라우팅·결제 흐름 분기에 사용.
   *   - 'analysis': 분석 단건/시즌권
   *   - 'subscription': 정기 구독
   *   - 'consulting': 1:1 컨설팅 (예약 캘린더 → /consulting 으로 이동)
   *   - 'bundle': 시즌권 + 컨설팅 패키지 (QA round 2 ④)
   */
  type: "analysis" | "subscription" | "consulting" | "bundle";
  /** 컨설팅 상품 전용 — 세션 길이 (분). 그 외 상품은 undefined. */
  durationMinutes?: number;
  /** 번들 상품 전용 — 동봉 컨텐츠 (subscription·consulting 조합) */
  bundleContents?: ProductBundleContent[];
}

/** ConsultingTimeSlot 별 사용 가능 시점 (ISO date) — 2027학년도 입시 일정 기준. */
export const TIME_SLOT_VALID_FROM: Record<ConsultingTimeSlot, string> = {
  before_june: "2026-06-01T00:00:00+09:00", // 6월 모의평가 이후 사용
  before_sept: "2026-09-01T00:00:00+09:00", // 9월 모의평가 이후 사용
  after_csat: "2026-11-14T00:00:00+09:00",  // 2026 수능일 (11/14) 이후
};

/** ConsultingTimeSlot → 사용자 노출 라벨 */
export const TIME_SLOT_LABELS: Record<ConsultingTimeSlot, string> = {
  before_june: "6월 모의평가 이후",
  before_sept: "9월 모의평가 이후",
  after_csat: "수능 이후",
};

/**
 * 한국 입시 단건·구독 상품 카탈로그.
 *
 * priceKrw 는 모두 ⚠️ placeholder. 클라이언트 결정 후 P-014 PR 에서 갱신.
 * 본 PR 단계의 결제 회귀 테스트는 가격 placeholder 마커가 UI에 노출되는지 검증.
 */
export const PRODUCTS_KR: Record<ProductKind, ProductDefKr> = {
  report_one: {
    kind: "report_one",
    type: "analysis",
    displayName: "분석 리포트 1회",
    shortDescription: "성적·비교과 입력 후 학과별 합격 가능성 1회 분석",
    priceKrw: 9900,
    period: "once",
    durationDays: 30,
    grants: { unlocksAnalysis: true },
    blocksOnInsufficientSample: false,
    enabled: true,
    isPricePlaceholder: true,
    highlights: [
      "분석 결과 30일 보관",
      "Reach·Match·Safety 분류",
      "학종 1단계 × 2단계 분해 표시 (P-006)",
    ],
  },
  season_pass: {
    kind: "season_pass",
    type: "analysis",
    displayName: "시즌권 (수시·정시 통합)",
    shortDescription: "시즌 전체 분석·재분석 무제한 (수시·정시 한 사이클)",
    // QA round 2 ④ (2026-05-25): 얼리버드 가격 적용. priceKrw = 결제 시 청구액 (얼리버드값).
    priceKrw: 29000,
    earlybirdPriceKrw: 29000,
    regularPriceKrw: 40000,
    earlybirdUntil: "2027-03-31",
    period: "once",
    durationDays: 180,
    grants: { unlocksAnalysis: true, upgradePlan: "pro" },
    blocksOnInsufficientSample: false,
    enabled: true,
    isPricePlaceholder: false,
    highlights: [
      "수시 + 정시 시즌 전체 (6개월)",
      "분석 재실행 무제한",
      "AI 카운슬러 무제한",
    ],
  },
  // 컨설팅 모듈 (2026-05-21 추가 계약 +110만원) — ProductKind 'consult_one' 의미 재정의.
  //   기존: AI 카운슬러 1회 → 신규: 1:1 입시 컨설팅 60분.
  //   QA round 2 ④ (2026-05-25): 가격 확정 (180,000원) + enabled=true 전환.
  consult_one: {
    kind: "consult_one",
    type: "consulting",
    displayName: "1:1 입시 컨설팅 (60분)",
    shortDescription: "코나투스 입시 컨설턴트와 1:1 입시 상담 (60분, 화상 또는 대면)",
    priceKrw: 180000,
    period: "once",
    durationDays: 60, // 결제일 ~60일 내 예약 사용
    durationMinutes: 60,
    grants: { consultCredits: 1 },
    blocksOnInsufficientSample: false,
    enabled: true,
    isPricePlaceholder: false,
    highlights: [
      "코나투스 입시 컨설턴트와 1:1 60분 상담",
      "신청서 기반 맞춤 진단",
      "정시·수시·학종 전략 통합",
    ],
  },
  // QA round 2 ④ (2026-05-25) — 시즌권 + 컨설팅 1회 번들.
  season_consult_1: {
    kind: "season_consult_1",
    type: "bundle",
    displayName: "시즌권 + 1:1 컨설팅 1회",
    shortDescription: "시즌권 + 1:1 컨설팅 1회 패키지 (얼리버드)",
    priceKrw: 190000,
    earlybirdPriceKrw: 190000,
    regularPriceKrw: 300000,
    earlybirdUntil: "2027-03-31",
    period: "once",
    durationDays: 180,
    grants: { unlocksAnalysis: true, upgradePlan: "pro", consultCredits: 1 },
    blocksOnInsufficientSample: false,
    enabled: true,
    isPricePlaceholder: false,
    // BUG-017 (QA round 3, 2026-05-25): 정적 "절약" 카피는 잘못된 9.5x 부풀린 값이었음.
    // 절약액은 calculateBundleSavings() 가 동적으로 계산하여 PricingCard 에서 노출.
    highlights: [
      "시즌권 분석 무제한 (6개월)",
      "1:1 컨설팅 1회 (60분)",
    ],
    bundleContents: [
      { kind: "subscription", count: 1 },
      { kind: "consulting", count: 1 },
    ],
  },
  // QA round 2 ④ — 시즌권 + 컨설팅 3회 (시기 지정) 번들.
  season_consult_3: {
    kind: "season_consult_3",
    type: "bundle",
    displayName: "시즌권 + 1:1 컨설팅 3회 (6모/9모/수능 이후)",
    shortDescription: "시즌권 + 시기별 1:1 컨설팅 3회 패키지 (얼리버드)",
    priceKrw: 490000,
    earlybirdPriceKrw: 490000,
    regularPriceKrw: 700000,
    earlybirdUntil: "2027-03-31",
    period: "once",
    durationDays: 365, // 수능 이후 슬롯까지 사용 가능하도록 1년 보장
    grants: { unlocksAnalysis: true, upgradePlan: "pro", consultCredits: 3 },
    blocksOnInsufficientSample: false,
    enabled: true,
    isPricePlaceholder: false,
    highlights: [
      "시즌권 분석 무제한 (1년)",
      "1:1 컨설팅 3회 — 6월 모평·9월 모평·수능 이후",
      "시기별 최적 타이밍 보장",
    ],
    bundleContents: [
      { kind: "subscription", count: 1 },
      {
        kind: "consulting",
        count: 3,
        timeSlots: ["before_june", "before_sept", "after_csat"],
      },
    ],
  },
  subscription_pro: {
    kind: "subscription_pro",
    type: "subscription",
    displayName: "Pro 월간 구독",
    shortDescription: "분석·상담·시뮬레이션 무제한 — 월 단위",
    priceKrw: 29000,
    period: "monthly",
    durationDays: 30,
    grants: { unlocksAnalysis: true, upgradePlan: "pro" },
    blocksOnInsufficientSample: false,
    enabled: false, // P-014 가격 확정 후 활성화
    isPricePlaceholder: true,
    highlights: [
      "분석 무제한",
      "AI 카운슬러 무제한",
      "What-If 시뮬레이션",
    ],
  },
  subscription_elite: {
    kind: "subscription_elite",
    type: "subscription",
    displayName: "Elite 월간 구독",
    shortDescription: "Pro의 모든 기능 + 우선 응답 + 학부모 리포트",
    priceKrw: 79000,
    period: "monthly",
    durationDays: 30,
    grants: { unlocksAnalysis: true, upgradePlan: "elite" },
    blocksOnInsufficientSample: false,
    enabled: false, // P-014 가격 확정 후 활성화
    isPricePlaceholder: true,
    highlights: [
      "Pro의 모든 기능",
      "12월 마감 우선 응답 (24시간)",
      "학부모 주간 리포트",
    ],
  },
};

/** 활성화된 상품만 — UI 카탈로그용. */
export function listEnabledProductsKr(): ProductDefKr[] {
  return Object.values(PRODUCTS_KR).filter((p) => p.enabled);
}

/** ProductKind → 메타 lookup. 미존재 시 null. */
export function getProductKr(kind: ProductKind | string): ProductDefKr | null {
  if (kind in PRODUCTS_KR) return PRODUCTS_KR[kind as ProductKind];
  return null;
}

/**
 * 현 시점에 적용되는 결제 금액 — 얼리버드 기간 안이면 earlybirdPriceKrw, 그 외 priceKrw.
 *
 * 호출 시점에 따라 가격이 바뀌므로 결제 API·UI 모두 본 함수를 통과해 단일 진실.
 * earlybirdUntil 은 KST 자정(00:00:00+09:00) 까지로 해석 → 1일 끝까지 얼리버드.
 */
export function getEffectivePriceKrw(p: ProductDefKr, now: Date = new Date()): number {
  if (p.earlybirdPriceKrw == null || !p.earlybirdUntil) return p.priceKrw;
  const eb = Date.parse(`${p.earlybirdUntil}T23:59:59+09:00`);
  if (Number.isNaN(eb)) return p.priceKrw;
  return now.getTime() <= eb ? p.earlybirdPriceKrw : (p.regularPriceKrw ?? p.priceKrw);
}

/** 얼리버드 기간 안인지 — UI 배지·취소선 노출 판정. */
export function isEarlybirdActive(p: ProductDefKr, now: Date = new Date()): boolean {
  if (!p.earlybirdUntil || p.earlybirdPriceKrw == null) return false;
  const eb = Date.parse(`${p.earlybirdUntil}T23:59:59+09:00`);
  return !Number.isNaN(eb) && now.getTime() <= eb;
}

/**
 * 번들 상품의 단건 합산 vs 번들 가격 비교 — "절약" 표기 단일 진실 (BUG-017).
 *
 * 단건 가격은 동 시점의 effective 가격 (얼리버드 OR 정가) 적용.
 * 따라서 얼리버드 기간 안/밖 모두 정확한 절약액.
 *
 * 정직성 (P-002):
 *   - savings ≤ 0 면 호출자가 "절약" 카피 노출 X (음수 절약 = 번들이 더 비쌈).
 *   - bundle 이 아니거나 bundleContents 없으면 null.
 */
export interface BundleSavings {
  /** 동봉 항목들의 단건 합산 (현 시점 effective 가격 기준) */
  individualTotal: number;
  /** 번들 자체의 현 시점 effective 가격 */
  bundlePrice: number;
  /** 단건 합산 − 번들 가격. 양수면 절약, 0 이하면 절약 X. */
  savings: number;
}

export function calculateBundleSavings(
  product: ProductDefKr,
  now: Date = new Date(),
): BundleSavings | null {
  if (product.type !== "bundle" || !product.bundleContents) return null;
  let individualTotal = 0;
  for (const part of product.bundleContents) {
    if (part.kind === "subscription") {
      const sp = getProductKr("season_pass");
      if (!sp) continue;
      individualTotal += getEffectivePriceKrw(sp, now) * part.count;
    } else if (part.kind === "consulting") {
      const co = getProductKr("consult_one");
      if (!co) continue;
      individualTotal += getEffectivePriceKrw(co, now) * part.count;
    }
  }
  const bundlePrice = getEffectivePriceKrw(product, now);
  return {
    individualTotal,
    bundlePrice,
    savings: individualTotal - bundlePrice,
  };
}

/**
 * 결제 가능 여부 — P-001 게이트.
 * 호출자가 표본 부족 학과 결제 시도를 차단하려면 본 함수로 사전 검증.
 */
export function canPurchaseProductKr(
  kind: ProductKind,
  ctx: { targetingInsufficientSampleDept: boolean },
): { allowed: true } | { allowed: false; reason: string } {
  const prod = getProductKr(kind);
  if (!prod || !prod.enabled) {
    return { allowed: false, reason: "상품을 찾을 수 없거나 비활성화 상태입니다." };
  }
  if (prod.blocksOnInsufficientSample && ctx.targetingInsufficientSampleDept) {
    return {
      allowed: false,
      reason:
        "선택한 학과는 합격 사례 표본이 부족해 분석을 표시할 수 없습니다. 표본이 누적된 후 다시 시도하세요. (환불 분쟁 방지를 위해 사전 차단 — P-001)",
    };
  }
  return { allowed: true };
}
