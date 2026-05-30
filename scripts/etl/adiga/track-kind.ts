/**
 * 어디가 전형 분류 → conatus AdmissionTrackKind 매핑 (2026-05-30).
 *
 * 어디가는 모집시기(수시/정시(가/나/다))와 전형유형(학생부위주(교과)/학생부위주(종합)/논술위주/실기/실적위주/수능위주)
 * 을 별도 차원으로 표기 → 두 차원을 조합해 conatus 단일 kind 도출.
 *
 * 정직성 (P-002):
 *   - 매핑 불가 → "unmapped" 반환. 호출 측이 명시적으로 처리 (가짜 fallback 금지).
 *   - 농어촌·지역인재 등 specialType 은 이름 패턴으로 별도 추출.
 */

import type { AdmissionTrackKind, SpecialAdmissionType } from "@/types/admission";

export type TrackKindResult =
  | { ok: true; kind: AdmissionTrackKind; specialType: SpecialAdmissionType; reason: string }
  | { ok: false; reason: string };

/* ──────────────────────────────────────────────────────────────────
   전형명 → specialType (정원외 모집)
   ────────────────────────────────────────────────────────────────── */

const SPECIAL_PATTERNS: Array<{ re: RegExp; type: SpecialAdmissionType }> = [
  { re: /농어촌|농·어촌|농어업|농어촌학생/i, type: "agricultural" },
  { re: /지역인재|지역균형|지역우수/i, type: "general" }, // 지역균형은 일반 (정원내)
  { re: /기회균형|기회균등|국가보훈|저소득|국가배려|장애인|장애학생|새터민|북한이탈/i, type: "low_income" },
  { re: /재외국민|외국인|특례입학/i, type: "overseas" },
  { re: /특성화고|마이스터고|특목고/i, type: "etc" },
];

export function detectSpecialType(trackName: string): SpecialAdmissionType {
  for (const { re, type } of SPECIAL_PATTERNS) {
    if (re.test(trackName)) return type;
  }
  return "general";
}

/* ──────────────────────────────────────────────────────────────────
   모집시기 → 정시 군 (수시는 jeongsi_* 매핑 X)
   ────────────────────────────────────────────────────────────────── */

function jeongsiGroupFromPeriod(period: string): "ga" | "na" | "da" | null {
  if (/정시\s*\(?\s*가\s*\)?/i.test(period)) return "ga";
  if (/정시\s*\(?\s*나\s*\)?/i.test(period)) return "na";
  if (/정시\s*\(?\s*다\s*\)?/i.test(period)) return "da";
  return null;
}

/* ──────────────────────────────────────────────────────────────────
   메인 매핑
   ────────────────────────────────────────────────────────────────── */

/**
 * 어디가 (전형유형, 모집시기) → conatus AdmissionTrackKind.
 *
 *   학생부위주(교과)  → susi_subject
 *   학생부위주(종합)  → susi_comprehensive
 *   논술위주          → susi_essay
 *   실기/실적위주     → susi_practical (수시) / jeongsi 라면 군별 + practical 보조
 *   수능위주          → jeongsi_{ga|na|da}  (모집시기로 군 결정)
 *   기타              → 매핑 보류 → ok=false
 *   재외국민/외국인   → jaeoegukmin (전형명 추가 판정)
 */
export function mapAdigaToTrackKind(args: {
  trackType: string;     // e.g., "학생부위주(교과)"
  period: string;        // e.g., "수시", "정시(가)"
  trackName: string;     // e.g., "지역균형전형"
}): TrackKindResult {
  const { trackType, period, trackName } = args;

  // 재외국민/외국인은 trackName 우선 — 모집시기에 묶이지 않음
  if (/재외국민|외국인|특례입학/.test(trackName)) {
    return {
      ok: true,
      kind: "jaeoegukmin",
      specialType: "overseas",
      reason: "trackName 에 재외국민/외국인 키워드 → jaeoegukmin",
    };
  }

  const isJeongsi = /정시/.test(period);
  const isSusi = /수시/.test(period);
  const isAdditional = /추가/.test(period);

  // 수능위주 → 정시 (군별)
  if (/수능\s*위주/.test(trackType)) {
    const grp = jeongsiGroupFromPeriod(period);
    if (grp) {
      return {
        ok: true,
        kind: (`jeongsi_${grp}` as AdmissionTrackKind),
        specialType: detectSpecialType(trackName),
        reason: `수능위주 + 정시(${grp})`,
      };
    }
    return { ok: false, reason: `수능위주인데 정시 군 식별 실패 (period="${period}")` };
  }

  // 정시 군이 명시되어 있고 trackType 이 모호한 경우 → 정시 군 우선
  if (isJeongsi) {
    const grp = jeongsiGroupFromPeriod(period);
    if (grp) {
      return {
        ok: true,
        kind: (`jeongsi_${grp}` as AdmissionTrackKind),
        specialType: detectSpecialType(trackName),
        reason: `정시(${grp}) trackType="${trackType}"`,
      };
    }
  }

  // 수시 — trackType 기반
  if (isSusi) {
    if (/학생부\s*위주.*교과/.test(trackType)) {
      return {
        ok: true,
        kind: "susi_subject",
        specialType: detectSpecialType(trackName),
        reason: "수시 + 학생부위주(교과)",
      };
    }
    if (/학생부\s*위주.*종합/.test(trackType)) {
      return {
        ok: true,
        kind: "susi_comprehensive",
        specialType: detectSpecialType(trackName),
        reason: "수시 + 학생부위주(종합)",
      };
    }
    if (/논술\s*위주/.test(trackType)) {
      return {
        ok: true,
        kind: "susi_essay",
        specialType: detectSpecialType(trackName),
        reason: "수시 + 논술위주",
      };
    }
    if (/실기|실적/.test(trackType)) {
      return {
        ok: true,
        kind: "susi_practical",
        specialType: detectSpecialType(trackName),
        reason: "수시 + 실기/실적위주",
      };
    }
  }

  if (isAdditional) {
    return {
      ok: true,
      kind: "additional",
      specialType: detectSpecialType(trackName),
      reason: "추가모집",
    };
  }

  return {
    ok: false,
    reason: `매핑 불가 (trackType="${trackType}", period="${period}", trackName="${trackName}")`,
  };
}
