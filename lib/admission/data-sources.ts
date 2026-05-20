/**
 * 입시 데이터 출처 통합 — KCUE OpenAPI / PDF 파싱 / OCR / 수동입력 의 충돌 조정
 *
 * 한 학과의 같은 필드(예: 정원 / 등록금 / 학과명)에 대해 여러 출처가 값을 줄
 * 수 있다. 본 모듈은 신뢰도 계층을 정의하고 충돌 시 우선순위를 결정한다.
 *
 *   KCUE OpenAPI (공식 공시)      → 'trusted'           ← 최상위
 *   PDF / 직접 제공 (pdftotext)    → 'trusted-fallback'  ← 2순위
 *   OCR (Tesseract)               → 'suspicious'        ← 운영자 검수 필요
 *   수동 입력 (운영자)             → 호출자가 명시 (보통 'trusted')
 *
 * 정직성 (P-002):
 *   - 출처가 다른 데이터를 무음 병합하지 않는다 — UI 노출용 sourceLabel 필수.
 *   - suspicious 한 출처가 trusted 값을 덮어쓰지 않는다 (낮음→높음 갱신만 허용).
 *   - 수치 충돌 시 KCUE 우선 (공공기관 권위 + 표준화된 측정).
 *
 * UI 노출 라벨:
 *   trusted          → "한국대학교육협의회 공시 자료"
 *   trusted-fallback → "대학 공식 모집요강"
 *   suspicious       → "자동 인식 (검수 전)"
 */

import type { ParserTrustLevel } from "../../scripts/etl/parsers/types";

/* ═══════════════════════════════════════════════════════════════════════
   타입
   ═══════════════════════════════════════════════════════════════════════ */

/** 데이터 출처 종류. UI 표시용 라벨 매핑 + 우선순위 계산에 사용. */
export type DataSourceKind =
  | "kcue_openapi" // 한국대학교육협의회 공시 (academyinfo.go.kr)
  | "pdf_extract" // PDF 모집요강 텍스트 추출 (pdftotext)
  | "ocr" // OCR 결과 (Tesseract)
  | "manual_admin" // 운영자 수동 입력
  | "csv_csat"; // 수능 통계 CSV (KICE)

export interface DataSourceTag {
  kind: DataSourceKind;
  trustLevel: ParserTrustLevel;
  /** 가져온 일시 — Supabase 저장 시 ISO string */
  fetchedAt: string;
  /** UI 표시용 라벨 */
  label: string;
  /** 원본 식별자 (KCUE op 이름·PDF 파일명 등) */
  originRef?: string;
}

/** 한 필드 값 + 그 출처 — 충돌 해소 단위. */
export interface ValueWithSource<T> {
  value: T;
  source: DataSourceTag;
}

/* ═══════════════════════════════════════════════════════════════════════
   trustLevel 순서 + 비교
   ═══════════════════════════════════════════════════════════════════════ */

/** 작을수록 신뢰도 높음 (정렬·비교용). */
const TRUST_RANK: Record<ParserTrustLevel, number> = {
  trusted: 0,
  "trusted-fallback": 1,
  suspicious: 2,
};

/** a 가 b 보다 강한(=낮은 rank) 신뢰도이면 true. */
export function isStrongerTrust(a: ParserTrustLevel, b: ParserTrustLevel): boolean {
  return TRUST_RANK[a] < TRUST_RANK[b];
}

/** 두 신뢰도 중 약한 쪽(=높은 rank)을 반환 — chain 결과의 최저 신뢰도. */
export function weakerTrust(a: ParserTrustLevel, b: ParserTrustLevel): ParserTrustLevel {
  return TRUST_RANK[a] >= TRUST_RANK[b] ? a : b;
}

/* ═══════════════════════════════════════════════════════════════════════
   DataSourceKind → 기본 신뢰도·라벨 매핑
   ═══════════════════════════════════════════════════════════════════════ */

interface SourceMeta {
  defaultTrust: ParserTrustLevel;
  label: string;
}

const SOURCE_META: Record<DataSourceKind, SourceMeta> = {
  kcue_openapi: {
    defaultTrust: "trusted",
    label: "한국대학교육협의회 공시 자료",
  },
  pdf_extract: {
    defaultTrust: "trusted-fallback",
    label: "대학 공식 모집요강",
  },
  ocr: {
    defaultTrust: "suspicious",
    label: "자동 인식 (검수 전)",
  },
  manual_admin: {
    defaultTrust: "trusted",
    label: "운영자 직접 입력",
  },
  csv_csat: {
    defaultTrust: "trusted",
    label: "한국교육과정평가원 수능 통계",
  },
};

/**
 * DataSourceKind 로부터 DataSourceTag 생성. 신뢰도를 명시 override 하면 그 값
 * (예: PDF 가 OCR fallback 으로 떨어진 경우 'suspicious').
 */
export function makeSourceTag(
  kind: DataSourceKind,
  opts: {
    fetchedAt?: string;
    originRef?: string;
    trustOverride?: ParserTrustLevel;
  } = {},
): DataSourceTag {
  const meta = SOURCE_META[kind];
  return {
    kind,
    trustLevel: opts.trustOverride ?? meta.defaultTrust,
    fetchedAt: opts.fetchedAt ?? new Date().toISOString(),
    label: meta.label,
    originRef: opts.originRef,
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   충돌 해소 — 같은 필드의 여러 후보 중 1개 선택
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * 후보들 중 신뢰도가 가장 높은 값을 반환. 동일 신뢰도 사이에선:
 *   1) kcue_openapi 가 절대 우선 (공공기관 권위)
 *   2) 그 다음 manual_admin
 *   3) 그 다음 fetchedAt 최신
 *
 * 후보 없음 → undefined.
 */
export function resolveValue<T>(
  candidates: ReadonlyArray<ValueWithSource<T>>,
): ValueWithSource<T> | undefined {
  if (candidates.length === 0) return undefined;
  const sorted = [...candidates].sort((a, b) => {
    const trustDiff = TRUST_RANK[a.source.trustLevel] - TRUST_RANK[b.source.trustLevel];
    if (trustDiff !== 0) return trustDiff;
    const aKcue = a.source.kind === "kcue_openapi" ? 0 : 1;
    const bKcue = b.source.kind === "kcue_openapi" ? 0 : 1;
    if (aKcue !== bKcue) return aKcue - bKcue;
    const aManual = a.source.kind === "manual_admin" ? 0 : 1;
    const bManual = b.source.kind === "manual_admin" ? 0 : 1;
    if (aManual !== bManual) return aManual - bManual;
    // fetchedAt 최신
    return (Date.parse(b.source.fetchedAt) || 0) - (Date.parse(a.source.fetchedAt) || 0);
  });
  return sorted[0];
}

/* ═══════════════════════════════════════════════════════════════════════
   여러 필드 동시 해소 — 부분 객체 병합
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * 부분 객체들의 같은 키 값을 resolveValue 로 병합. 각 객체의 출처는 동일 — 한
 * 출처에서 부분만 채워온 결과들을 모은 형태.
 *
 *   const merged = mergeBySource({
 *     name:   [{ value: "동국대학교", source: kcueTag }, { value: "동국대",   source: pdfTag }],
 *     quota:  [{ value: 5000,         source: kcueTag }],
 *   });
 *   // → { name: "동국대학교"(kcue), quota: 5000(kcue) }
 */
export function mergeBySource<T extends Record<string, unknown>>(
  candidatesByKey: { [K in keyof T]: ReadonlyArray<ValueWithSource<T[K]>> },
): { [K in keyof T]: ValueWithSource<T[K]> | undefined } {
  const out = {} as { [K in keyof T]: ValueWithSource<T[K]> | undefined };
  for (const key of Object.keys(candidatesByKey) as Array<keyof T>) {
    out[key] = resolveValue(candidatesByKey[key]);
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════════════════
   UI 노출 헬퍼
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * 한 학과·필드의 출처 + 갱신일 + 라벨을 UI 카드용 객체로.
 * 정직성 원칙 — 출처를 사용자에게 보이는 곳마다 함께 노출.
 */
export interface UiSourceAttribution {
  /** UI 표시 라벨 (예: "한국대학교육협의회 공시 자료") */
  label: string;
  /** "2026-05-20 갱신" 같이 표시할 ISO 일자 */
  fetchedAt: string;
  /** UX 색상 마커용 — `trusted` 이면 mint, `suspicious` 면 amber */
  trustLevel: ParserTrustLevel;
  /** 디버그용 origin (UI 노출 X) */
  originRef?: string;
}

export function toUiAttribution(source: DataSourceTag): UiSourceAttribution {
  return {
    label: source.label,
    fetchedAt: source.fetchedAt,
    trustLevel: source.trustLevel,
    originRef: source.originRef,
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   디버그 / 테스트 헬퍼
   ═══════════════════════════════════════════════════════════════════════ */

export const __test__ = {
  TRUST_RANK,
  SOURCE_META,
};
