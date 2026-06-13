/**
 * 학과/대학 ID 검증 — fetchDepartmentDetail 등에서 사용 (순수 함수, 서버 의존 없음 → 테스트 가능).
 *
 * 허용 문자: ASCII 영숫자 · '_' · '-' · 한글 음절(가-힣).
 *   - 한글 department_id(예: "gap-미래토목건설공학과") 지원 — 미허용 시 학과 상세가 빈 페이지였음(버그).
 *   - PostgREST .or() 필터 문자열에 보간되므로(lib/admission/fetch-detail), '.' ',' '(' ')' 등
 *     필터 연산자/구분자는 계속 불허 → injection·필터 깨짐 방지. Supabase .eq() 는 파라미터화라 별도 안전.
 *   - 길이 1~50 (실측 최대 17).
 */
const ADMISSION_ID_RE = /^[a-zA-Z0-9_가-힣-]{1,50}$/;

export function isValidAdmissionId(id: string): boolean {
  return ADMISSION_ID_RE.test(id);
}
