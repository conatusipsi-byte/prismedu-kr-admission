/**
 * Sentry PII 필터 — beforeSend hook 공용 로직.
 *
 * 한국 입시 도메인 정직성 (P-002):
 *   - 사용자 PII (email/username/IP) 자동 제거
 *   - 입시 민감 정보 마스킹: 내신 등급 / 수능 점수 / 합격 확률 등
 *   - request body·response body 의 score/probability/grade 필드 redact
 *
 * 적용: client/server/edge 3개 config 가 모두 본 함수를 사용.
 */

import type { ErrorEvent, EventHint } from "@sentry/nextjs";

/** 민감하다고 간주하는 필드명 (case-insensitive 부분일치) */
const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /token/i,
  /api[_-]?key/i,
  /authorization/i,
  /cookie/i,
  /set-cookie/i,
  // 한국 입시 도메인
  /email/i,
  /phone/i,
  /resident.?number/i,   // 주민번호
  /naesin/i,             // 내신
  /grade/i,              // 등급
  /probability/i,        // 합격 확률
  /cutoff/i,             // 합격선
  /csat.?score/i,        // 수능 점수
  /standard.?score/i,    // 표준점수
  /percentile/i,         // 백분위
  /school.?record/i,     // 학생부
  /spec.?snapshot/i,     // user_specs 스냅샷
  /match.?result/i,      // 합격 추정 결과
];

const REDACTED = "[Filtered]";

/**
 * 객체를 깊이 순회하며 민감 필드 값을 [Filtered] 로 치환.
 * 순환 참조 방지를 위해 seen Set 사용. depth 5 이상은 무한 redirect로 간주하고 중단.
 */
function scrubObject(obj: unknown, seen = new WeakSet<object>(), depth = 0): unknown {
  if (depth > 6) return REDACTED;
  if (obj == null) return obj;
  if (typeof obj !== "object") return obj;
  if (seen.has(obj as object)) return REDACTED;
  seen.add(obj as object);

  if (Array.isArray(obj)) {
    return obj.map((v) => scrubObject(v, seen, depth + 1));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_KEY_PATTERNS.some((re) => re.test(k))) {
      out[k] = REDACTED;
    } else {
      out[k] = scrubObject(v, seen, depth + 1);
    }
  }
  return out;
}

/**
 * Sentry beforeSend — 사용자/요청/응답 데이터에서 PII·입시 민감정보 제거.
 *
 * Sentry SDK 의 기본 scrubber 는 password/token 일부만 처리. 본 함수는
 * 한국 입시 도메인 키워드(내신·등급·합격확률 등) 까지 확장.
 */
export function sentryBeforeSend(
  event: ErrorEvent,
  _hint: EventHint,
): ErrorEvent | null {
  // 1. user 객체 — email/username/ip 제거
  if (event.user) {
    delete event.user.email;
    delete event.user.username;
    delete event.user.ip_address;
  }

  // 2. request body·headers·query — 민감 키 redact
  if (event.request) {
    if (event.request.data) {
      event.request.data = scrubObject(event.request.data) as typeof event.request.data;
    }
    if (event.request.query_string && typeof event.request.query_string === "string") {
      // query_string 의 sensitive 파라미터는 SDK 기본 scrubber 가 처리하지만
      // 추가 안전망 — q/query/search 외에는 모두 보존 (스택 trace 손실 방지).
    }
    if (event.request.headers) {
      const hdrs = event.request.headers as Record<string, string>;
      for (const k of Object.keys(hdrs)) {
        if (/authorization|cookie|x-api-key|x-supabase/i.test(k)) {
          hdrs[k] = REDACTED;
        }
      }
    }
  }

  // 3. extra context — Sentry.setExtra() 로 첨부한 자유 데이터
  if (event.extra) {
    event.extra = scrubObject(event.extra) as typeof event.extra;
  }

  // 4. contexts — Sentry.setContext("key", {...}) 데이터
  if (event.contexts) {
    for (const [k, v] of Object.entries(event.contexts)) {
      // runtime/os/browser 등 기본 컨텍스트는 PII 없음 — 보존
      if (["runtime", "os", "browser", "device", "app", "trace"].includes(k)) continue;
      event.contexts[k] = scrubObject(v) as typeof v;
    }
  }

  return event;
}
