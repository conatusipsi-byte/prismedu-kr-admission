/**
 * orderId 생성·파싱 — 한국 입시 결제용 (prismedu.kr `parseOrderId` 어댑터)
 *
 * orderId 포맷: `kr_{productKind}_{period}_{uid}_{timestamp}_{nonce}`
 *
 * 예: `kr_report_one_once_yJk8...vQz_1730000000000_a1B2c3`
 *
 * 분리 이유:
 *   - 토스 confirm 시 클라가 보낸 amount가 어떤 상품인지 서버가 역추출 (productKind)
 *   - uid 일치 검증으로 타인 결제로 본인 권한 활성화 차단
 *   - timestamp 30분 창 — replay/만료 차단
 *   - nonce — 동시 발급 충돌 방지 + 추측 어려움
 *
 * route.ts에서 분리: Next.js API route 파일은 HTTP method export만 허용.
 *
 * prismedu.kr `parseOrderId`와의 차이:
 *   - 한국은 단건+구독 5종 productKind. prismedu.kr는 plan(pro/elite)×billing 2×2.
 *   - period 차원이 추가됨 (단건은 once).
 *   - nonce 추가 — 한국은 단건 결제 빈도가 높아 같은 ms 충돌 가능성 더 높음.
 */

import type { ProductKind } from "@/types/admission";

/**
 * orderId 정규식.
 *
 * - kr 접두사로 prismedu.kr `PRISM_*` 와 시각 분리
 * - productKind: 5종 enum 그대로 (report_one, season_pass, consult_one, subscription_pro, subscription_elite)
 * - period: once / monthly / yearly
 * - uid: Supabase Auth UUID (영숫자 + 하이픈, 36자 표준) 또는 레거시 Firebase uid (영숫자 28자)
 * - timestamp: ms 13~16자
 * - nonce: 6자 영숫자
 *
 * subscription_pro·subscription_elite 처럼 productKind가 underscore를 포함하므로
 * named capture group으로 분해.
 */
const KR_ORDER_ID_REGEX =
  /^kr_(report_one|season_pass|consult_one|subscription_pro|subscription_elite|season_consult_1|season_consult_3)_(once|monthly|yearly)_([A-Za-z0-9-]{20,40})_(\d{13,16})_([A-Za-z0-9]{6})$/;

export type OrderPeriod = "once" | "monthly" | "yearly";

export interface ParsedKrOrderId {
  productKind: ProductKind;
  period: OrderPeriod;
  uid: string;
  /** ms (Date.now()) */
  timestamp: number;
  nonce: string;
  /** 원본 orderId (로그·도큐먼트 ID 용도) */
  raw: string;
}

/** orderId 형식 검증 + 분해. 실패 시 null. */
export function parseKrOrderId(orderId: string): ParsedKrOrderId | null {
  if (typeof orderId !== "string") return null;
  const m = KR_ORDER_ID_REGEX.exec(orderId);
  if (!m) return null;
  const ts = Number(m[4]);
  if (!Number.isFinite(ts)) return null;
  return {
    productKind: m[1] as ProductKind,
    period: m[2] as OrderPeriod,
    uid: m[3],
    timestamp: ts,
    nonce: m[5],
    raw: orderId,
  };
}

/**
 * orderId 생성.
 *
 * @param uid Firebase Auth uid — 호출자 세션 uid 강제 (서버에서 클라 입력 신뢰 X)
 * @param productKind 상품 종류
 * @param period 결제 주기 (단건은 "once")
 * @returns `kr_{kind}_{period}_{uid}_{timestamp}_{nonce}` 형식 문자열
 */
export function buildKrOrderId(
  uid: string,
  productKind: ProductKind,
  period: OrderPeriod,
): string {
  // Supabase UUID(하이픈 포함 36자) + 레거시 Firebase uid(영숫자 20~40자) 모두 허용
  if (!/^[A-Za-z0-9-]{20,40}$/.test(uid)) {
    throw new Error(`buildKrOrderId: 유효하지 않은 uid 형식 (${uid.length}자)`);
  }
  const timestamp = Date.now();
  const nonce = generateNonce();
  return `kr_${productKind}_${period}_${uid}_${timestamp}_${nonce}`;
}

/** 6자 영숫자 nonce — Math.random 기반 (보안 토큰 X — 단순 충돌 회피용). */
function generateNonce(): string {
  // crypto.randomUUID는 36자 → 6자만 잘라 영숫자만 통과
  // Edge runtime + Node 양쪽 호환을 위해 Math.random 사용 (충돌 회피만이 목적이라 OK)
  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += charset[Math.floor(Math.random() * charset.length)];
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════════════════
   표시용 주문번호 — uid 미노출 (정보 위생, P2 2-1)
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * 사용자 화면용 주문번호. 내부 orderId 는 uid 를 포함(서버 검증에 필요)하지만,
 * 화면/스크린샷에 인증 식별자가 새지 않도록 uid 를 제거한 표시 문자열을 만든다.
 * orderId 포맷·DB·토스 연동은 그대로 두므로 기존/진행중 주문과 100% 호환.
 *
 *   kr_report_one_once_{uid}_{ts}_{nonce}  →  kr_report_one_once_{ts}_{nonce}
 *
 * 파싱 불가(레거시 등) 시 끝 8자만 노출(uid 구간이 아니라 안전).
 */
export function toDisplayOrderNumber(orderId: string): string {
  if (typeof orderId !== "string" || !orderId) return "";
  const parsed = parseKrOrderId(orderId);
  if (!parsed) {
    return orderId.length > 8 ? `…${orderId.slice(-8)}` : orderId;
  }
  return `kr_${parsed.productKind}_${parsed.period}_${parsed.timestamp}_${parsed.nonce}`;
}

/* ═══════════════════════════════════════════════════════════════════════
   timestamp 유효성 — replay/만료 차단
   ═══════════════════════════════════════════════════════════════════════ */

/** 결제 confirm 시 timestamp 유효성 창 */
export const ORDER_TIMESTAMP_MAX_AGE_MS = 30 * 60 * 1000; // 30분
export const ORDER_TIMESTAMP_FUTURE_TOLERANCE_MS = 2 * 60 * 1000; // 미래 2분 (클라 시계 skew)

export type TimestampValidity =
  | { valid: true }
  | { valid: false; reason: "expired" | "future" };

export function validateOrderTimestamp(
  timestampMs: number,
  now: number = Date.now(),
): TimestampValidity {
  const ageMs = now - timestampMs;
  if (ageMs > ORDER_TIMESTAMP_MAX_AGE_MS) return { valid: false, reason: "expired" };
  if (ageMs < -ORDER_TIMESTAMP_FUTURE_TOLERANCE_MS) return { valid: false, reason: "future" };
  return { valid: true };
}
