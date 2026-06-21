#!/usr/bin/env node
/**
 * high_schools 테이블 seed — NEIS 학교기본정보 전체 고등학교 적재 (2026-06-21).
 *
 *   npx tsx scripts/etl/seed-highschools.ts          # dry-run (fetch만, DB 미변경)
 *   npx tsx scripts/etl/seed-highschools.ts --execute # upsert 실행
 *
 * 배경: live NEIS 가 서버리스 egress IP 를 rate-limit(HTTP 500) → 고교 검색 0건.
 *       학교 마스터를 1회 적재해 DB 에서 서빙. 연 1~2회 재실행으로 갱신.
 *
 * NEIS rate-limit 회피: 페이지 간 throttle + 500 시 지수 backoff. 비용 0(공공 API).
 */
import { config as loadDotenv } from "dotenv";
import fs from "node:fs";

loadDotenv({ path: ".env.local" });
const EXECUTE = process.argv.includes("--execute");
const KEY = (process.env.NEIS_API_KEY ?? "").trim();
const TOKEN = (process.env.SUPABASE_ACCESS_TOKEN ?? "").trim();
const REF = fs.readFileSync("supabase/.temp/project-ref", "utf8").trim();
const ENDPOINT = "https://open.neis.go.kr/hub/schoolInfo";
const PAGE = 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sql(query: string): Promise<any> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const t = await res.text();
  if (!res.ok) throw new Error(`SQL ${res.status}: ${t.slice(0, 300)}`);
  return JSON.parse(t);
}

interface Row { code: string; name: string; region: string; office: string; address: string | null; nameEn: string | null }

/** 한 페이지 fetch. 500/에러 시 지수 backoff 재시도. 반환: {rows, done}. */
async function fetchPage(pIndex: number): Promise<{ rows: Row[]; done: boolean }> {
  const url = `${ENDPOINT}?${new URLSearchParams({ KEY, Type: "json", pIndex: String(pIndex), pSize: String(PAGE), SCHUL_KND_SC_NM: "고등학교" })}`;
  let delay = 15000;
  for (let attempt = 1; attempt <= 8; attempt++) {
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (res.status === 500 || res.status === 429) {
        console.log(`  page ${pIndex} HTTP ${res.status} (rate-limit) — backoff ${delay / 1000}s (try ${attempt}/8)`);
        await sleep(delay); delay = Math.min(delay * 1.6, 90000); continue;
      }
      const j = await res.json();
      if (j?.RESULT?.CODE && j.RESULT.CODE !== "INFO-000") {
        if (j.RESULT.CODE === "INFO-200") return { rows: [], done: true }; // 데이터 끝
        console.log(`  page ${pIndex} RESULT ${j.RESULT.CODE}: ${j.RESULT.MESSAGE ?? ""} — backoff ${delay / 1000}s`);
        await sleep(delay); delay = Math.min(delay * 1.6, 90000); continue;
      }
      const block = (j.schoolInfo ?? []).find((b: any) => b && b.row);
      const raw: any[] = block?.row ?? [];
      const rows: Row[] = raw
        .filter((r) => !r.SCHUL_KND_SC_NM || r.SCHUL_KND_SC_NM === "고등학교")
        .map((r) => ({ code: r.SD_SCHUL_CODE, name: r.SCHUL_NM, region: r.LCTN_SC_NM ?? "", office: r.ATPT_OFCDC_SC_NM ?? "", address: r.ORG_RDNMA || null, nameEn: r.ENG_SCHUL_NM || null }));
      return { rows, done: rows.length < PAGE };
    } catch (e) {
      console.log(`  page ${pIndex} fetch err: ${e instanceof Error ? e.message : e} — backoff ${delay / 1000}s (try ${attempt}/8)`);
      await sleep(delay); delay = Math.min(delay * 1.6, 90000);
    }
  }
  throw new Error(`page ${pIndex} 8회 재시도 실패 (NEIS IP 차단 지속)`);
}

const esc = (s: string) => s.replace(/'/g, "''");
const val = (s: string | null) => (s == null ? "NULL" : `'${esc(s)}'`);

/** 한 페이지 분량 upsert (incremental — 중간 실패해도 누적분 보존). */
async function upsertRows(rows: Row[]): Promise<void> {
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const values = chunk
      .map((r) => `('${esc(r.code)}','${esc(r.name)}','${esc(r.region)}','${esc(r.office)}',${val(r.address)},${val(r.nameEn)},now())`)
      .join(",\n");
    await sql(`insert into public.high_schools (code,name,region,office,address,name_en,updated_at)\nvalues\n${values}\non conflict (code) do update set name=excluded.name, region=excluded.region, office=excluded.office, address=excluded.address, name_en=excluded.name_en, updated_at=now();`);
  }
}

async function main() {
  if (!KEY) throw new Error("NEIS_API_KEY 미설정");
  console.log(`== seed-highschools ${EXECUTE ? "[EXECUTE]" : "[DRY-RUN]"} ==`);
  console.log("초기 cooldown 30s (직전 진단 호출 rate-limit 회피)…");
  await sleep(30000);

  const all = new Map<string, Row>();
  let upserted = 0;
  for (let p = 1; p <= 30; p++) {
    const { rows, done } = await fetchPage(p);
    for (const r of rows) if (r.code) all.set(r.code, r);
    if (EXECUTE && rows.length) { await upsertRows(rows); upserted += rows.length; }
    console.log(`page ${p}: +${rows.length} (누적 ${all.size}${EXECUTE ? `, upsert ${upserted}` : ""})${done ? " [last]" : ""}`);
    if (done) break;
    await sleep(12000); // throttle between pages — NEIS rate-limit 회피
  }
  console.log(`\n총 고등학교 ${all.size}개 수집`);
  if (!all.size) throw new Error("0개 수집 — NEIS 차단/오류, seed 중단");
  if (!EXECUTE) { console.log("[DRY-RUN] DB 미변경. --execute 로 upsert."); return; }
  console.log(`✅ seed 완료: ${all.size}개 high_schools (incremental upsert)`);
}
main().catch((e) => { console.error("❌", e instanceof Error ? e.message : e); process.exit(1); });
