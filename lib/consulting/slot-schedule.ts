/**
 * 컨설팅 가용 슬롯 스케줄 — 12:00~20:00 KST, 60분 정각, 매일.
 *
 * 클라이언트(방준현) 확정 (2026-06): "코나투스 1:1 입시컨설팅" 예약 가능 시간.
 *   - 시간: 12:00 ~ 20:00 KST
 *   - 세션: 60분 (consulting_time_slots.duration_minutes 기본값과 일치)
 *   - 간격: 60분 정각 연속 → 시작 12:00, 13:00, …, 19:00 = 하루 8슬롯
 *           (마지막 슬롯 19:00~20:00). 세션 사이 버퍼 없음.
 *   - 요일: 매일 (월~일 동일).
 *
 * 이전 placeholder(평일 19:00/20:30 · 주말 daytime)를 대체.
 *
 * 타임존: KST(UTC+9, DST 없음) → UTC ISO 로 저장 (consulting_time_slots.start_at
 *   = TIMESTAMPTZ). BookingCalendar 가 브라우저 로컬(=KST) 로 재표시 (BUG-015 일관).
 *   예) KST 12:00 → UTC 03:00 저장 → KST 브라우저에서 12:00 노출 (round-trip).
 *
 * 본 모듈은 순수 함수만 노출 — seed 스크립트(scripts/seed-consulting-slots.ts)와
 *   회귀 테스트가 공유. DB/네트워크 의존 없음.
 */

/** 첫 슬롯 시작 시각 (KST, 포함). */
export const CONSULTING_OPEN_HOUR_KST = 12;
/** 영업 종료 시각 (KST) = 마지막 슬롯(19:00)의 종료 시각. */
export const CONSULTING_CLOSE_HOUR_KST = 20;
/** 세션 길이(분). consulting_time_slots.duration_minutes 기본값과 동일. */
export const CONSULTING_SESSION_MINUTES = 60;
/** KST 오프셋(시간). 한국은 DST 없어 연중 고정 +9. */
export const KST_OFFSET_HOURS = 9;

/**
 * 하루 슬롯 시작 시각(정각, KST) 목록 — [12, 13, …, 19].
 * 60분 세션이 12:00 에 시작해 마지막이 19:00(종료 20:00)에 끝나므로 총 8개.
 */
export const CONSULTING_SLOT_START_HOURS_KST: readonly number[] = Array.from(
  { length: CONSULTING_CLOSE_HOUR_KST - CONSULTING_OPEN_HOUR_KST },
  (_, i) => CONSULTING_OPEN_HOUR_KST + i,
);

export interface SeedSlot {
  /** UTC ISO (consulting_time_slots.start_at). */
  start_at: string;
  /** UTC ISO (consulting_time_slots.end_at). */
  end_at: string;
  status: "available";
  duration_minutes: number;
}

/**
 * KST 로컬 달력시각 (y, monthIndex, day, hour, minute) → UTC ISO.
 * monthIndex 는 0-based (Date.UTC 규약). KST→UTC 는 9시간 차감.
 */
export function kstToUtcIso(
  year: number,
  monthIndex: number,
  day: number,
  hour: number,
  minute: number,
): string {
  return new Date(
    Date.UTC(year, monthIndex, day, hour - KST_OFFSET_HOURS, minute, 0, 0),
  ).toISOString();
}

/**
 * KST 달력 날짜(year, monthIndex, day)의 12:00~20:00 슬롯 8개 생성.
 * 매일 동일 — 요일 구분 없음. (순수 함수: 같은 입력 → 같은 출력)
 */
export function buildKstSlotsForDate(
  year: number,
  monthIndex: number,
  day: number,
): SeedSlot[] {
  return CONSULTING_SLOT_START_HOURS_KST.map((hour) => {
    const startIso = kstToUtcIso(year, monthIndex, day, hour, 0);
    const endIso = new Date(
      new Date(startIso).getTime() + CONSULTING_SESSION_MINUTES * 60_000,
    ).toISOString();
    return {
      start_at: startIso,
      end_at: endIso,
      status: "available" as const,
      duration_minutes: CONSULTING_SESSION_MINUTES,
    };
  });
}

/**
 * fromDate 의 익일(D+1)부터 daysAhead 일치 슬롯 생성 — 매일 8슬롯.
 *
 * fromDate 의 로컬 달력일을 KST 달력일로 해석한다(시드 실행 머신이 UTC 든 KST 든
 *   "내일부터 N일" 의도가 자명하도록 자정 기준으로 절단). 과거 슬롯을 만들지 않도록
 *   당일(D)은 제외하고 D+1 부터 시작.
 */
export function buildSeedSlots(fromDate: Date, daysAhead: number): SeedSlot[] {
  const base = new Date(fromDate);
  base.setHours(0, 0, 0, 0);
  const slots: SeedSlot[] = [];
  for (let i = 1; i <= daysAhead; i++) {
    const day = new Date(base);
    day.setDate(day.getDate() + i);
    slots.push(
      ...buildKstSlotsForDate(day.getFullYear(), day.getMonth(), day.getDate()),
    );
  }
  return slots;
}
