/**
 * 30일치 mock sanitize 이벤트 — /admin/sanitize-monitor 페이지 동작 검증용
 *
 * ⚠️ TODO: Firestore monitoring/sanitizeEvents 컬렉션으로 교체.
 *
 * 이벤트 분포 (30일):
 *   - 표본 부족 트리거: 약 60% (가장 흔함)
 *   - 차단 키워드: 약 30% (% 수치, "확정 합격" 등)
 *   - 회귀 의심: 약 10% (운영자 점검 우선)
 */

import type { SanitizeEvent, SanitizeTriggerType } from "./sanitize-events";

const NOW = new Date("2026-05-08T18:00:00Z");

interface MockTemplate {
  triggerType: SanitizeTriggerType;
  matchedKeywords: string[];
  originalResponseExcerpt: string;
  sanitizedResponse: string;
  relatedDepartments?: SanitizeEvent["relatedDepartments"];
  resolved?: boolean;
}

const TEMPLATES: MockTemplate[] = [
  {
    triggerType: "insufficient_sample",
    matchedKeywords: ["확률"],
    originalResponseExcerpt:
      "연세대 컴퓨터과학과는 학생부종합전형으로 약 25% 확률로 합격할 가능성이 있습니다. 내신과 비교과 활동을 종합 검토해보면...",
    sanitizedResponse:
      "연세대 컴퓨터과학과의 학생부종합전형은 현재 합격 사례 표본이 부족해 정확한 확률을 안내드리기 어렵습니다. 모집요강과 일정은 확인 가능합니다.",
    relatedDepartments: [{ universityId: "yonsei", departmentId: "cs" }],
    resolved: true,
  },
  {
    triggerType: "blocked_keyword",
    matchedKeywords: ["%", "확정"],
    originalResponseExcerpt:
      "고려대 의대는 정시 백분위 99% 이상이면 확정 합격이 가능합니다. 작년 컷도 99.2였고...",
    sanitizedResponse:
      "고려대 의예과 정시는 매년 최상위권 학생들이 지원합니다. 정확한 합격선은 분석 페이지에서 확인하세요.",
    relatedDepartments: [{ universityId: "korea", departmentId: "med" }],
    resolved: true,
  },
  {
    triggerType: "regression_suspect",
    matchedKeywords: ["거의 확실", "보장"],
    originalResponseExcerpt:
      "성균관대 글로벌경제학과는 거의 확실히 합격하실 거 같습니다. 내신 1.5등급 + 수능 백분위 95면 보장 가능한 수준입니다...",
    sanitizedResponse:
      "성균관대 글로벌경제학과의 합격 가능성은 분석 페이지에서 확인하시기 바랍니다.",
    relatedDepartments: [{ universityId: "skku", departmentId: "global-econ" }],
    resolved: false, // 미해결 — 운영자 즉시 점검 대상
  },
  {
    triggerType: "insufficient_sample",
    matchedKeywords: ["%"],
    originalResponseExcerpt:
      "중앙대 영상학과 실기 전형은 대략 30% 정도 합격 가능성이 있어 보입니다.",
    sanitizedResponse:
      "중앙대 영상학과 실기 전형은 표본이 부족해 합격률 안내가 어렵습니다.",
    relatedDepartments: [{ universityId: "cau", departmentId: "film" }],
    resolved: true,
  },
  {
    triggerType: "blocked_keyword",
    matchedKeywords: ["반드시", "합격"],
    originalResponseExcerpt:
      "이 학과는 본인 스펙이라면 반드시 합격하실 수 있습니다.",
    sanitizedResponse:
      "본 학과의 합격 가능성은 분석 페이지에서 확인하시기 바랍니다.",
    resolved: true,
  },
  {
    triggerType: "regression_suspect",
    matchedKeywords: ["진학사", "대학어디가"],
    originalResponseExcerpt:
      "진학사 자료에 따르면 작년 합격선이 78점이었고, 대학어디가 통계로는...",
    sanitizedResponse:
      "외부 사이트 정보는 인용하지 않습니다. 본 서비스의 분석 결과를 참고하세요.",
    resolved: false, // 외부 사이트 인용 — 정직성 원칙 위반
  },
];

/**
 * 30일치 가짜 이벤트 생성. 시간 분포는 실제 운영 패턴 모방:
 *  - 평일 낮 시간대 비중 높음
 *  - 시즌(7~11월) 가정해 야간에도 드물게 발생
 *
 * 본 함수는 결정적(deterministic) — 매번 같은 결과 반환.
 * mock 데이터의 결정적 특성 → 회귀 테스트가 안정.
 */
export function generateMockEvents(now: Date = NOW): SanitizeEvent[] {
  const events: SanitizeEvent[] = [];
  let id = 1;

  // 30일치 매일 1~5건씩 분포
  for (let dayOffset = 29; dayOffset >= 0; dayOffset--) {
    const dailyCount = ((dayOffset * 7 + 13) % 5) + 1; // 1~5건
    for (let i = 0; i < dailyCount; i++) {
      const tplIdx = (dayOffset * 31 + i * 17) % TEMPLATES.length;
      const tpl = TEMPLATES[tplIdx];

      const hour = 9 + ((dayOffset + i * 3) % 12); // 9~20시 분포
      const minute = (i * 13 + dayOffset * 7) % 60;
      const occurredAt = new Date(now);
      occurredAt.setUTCDate(occurredAt.getUTCDate() - dayOffset);
      occurredAt.setUTCHours(hour, minute, 0, 0);

      events.push({
        id: `mock-${id++}`,
        occurredAt: occurredAt.toISOString(),
        saltedUidHash: `u_${(id * 31 + dayOffset).toString(36)}${"a".repeat(6)}`,
        triggerType: tpl.triggerType,
        matchedKeywords: tpl.matchedKeywords,
        originalResponseExcerpt: tpl.originalResponseExcerpt,
        sanitizedResponse: tpl.sanitizedResponse,
        userContext: {
          grade: 1 + ((dayOffset + i) % 3),
          schoolType: ["general", "autonomous", "special_purpose"][dayOffset % 3],
        },
        relatedDepartments: tpl.relatedDepartments,
        resolved: tpl.resolved ?? true,
        resolvedBy: tpl.resolved !== false ? "admin@example.com" : undefined,
        resolveNote:
          tpl.resolved !== false ? "검수 완료 — 일반 패턴" : undefined,
      });
    }
  }

  return events.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

/** 본 mock 의 같은 기간 chat 호출 수 (집계 분모) — 결정적 추정 */
export function getMockTotalChatCalls(period: "24h" | "7d" | "30d"): number {
  const days = period === "24h" ? 1 : period === "7d" ? 7 : 30;
  // 일평균 약 200건 가정
  return days * 200;
}

/** 결과 캐시 — 매번 generate 안 하도록 */
let _cache: SanitizeEvent[] | null = null;
export function getMockEvents(): SanitizeEvent[] {
  if (!_cache) _cache = generateMockEvents();
  return _cache;
}
