#!/usr/bin/env node
/**
 * high_schools 테이블 seed — 한국교육시설안전원 "초중등학교위치" CSV에서 고등학교 적재.
 *
 *   npx tsx scripts/etl/seed-highschools-csv.ts <csv경로>            # dry-run
 *   npx tsx scripts/etl/seed-highschools-csv.ts <csv경로> --execute  # 적재
 *
 * 배경: live NEIS Open API 가 클라우드/서버 IP 를 rate-limit(HTTP 500) → seed-highschools.ts
 *   가 CI/샌드박스에서 막힘. 공공데이터 CSV(파일 다운로드는 IP 차단 무관)로 대체 적재.
 *   학교 마스터는 변동 적음 → CSV 갱신 시 재실행(ON CONFLICT 갱신).
 * 컬럼: 학교ID,학교명,학교급구분,...,소재지도로명주소,시도교육청명,교육지원청명,...
 */
import { config as loadDotenv } from "dotenv";
import fs from "node:fs";
import Papa from "papaparse";

loadDotenv({ path: ".env.local" });
const EXECUTE = process.argv.includes("--execute");
const CSV =
  process.argv.find((a) => a.toLowerCase().endsWith(".csv")) ??
  "한국교육시설안전원_초중등학교위치_20260320.csv";
const TOKEN = (process.env.SUPABASE_ACCESS_TOKEN ?? "").trim();
const REF = fs.readFileSync("supabase/.temp/project-ref", "utf8").trim();

async function sql(q: string): Promise<unknown> {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: q }),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`SQL ${r.status}: ${t.slice(0, 300)}`);
  return JSON.parse(t);
}
const esc = (s: string) => s.replace(/'/g, "''");
const val = (s: string | null) => (s == null || s === "" ? "NULL" : `'${esc(s)}'`);

interface HS { code: string; name: string; region: string; office: string; address: string | null }

async function main() {
  if (!fs.existsSync(CSV)) throw new Error(`CSV 없음: ${CSV}`);
  const raw = fs.readFileSync(CSV, "utf8").replace(/^﻿/, "");
  const { data } = Papa.parse<Record<string, string>>(raw, { header: true, skipEmptyLines: true });

  const byCode = new Map<string, HS>();
  for (const r of data) {
    if (r["학교급구분"] !== "고등학교") continue;
    if (r["운영상태"] && r["운영상태"] !== "운영") continue; // 폐교 등 제외
    const code = (r["학교ID"] ?? "").trim();
    const name = (r["학교명"] ?? "").trim();
    if (!code || !name) continue;
    const office = (r["시도교육청명"] ?? "").trim();
    byCode.set(code, {
      code,
      name,
      region: office.replace(/교육청$/, "").trim(),
      office,
      address: ((r["소재지도로명주소"] ?? "").trim() || (r["소재지지번주소"] ?? "").trim()) || null,
    });
  }
  const list = [...byCode.values()];
  console.log(`고등학교 ${list.length}개 (출처: ${CSV})`);
  if (!list.length) throw new Error("0개 — CSV 컬럼/필터 확인");
  if (!EXECUTE) {
    console.log("[DRY-RUN] --execute 로 적재. sample:");
    console.log(JSON.stringify(list.slice(0, 3), null, 1));
    return;
  }
  const B = 500;
  let done = 0;
  for (let i = 0; i < list.length; i += B) {
    const c = list.slice(i, i + B);
    const v = c
      .map((r) => `('${esc(r.code)}','${esc(r.name)}','${esc(r.region)}','${esc(r.office)}',${val(r.address)},NULL,now())`)
      .join(",\n");
    await sql(`insert into public.high_schools (code,name,region,office,address,name_en,updated_at)\nvalues\n${v}\non conflict (code) do update set name=excluded.name, region=excluded.region, office=excluded.office, address=excluded.address, updated_at=now();`);
    done += c.length;
    process.stdout.write(`\r적재 ${done}/${list.length}`);
  }
  console.log(`\n✅ ${done}개 high_schools 적재 (한국교육시설안전원 CSV)`);
}
main().catch((e) => { console.error("❌", e instanceof Error ? e.message : e); process.exit(1); });
