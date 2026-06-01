/**
 * 대학 로고 수집 — university-domains.ts 의 도메인 → faviconV2 URL 검증 → 운영 DB 적재.
 *
 *   npx tsx scripts/etl/collect-university-logos.ts            # dry-run (검증만, DB 미변경)
 *   npx tsx scripts/etl/collect-university-logos.ts --execute  # 검증 통과분 logo_url+website_url UPDATE
 *
 * 정직성: favicon GET 200 + content-type image/* 통과한 대학만 저장 (깨진 URL 저장 X).
 *   멱등 — 동일 값 재적재 안전. load-admissions.ts 와 동일 Management API 인증.
 */
import fs from "node:fs";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
import {
  UNIVERSITY_DOMAINS,
  universityLogoUrl,
  universityHomepageUrl,
} from "@/scripts/etl/university-domains";

loadDotenv({ path: path.resolve(process.cwd(), ".env.local") });
const TOKEN = (process.env.SUPABASE_ACCESS_TOKEN ?? "").trim();
const REF = fs.readFileSync("supabase/.temp/project-ref", "utf8").trim();
const EXECUTE = process.argv.includes("--execute");
const CONCURRENCY = 8;

async function sql<T = unknown>(query: string): Promise<T> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SQL ${res.status}: ${text.slice(0, 600)}`);
  return JSON.parse(text) as T;
}

interface Validated { id: string; domain: string; logoUrl: string; bytes: number; type: string }

/** 단일 host 의 faviconV2 검증 — 200 + image/* + 충분한 크기(글로벌 플레이스홀더 726b 거름). */
async function probe(host: string): Promise<{ logoUrl: string; bytes: number; type: string } | { fail: string }> {
  const logoUrl = universityLogoUrl(host);
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 12_000);
    const res = await fetch(logoUrl, { redirect: "follow", signal: ac.signal });
    clearTimeout(t);
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok) return { fail: `HTTP ${res.status}` };
    if (!type.startsWith("image/")) return { fail: `non-image (${type})` };
    const buf = await res.arrayBuffer();
    // faviconV2 '없음' 플레이스홀더 = 726b. 실제 favicon 은 그보다 크거나 작아도 정상이나,
    // 726b 정확히 = Google placeholder 이므로 거른다.
    if (buf.byteLength === 726) return { fail: "google placeholder (no favicon)" };
    if (buf.byteLength < 100) return { fail: `too small (${buf.byteLength}b)` };
    return { logoUrl, bytes: buf.byteLength, type };
  } catch (e) {
    return { fail: e instanceof Error ? e.message : "fetch error" };
  }
}

/** favicon 검증 — bare 도메인 우선, 실패 시 www. 재시도 (일부 대학은 www 에만 favicon 인덱싱). */
async function validate(id: string, domain: string): Promise<Validated | { id: string; domain: string; fail: string }> {
  const bare = await probe(domain);
  if ("logoUrl" in bare) return { id, domain, ...bare };
  const www = await probe(`www.${domain}`);
  if ("logoUrl" in www) return { id, domain, ...www };
  return { id, domain, fail: bare.fail };
}

async function mapPool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

async function main(): Promise<void> {
  const entries = Object.entries(UNIVERSITY_DOMAINS);
  console.log(`[logos] 도메인 맵 ${entries.length}교 — favicon 검증 (${EXECUTE ? "EXECUTE" : "DRY-RUN"})\n`);

  const results = await mapPool(entries, CONCURRENCY, ([id, domain]) => validate(id, domain));
  const ok = results.filter((r): r is Validated => "logoUrl" in r);
  const failed = results.filter((r): r is { id: string; domain: string; fail: string } => "fail" in r);

  for (const r of ok) console.log(`  ✓ ${r.id.padEnd(15)} ${r.domain.padEnd(18)} ${r.bytes}b ${r.type}`);
  if (failed.length) {
    console.log(`\n  ── 검증 실패 (저장 안 함) ──`);
    for (const r of failed) console.log(`  ✗ ${r.id.padEnd(15)} ${r.domain.padEnd(18)} ${r.fail}`);
  }
  console.log(`\n[logos] 검증 통과 ${ok.length} / ${entries.length}교.`);

  if (!EXECUTE) {
    console.log("[dry-run] DB 미변경. --execute 로 logo_url+website_url 적재.");
    return;
  }
  if (ok.length === 0) {
    console.log("[logos] 적재할 항목 없음.");
    return;
  }

  // 멱등 UPDATE — VALUES join. logo_url + website_url(도메인 출처 기록) 동시 갱신.
  const values = ok
    .map((r) => `('${r.id}','${r.logoUrl}','${universityHomepageUrl(r.domain)}')`)
    .join(",\n    ");
  const updateSql = `
    UPDATE universities u
    SET logo_url = v.logo_url, website_url = v.website_url, updated_at = NOW()
    FROM (VALUES
    ${values}
    ) AS v(id, logo_url, website_url)
    WHERE u.id = v.id
    RETURNING u.id;`;
  const updated = await sql<Array<{ id: string }>>(updateSql);
  console.log(`[logos] logo_url 적재 완료 — ${updated.length}교 UPDATE.`);
}

main().catch((e) => {
  console.error("[logos] 예외:", e instanceof Error ? e.message : e);
  process.exit(1);
});
