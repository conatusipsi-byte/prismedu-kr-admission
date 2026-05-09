/**
 * API 라우트 공통 유틸.
 *
 * - extractJSON: Claude 응답에서 JSON 객체만 안전하게 추출 (markdown fence 제거 + balanced brace 매칭)
 * - sanitizeUserText: 사용자 자유 입력을 Claude 프롬프트에 주입하기 전 정화 (코드펜스·장문 개행 제거 → 프롬프트 인젝션 완화)
 */

/**
 * 사용자 자유 텍스트 필드(자기소개, 활동, 에세이 프롬프트 등)를 Claude 프롬프트에 끼워넣기 전 정화한다.
 *
 * - ``` (코드펜스)는 제거 — 모델 instruction boundary를 위조할 위험.
 * - USER_DATA_TAGS로 감싸는 구분자는 제거 — 사용자가 </user_data> 등을 삽입해
 *   래퍼 밖으로 탈출하는 것을 차단.
 * - 연속 개행은 2줄까지만 허용 — 시각적 구분으로 injection 구역을 만드는 것 억제.
 * - 200자 이상 1줄에 대한 축약은 하지 않음 (학생 서술을 잘라내면 분석 품질 손상).
 * - 길이 상한은 Zod 스키마에서 이미 처리됨.
 */
const USER_DATA_TAGS = /<\/?(user_data|student_profile|essay_body|essay_prompt|school_data)[^>]*>/gi;

export function sanitizeUserText(v: unknown): string {
  if (typeof v !== "string") return "";
  return v
    .replace(/```+/g, "")
    .replace(USER_DATA_TAGS, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * 사용자 자유 텍스트 블록을 모델이 "데이터"로 인식하도록 XML 태그로 감싼다.
 * 구분자 안의 문자열은 sanitizeUserText로 탈출 방지 처리되어 있어야 함.
 *
 * 사용 예:
 *   wrapUserData("essay_body", sanitizeUserText(essay))
 */
export function wrapUserData(tag: "user_data" | "student_profile" | "essay_body" | "essay_prompt" | "school_data", body: string): string {
  return `<${tag}>\n${body}\n</${tag}>`;
}

function stripFences(s: string): string {
  let out = s.trim();
  out = out.replace(/^```(?:json)?\s*\n?/i, "");
  out = out.replace(/\n?```\s*$/i, "");
  return out.trim();
}

/**
 * balanced-brace matcher. Claude가 JSON 앞뒤에 prose를 붙였을 때
 * lastIndexOf("}") 방식은 JSON 안에 중첩 "}" 가 있어도 항상 마지막 것에 매칭되는 문제가 있다.
 * 여기서는 depth 카운터 + string/escape 상태 기계로 첫 번째 완결 객체만 뽑아낸다.
 */
function findFirstJsonObject(s: string): string | null {
  const start = s.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (escape) { escape = false; continue; }
    if (c === "\\") { escape = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Claude 응답 문자열에서 JSON을 추출해 파싱한다.
 * 실패 시 null (호출부에서 502 처리).
 */
export function extractJSON<T = unknown>(raw: string): T | null {
  if (!raw) return null;
  const unfenced = stripFences(raw);

  try {
    return JSON.parse(unfenced) as T;
  } catch {}

  const candidate = findFirstJsonObject(unfenced);
  if (!candidate) return null;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    return null;
  }
}
