#!/usr/bin/env node
/**
 * Anthropic API 키 스모크 테스트 — .env.local 의 ANTHROPIC_API_KEY 로
 * Haiku 1회 호출해서 응답·토큰 사용량을 출력.
 *
 *   npx tsx scripts/smoke-anthropic.ts
 *
 * exit code: 0 성공 / 1 실패. CI / Codespaces 셋업 검증용.
 */
import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";

function loadKey(): string {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;

  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    throw new Error(".env.local 가 없습니다. ANTHROPIC_API_KEY 환경변수로 직접 넘기거나 .env.local 생성하세요.");
  }
  const content = fs.readFileSync(envPath, "utf8");
  const match = content.match(/^ANTHROPIC_API_KEY=(.+)$/m);
  if (!match) throw new Error(".env.local 에 ANTHROPIC_API_KEY 행이 없습니다.");
  return match[1].trim().replace(/^["']|["']$/g, "");
}

async function main(): Promise<void> {
  const key = loadKey();
  console.log(`🔑 키 prefix: ${key.slice(0, 14)}…  (length ${key.length})`);

  const client = new Anthropic({ apiKey: key, timeout: 20_000 });
  const start = Date.now();

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 30,
    messages: [
      { role: "user", content: "Reply with only the two characters: ok" },
    ],
  });

  const elapsed = Date.now() - start;
  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => ("text" in b ? b.text : ""))
    .join("");

  console.log(`✅ 응답 (${elapsed}ms): "${text.trim()}"`);
  console.log(`📊 토큰: in=${response.usage.input_tokens}, out=${response.usage.output_tokens}`);
  console.log(`🤖 모델: ${response.model}`);
}

main().catch((e) => {
  console.error("❌ 실패:", e instanceof Error ? e.message : String(e));
  if (e instanceof Anthropic.APIError) {
    console.error(`   status=${e.status}`);
  }
  process.exit(1);
});
