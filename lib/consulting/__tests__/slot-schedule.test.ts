/**
 * 컨설팅 슬롯 스케줄 회귀 — 12:00~20:00 KST, 60분 정각 8슬롯/일, 매일.
 *
 * 클라이언트 확정 시간(2026-06)의 안전망:
 *   - 슬롯 개수·시작 시각 (정각 12~19)
 *   - KST→UTC 변환 정확성 (DB 는 UTC TIMESTAMPTZ, 캘린더는 KST 재표시)
 *   - 세션 60분 / end > start
 *   - 매일 적재 (요일 무관) + 중복 start_at 없음
 */

import { describe, it, expect } from "vitest";
import {
  CONSULTING_OPEN_HOUR_KST,
  CONSULTING_CLOSE_HOUR_KST,
  CONSULTING_SESSION_MINUTES,
  CONSULTING_SLOT_START_HOURS_KST,
  kstToUtcIso,
  buildKstSlotsForDate,
  buildSeedSlots,
} from "@/lib/consulting/slot-schedule";

describe("슬롯 시작 시각 — 12:00~20:00 정각", () => {
  it("시작 시각은 [12,13,14,15,16,17,18,19] — 하루 8슬롯", () => {
    expect(CONSULTING_SLOT_START_HOURS_KST).toEqual([12, 13, 14, 15, 16, 17, 18, 19]);
    expect(CONSULTING_SLOT_START_HOURS_KST).toHaveLength(8);
  });

  it("개장 12시·마감 20시·세션 60분 상수 일관", () => {
    expect(CONSULTING_OPEN_HOUR_KST).toBe(12);
    expect(CONSULTING_CLOSE_HOUR_KST).toBe(20);
    expect(CONSULTING_SESSION_MINUTES).toBe(60);
  });
});

describe("kstToUtcIso — KST(UTC+9) → UTC", () => {
  it("KST 12:00 2026-06-15 → UTC 03:00", () => {
    // monthIndex 5 = 6월
    expect(kstToUtcIso(2026, 5, 15, 12, 0)).toBe("2026-06-15T03:00:00.000Z");
  });

  it("KST 19:00 → UTC 10:00 (마지막 슬롯 시작)", () => {
    expect(kstToUtcIso(2026, 5, 15, 19, 0)).toBe("2026-06-15T10:00:00.000Z");
  });

  it("자정 근처 KST 09시 미만은 전날 UTC 로 넘어감 (오프셋 경계)", () => {
    // KST 2026-06-15 08:00 → UTC 2026-06-14 23:00 (참고용: 슬롯 범위 밖)
    expect(kstToUtcIso(2026, 5, 15, 8, 0)).toBe("2026-06-14T23:00:00.000Z");
  });
});

describe("buildKstSlotsForDate — 하루 슬롯", () => {
  const slots = buildKstSlotsForDate(2026, 5, 15); // 2026-06-15

  it("정확히 8슬롯 생성", () => {
    expect(slots).toHaveLength(8);
  });

  it("모두 available / 60분", () => {
    for (const s of slots) {
      expect(s.status).toBe("available");
      expect(s.duration_minutes).toBe(60);
    }
  });

  it("첫 슬롯 = KST 12:00 (UTC 03:00), 그 종료 = KST 13:00 (UTC 04:00)", () => {
    expect(slots[0].start_at).toBe("2026-06-15T03:00:00.000Z");
    expect(slots[0].end_at).toBe("2026-06-15T04:00:00.000Z");
  });

  it("마지막 슬롯 = KST 19:00 시작 ~ KST 20:00 종료 (UTC 10:00~11:00)", () => {
    const last = slots[slots.length - 1];
    expect(last.start_at).toBe("2026-06-15T10:00:00.000Z");
    expect(last.end_at).toBe("2026-06-15T11:00:00.000Z");
  });

  it("모든 슬롯: end = start + 60분, end > start", () => {
    for (const s of slots) {
      const startMs = Date.parse(s.start_at);
      const endMs = Date.parse(s.end_at);
      expect(endMs).toBeGreaterThan(startMs);
      expect(endMs - startMs).toBe(60 * 60 * 1000);
    }
  });

  it("슬롯 시작은 정각 연속 (1시간 간격, 버퍼 없음)", () => {
    for (let i = 1; i < slots.length; i++) {
      const prev = Date.parse(slots[i - 1].start_at);
      const cur = Date.parse(slots[i].start_at);
      expect(cur - prev).toBe(60 * 60 * 1000);
    }
  });
});

describe("buildSeedSlots — 다일치 적재", () => {
  // 고정 기준일 — 머신 TZ 무관하게 개수/구조 검증
  const from = new Date("2026-06-14T12:00:00Z"); // 임의 시점
  const DAYS = 14;
  const slots = buildSeedSlots(from, DAYS);

  it("14일 × 8슬롯 = 112슬롯", () => {
    expect(slots).toHaveLength(DAYS * 8);
  });

  it("당일(D) 제외, D+1 부터 시작 — 첫 슬롯이 기준일 자정 이후", () => {
    const earliest = Math.min(...slots.map((s) => Date.parse(s.start_at)));
    // D+1 의 KST 12:00 는 기준일 자정보다 확실히 이후
    const baseMidnight = new Date(from);
    baseMidnight.setHours(0, 0, 0, 0);
    expect(earliest).toBeGreaterThan(baseMidnight.getTime());
  });

  it("start_at 중복 없음 (멱등 시드 전제)", () => {
    const set = new Set(slots.map((s) => s.start_at));
    expect(set.size).toBe(slots.length);
  });

  it("매일 적재 — 7개 요일 모두 등장 (평일·주말 무관)", () => {
    // start_at 을 KST 로 환산해 요일 집합 구성 (UTC+9)
    const dows = new Set(
      slots.map((s) => {
        const kst = new Date(Date.parse(s.start_at) + 9 * 60 * 60 * 1000);
        return kst.getUTCDay();
      }),
    );
    expect(dows.size).toBe(7);
  });
});
