#!/usr/bin/env node
/**
 * 컨설팅 가용 슬롯 시드 — 12:00~20:00 KST, 60분 정각 8슬롯/일, 매일 (월~일).
 *
 * 클라이언트(방준현) 확정 (2026-06): "코나투스 1:1 입시컨설팅" 예약 가능 시간.
 *   스케줄 정의·KST→UTC 변환은 lib/consulting/slot-schedule.ts 에 단일화
 *   (seed + 회귀 테스트 공유). 본 스크립트는 적재(idempotent insert)만 담당.
 *
 *   - 패턴: 매일 12:00, 13:00, …, 19:00 시작 (각 60분) = 하루 8슬롯.
 *   - 향후 N일치(DAYS_AHEAD)를 status='available' 로 insert.
 *   - admin 슬롯 관리 UI 는 미구현 — 가용 시간 조정은 본 스크립트 재실행으로 처리.
 *
 * idempotent — 동일 start_at 이미 존재하면 skip (UNIQUE constraint 미적용이라
 *   in-memory 체크). 실행 (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요):
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
import {
  buildSeedSlots,
  CONSULTING_SLOT_START_HOURS_KST,
  type SeedSlot,
} from "@/lib/consulting/slot-schedule";

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

const DAYS_AHEAD = 14;

async function main() {
  const slots: SeedSlot[] = buildSeedSlots(new Date(), DAYS_AHEAD);
  const perDay = CONSULTING_SLOT_START_HOURS_KST.length;

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

  console.log(
    `[seed] 컨설팅 슬롯 ${toInsert.length}개 추가 — 12:00~20:00 KST, 하루 ${perDay}슬롯(60분), 다음 ${DAYS_AHEAD}일.`,
  );
  console.log(`[seed] 기존 ${existing.size}개는 skip.`);
}

main().catch((e) => {
  console.error("[seed] 예외:", e);
  process.exit(1);
});
