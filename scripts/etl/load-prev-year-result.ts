#!/usr/bin/env node
/**
 * 전년도 입결(prev_year_result) 적재 — 수집된 학과별 경쟁률·컷등급을 department_admissions 에 UPDATE.
 *
 *   npx tsx scripts/etl/load-prev-year-result.ts <collected.json>            # dry-run (매칭 리포트)
 *   npx tsx scripts/etl/load-prev-year-result.ts <collected.json> --execute  # UPDATE 실행
 *
 * 입력 JSON: 워크플로우(ipgyeol-collect) 산출 — [{name, kcueId, status, departments:[{departmentName, college,
 *   trackKind, competitionRate, gradeCutoff}], cutoffBasis, year}].
 * 동작: status="text" 대학만, 학과명→department_id 매칭(dept-matcher 재사용) →
 *   department_admissions(year=2027) 의 prev_year_result = {competitionRate, gradeCutoff70, source} UPDATE.
 * ★ prev_year_result 는 학과 단위(전형별 아님) → 학과당 교과(susi_subject) 우선 1건 적재(종합은 근사).
 * 정직성: 매칭 실패 학과 SKIP+기록(추정매칭 금지). 컷/경쟁률 null 은 그대로 null.
 */
import { config as loadDotenv } from "dotenv";
import fs from "node:fs";
import { norm, buildMatcher, resolveDeptName, type DeptRow } from "@/scripts/etl/dept-matcher";

loadDotenv({ path: ".env.local" });
const EXECUTE = process.argv.includes("--execute");
const FILE = process.argv.find((a) => a.toLowerCase().endsWith(".json")) ?? "/tmp/ipgyeol-collected.json";
const TOKEN = (process.env.SUPABASE_ACCESS_TOKEN ?? "").trim();
const REF = fs.readFileSync("supabase/.temp/project-ref", "utf8").trim();
const YEAR = 2027;

async function sql<T = any>(q: string): Promise<T> {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: q }),
  });
  const t = await r.text(); if (!r.ok) throw new Error(`SQL ${r.status}: ${t.slice(0, 300)}`); return JSON.parse(t) as T;
}

interface DeptIn { departmentName: string; college?: string; trackKind?: string; competitionRate?: number | null; gradeCutoff?: number | null }
interface UnivIn { name: string; kcueId: string; status: string; year?: number; cutoffBasis?: string; departments?: DeptIn[] }

/** 학과당 1건 선택 — 교과 우선, 그다음 컷 있는 것. */
function pickPerDept(deps: DeptIn[]): Map<string, DeptIn> {
  const by = new Map<string, DeptIn>();
  for (const d of deps) {
    if (!d.departmentName) continue;
    const k = d.departmentName.trim();
    const prev = by.get(k);
    if (!prev) { by.set(k, d); continue; }
    const score = (x: DeptIn) => (x.trackKind === "susi_subject" ? 2 : 0) + (x.gradeCutoff != null ? 1 : 0);
    if (score(d) > score(prev)) by.set(k, d);
  }
  return by;
}

async function main() {
  if (!fs.existsSync(FILE)) throw new Error(`수집 JSON 없음: ${FILE}`);
  const data: UnivIn[] = JSON.parse(fs.readFileSync(FILE, "utf8"));
  let totMatch = 0, totUnmatch = 0; const updates: string[] = [];
  const report: string[] = [];

  for (const u of data) {
    if (u.status !== "text" || !u.departments?.length) { report.push(`  ${u.name} [${u.status}] — skip`); continue; }
    const db = await sql<DeptRow[]>(`select id, name, active from public.departments where university_id='${u.kcueId}'`);
    const match = buildMatcher(db);
    const picked = pickPerDept(u.departments);
    let m = 0; const un: string[] = [];
    for (const [name, d] of picked) {
      const res = match(resolveDeptName(u.kcueId, name));
      if (!res.id) { un.push(name); totUnmatch++; continue; }
      m++; totMatch++;
      const obj: Record<string, unknown> = { source: "official-ipgyeol" };
      if (d.competitionRate != null) obj.competitionRate = d.competitionRate;
      if (d.gradeCutoff != null) obj.gradeCutoff70 = d.gradeCutoff;
      const json = JSON.stringify(obj).replace(/'/g, "''");
      updates.push(`update public.department_admissions set prev_year_result='${json}'::jsonb, updated_at=now() where university_id='${u.kcueId}' and department_id='${res.id.replace(/'/g, "''")}' and year=${YEAR};`);
    }
    report.push(`  ${u.name} (${u.kcueId}): 매칭 ${m}/${picked.size}${un.length ? "  미매칭: " + un.join(", ") : ""}`);
  }
  console.log(`== load-prev-year-result ${EXECUTE ? "[EXECUTE]" : "[DRY-RUN]"} (${FILE}) ==`);
  console.log(report.join("\n"));
  console.log(`\n총 매칭 ${totMatch} | 미매칭 ${totUnmatch} | UPDATE문 ${updates.length}`);
  if (!EXECUTE) { console.log("[DRY-RUN] --execute 로 적재."); return; }
  let done = 0;
  for (let i = 0; i < updates.length; i += 50) {
    await sql(updates.slice(i, i + 50).join("\n"));
    done += Math.min(50, updates.length - i); process.stdout.write(`\r  UPDATE ${done}/${updates.length}`);
  }
  console.log(`\n✅ prev_year_result 적재: ${done}개 학과 (year=${YEAR})`);
}
main().catch((e) => { console.error("❌", e instanceof Error ? e.message : e); process.exit(1); });
