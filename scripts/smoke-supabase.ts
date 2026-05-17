#!/usr/bin/env node
/**
 * Supabase 연결 스모크 테스트 — .env.local 의 NEXT_PUBLIC_SUPABASE_URL/ANON_KEY 사용.
 *
 *   npx tsx scripts/smoke-supabase.ts
 *
 * 빈 프로젝트에서도 auth.getSession 은 동작 — 연결성만 확인.
 */
import fs from "node:fs";
import path from "node:path";
// Node 20 환경에서 native WebSocket 없음 — supabase-js realtime client 가 throw.
// ws 폴리필을 supabase-js import 전에 globalThis 에 넣어 회피. (Node 22+ 는 native 있음.)
import WebSocket from "ws";
if (typeof globalThis.WebSocket === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).WebSocket = WebSocket;
}
import { createClient } from "@supabase/supabase-js";

function readEnv(key: string): string {
  if (process.env[key]) return process.env[key]!;
  const content = fs.readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8");
  const m = content.match(new RegExp(`^${key}=(.+)$`, "m"));
  if (!m) throw new Error(`${key} not found in .env.local`);
  return m[1].trim();
}

(async () => {
  const url = readEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anon = readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const service = readEnv("SUPABASE_SERVICE_ROLE_KEY");

  console.log(`🔗 URL: ${url}`);
  console.log(`🔑 anon prefix: ${anon.slice(0, 30)}…`);
  console.log(`🔑 service prefix: ${service.slice(0, 30)}…`);

  // 1. anon — auth ping
  const start = Date.now();
  const anonClient = createClient(url, anon);
  const { error: ae } = await anonClient.auth.getSession();
  if (ae) throw new Error(`anon getSession 실패: ${ae.message}`);
  console.log(`✅ anon getSession OK (${Date.now() - start}ms)`);

  // 2. service_role — 시스템 정보 조회
  const adminClient = createClient(url, service);
  const { data, error } = await adminClient.from("nonexistent_table").select("*").limit(1);
  if (error && !/relation .* does not exist|table .* does not exist/i.test(error.message)) {
    console.warn(`⚠️ service_role 응답: ${error.message}`);
  } else {
    console.log(`✅ service_role 연결 OK (빈 프로젝트 — 테이블 없음 정상)`);
  }
})().catch((e) => { console.error("❌ 실패:", e instanceof Error ? e.message : e); process.exit(1); });
