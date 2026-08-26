/**
 * 현재 입시 학년도(admission year) 단일 소스.
 *
 * 배경 — 2026-08 이관 점검에서 발견한 시한폭탄:
 *   기존 코드는 10곳에서 각자 `new Date().getFullYear() + 1` 로 학년도를 계산했다.
 *   이 식은 **1월 1일에 롤오버**하므로 2027-01-01 00:00 부터 2028학년도를 조회하게 되는데,
 *   DB(department_admissions)에는 2027학년도까지만 적재돼 있다 → 검색·추천·비교·플래너·
 *   학과 상세가 전부 **빈 결과**. 테스트도 같은 식을 미러링해 통과하므로 자동 검출 불가였다.
 *
 * 해결 — 아래 우선순위로 단일 함수가 결정한다.
 *   1) `NEXT_PUBLIC_ADMISSION_YEAR` 환경변수 (명시적 운영 스위치, 최우선)
 *   2) 한국 입시 시즌 롤오버: **3월 시작** 기준 (1~2월은 직전 학년도 정시 마무리 기간)
 *      → 2027-01/02 는 2027학년도 유지. 1월 1일 롤오버 버그가 사라진다.
 *   3) `LATEST_LOADED_ADMISSION_YEAR` 상한 클램프 — 데이터가 없는 미래 학년도를 절대
 *      조회하지 않는다. 빈 사이트(원인 안 보임)보다 직전 학년도 노출(눈에 보임)이 안전하다.
 *
 * 데이터 갱신 절차 (매년 7~9월 모집요강 적재 후):
 *   Vercel 환경변수 `NEXT_PUBLIC_ADMISSION_YEAR` 를 새 학년도로 올리고 재배포.
 *   (env 를 쓰지 않는 운영을 원하면 아래 상수를 올리고 배포 — 둘 중 하나면 충분)
 *
 * NEXT_PUBLIC_ 접두사: 서버(API·loader)와 클라이언트(관리자 폼 기본값)가 같은 값을 읽어야 하므로.
 * 비밀값이 아니다.
 */

/** ETL 로 실제 적재가 끝난 최신 학년도. 신규 학년도 적재 시 함께 올린다. */
export const LATEST_LOADED_ADMISSION_YEAR = 2027;

/** 입시 시즌 시작 월(KST, 1-indexed). 3월 = 새 학년도 전형계획 공개 시점. */
const SEASON_START_MONTH = 3;

function parseYearEnv(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number.parseInt(raw.trim(), 10);
  // 오타·빈값으로 사이트가 죽지 않도록 상식 범위 밖은 무시하고 폴백으로 넘긴다.
  if (!Number.isInteger(n) || n < 2000 || n > 2100) return null;
  return n;
}

/**
 * 시즌 기준 학년도 (환경변수·클램프 미적용 원값).
 * Vercel 서버는 UTC 라 월 경계에서 9시간 어긋날 수 있어 KST 로 환산해 판정한다.
 */
export function admissionSeasonYear(now: Date = new Date()): number {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const year = kst.getUTCFullYear();
  const month = kst.getUTCMonth() + 1;
  return month >= SEASON_START_MONTH ? year + 1 : year;
}

/**
 * 조회에 사용할 현재 입시 학년도. DB `department_admissions.year` 와 직접 비교되는 값이다.
 * @param now 테스트/시뮬레이션용 기준 시각 주입 (기본: 실제 현재)
 */
export function getCurrentAdmissionYear(now: Date = new Date()): number {
  const fromEnv = parseYearEnv(process.env.NEXT_PUBLIC_ADMISSION_YEAR);
  if (fromEnv != null) return fromEnv;
  return Math.min(admissionSeasonYear(now), LATEST_LOADED_ADMISSION_YEAR);
}
