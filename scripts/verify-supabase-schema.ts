import fs from "node:fs";
import path from "node:path";
import WebSocket from "ws";
if (typeof globalThis.WebSocket === "undefined") {
  (globalThis as any).WebSocket = WebSocket;
}
import { createClient } from "@supabase/supabase-js";

function readEnv(key: string): string {
  const c = fs.readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8");
  const m = c.match(new RegExp(`^${key}=(.+)$`, "m"));
  if (!m) throw new Error(`${key} not in .env.local`);
  return m[1].trim();
}

(async () => {
  const client = createClient(readEnv("NEXT_PUBLIC_SUPABASE_URL"), readEnv("SUPABASE_SERVICE_ROLE_KEY"));
  const tables = [
    "universities", "departments", "department_admissions", "admissions_staging",
    "user_specs", "user_entitlements", "orders", "matches",
    "admission_results", "admission_sample_stats",
    "ai_cache", "sanitize_events", "conversation_messages", "rate_limits", "counselor_metrics",
  ];
  for (const t of tables) {
    const { count, error } = await client.from(t).select("*", { count: "exact", head: true });
    if (error) console.log(`❌ ${t}: ${error.message}`);
    else console.log(`✅ ${t}: ${count} rows`);
  }
})().catch((e) => { console.error("실패:", e); process.exit(1); });
