#!/usr/bin/env node
/**
 * 컨설팅 가용 슬롯 시드 — 다음 2주치 (Day 2 of consulting 계약).
 *
 * ⚠️ 임시 시드 — 코나투스 입시 컨설턴트의 실제 예약 가능 시간 결정 전 e2e 테스트·시연용.
 *   - 운영 진입 전 admin 페이지로 실제 시간 받아 재시드 필요.
 *   - 패턴 (한국 시간 KST = UTC+9):
 *       평일 (월~금): 19:00, 20:30  (60분 세션)
 *       주말 (토·일): 10:00, 11:30, 14:00, 15:30  (60분 세션)
 *   - 모두 status='available' 로 insert.
 *
 * idempotent — 동일 start_at 이미 존재하면 skip (UNIQUE constraint 미적용이라
 *   in-memory 체크). 실행:
 *
 *     npx tsx scripts/seed-consulting-slots.ts
 */

import fs from "node:fs";
import path from "node:path";
import WebSocket from "ws";
if (typeof globalThis.WebSocket === "undefined") {
  (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = WebSocket;
}
import { createClient } from "@supabase/supabase-js";

function readEnv(key: string): string {
  if (process.env[key]) return process.env[key]!;
  const c = fs.readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8");
  const m = c.match(new RegExp(`^${key}=(.+)$`, "m"));
  if (!m) throw new Error(`${key} missing`);
  return m[1].trim();
}

const sb = createClient(
  readEnv("NEXT_PUBLIC_SUPABASE_URL"),
  readEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const WEEKDAY_TIMES: Array<[number, number]> = [
  [19, 0],
  [20, 30],
];
const WEEKEND_TIMES: Array<[number, number]> = [
  [10, 0],
  [11, 30],
  [14, 0],
  [15, 30],
];
const DURATION_MINUTES = 60;
const DAYS_AHEAD = 14;
const KST_OFFSET_HOURS = 9;

interface SlotRow {
  start_at: string;
  end_at: string;
  status: "available";
  duration_minutes: number;
}

/** KST 로컬 (year, month, day, hour, minute) → UTC ISO. */
function kstToUtcIso(year: number, month: number, day: number, hour: number, minute: number): string {
  // KST 시각 → UTC 로 환산하려면 KST_OFFSET_HOURS 시간을 빼야 함.
  const d = new Date(Date.UTC(year, month, day, hour - KST_OFFSET_HOURS, minute, 0, 0));
  return d.toISOString();
}

function buildSlotsForDay(date: Date): SlotRow[] {
  const dow = date.getDay(); // 0=일, 6=토
  const isWeekend = dow === 0 || dow === 6;
  const times = isWeekend ? WEEKEND_TIMES : WEEKDAY_TIMES;
  return times.map(([hh, mm]) => {
    const startIso = kstToUtcIso(date.getFullYear(), date.getMonth(), date.getDate(), hh, mm);
    const endMs = new Date(startIso).getTime() + DURATION_MINUTES * 60 * 1000;
    const endIso = new Date(endMs).toISOString();
    return {
      start_at: startIso,
      end_at: endIso,
      status: "available",
      duration_minutes: DURATION_MINUTES,
    };
  });
}

async function main() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const slots: SlotRow[] = [];
  for (let i = 1; i <= DAYS_AHEAD; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    slots.push(...buildSlotsForDay(d));
  }

  // idempotent — 동일 start_at 이미 있으면 skip.
  const startAts = slots.map((s) => s.start_at);
  const { data: existingRows, error: selErr } = await sb
    .from("consulting_time_slots")
    .select("start_at")
    .in("start_at", startAts);
  if (selErr) {
    console.error("[seed] 기존 슬롯 조회 실패:", selErr.message);
    process.exit(1);
  }
  const existing = new Set((existingRows ?? []).map((r) => (r as { start_at: string }).start_at));
  const toInsert = slots.filter((s) => !existing.has(s.start_at));

  if (toInsert.length === 0) {
    console.log(`[seed] 새로 추가할 슬롯 없음 (이미 ${existing.size}개 존재).`);
    return;
  }

  const { error: insErr } = await sb.from("consulting_time_slots").insert(toInsert);
  if (insErr) {
    console.error("[seed] insert 실패:", insErr.message);
    process.exit(1);
  }

  const weekday = toInsert.filter((s) => {
    const d = new Date(s.start_at);
    const dow = (d.getUTCDay() + (d.getUTCHours() + KST_OFFSET_HOURS >= 24 ? 1 : 0)) % 7;
    return dow >= 1 && dow <= 5;
  }).length;
  const weekend = toInsert.length - weekday;

  console.log(
    `[seed] 컨설팅 슬롯 ${toInsert.length}개 추가 — 평일 ${weekday}개 / 주말 ${weekend}개 (다음 ${DAYS_AHEAD}일).`,
  );
  console.log(`[seed] 기존 ${existing.size}개는 skip.`);
  console.log(
    `[seed] ⚠️ 임시 시드 — 클라이언트 실제 가능 시간 받은 후 admin 페이지로 재시드 필요.`,
  );
}

main().catch((e) => {
  console.error("[seed] 예외:", e);
  process.exit(1);
});
