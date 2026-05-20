#!/usr/bin/env node
/**
 * KCUE / 대학알리미 베이스라인 시드 — universities + departments 적재
 *
 *   npx tsx scripts/etl/sync-kcue-baseline.ts [--phase=all|universities|departments|indicators]
 *                                              [--limit=N] [--start=N] [--year=YYYY]
 *                                              [--dry-run]
 *
 * 페이즈:
 *   1. universities — schlId 1..LIMIT iterate, StudentService 응답으로
 *      schlKrnNm·schlDivNm·schlEstbNm 추출 → universities upsert (kcue_code 기준).
 *   2. departments  — kcue_code 보유 대학 각각에 대해 SchoolMajorInfo 호출 →
 *      kediMjrId 기준 departments upsert.
 *   3. indicators   — (선택) Finance·EducationResearch 1개 op 씩 추가 시드.
 *
 * 멱등성:
 *   - universities.kcue_code 컬럼이 unique 이므로 upsert(onConflict='kcue_code') 안전.
 *   - departments 는 (university_id, kedi_mjr_id) 가 unique 이라
 *     onConflict 로 멱등 upsert.
 *
 * 호출 비용 (data.go.kr 운영 키 일일 한도 10,000):
 *   - universities phase: schlId N 까지 → 최대 N 호출
 *   - departments phase: 학교 1개당 1~4 페이지(200 rows/page) → 학교 × 평균 2 ≈ N×2
 *
 * 정직성 (P-002):
 *   - 응답 envelope 검증 실패한 학교는 건너뛰고 invalidCount 누적.
 *   - 학과상태 "폐과" 는 active=false, 데이터는 보존 (학생 검색 시 필터).
 *
 * 환경변수:
 *   KCUE_API_KEY                     공통 키 (또는 service 별 KCUE_API_KEY_*)
 *   NEXT_PUBLIC_SUPABASE_URL         Supabase URL
 *   SUPABASE_SERVICE_ROLE_KEY        Service role (RLS bypass)
 */

import fs from "node:fs";
import path from "node:path";

import WebSocket from "ws";
if (typeof globalThis.WebSocket === "undefined") {
  (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = WebSocket;
}
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { KcueClient, KcueRateLimitExceededError } from "../../lib/etl/kcue-client";
import {
  KcueServiceError,
  normalizeDepartmentFromMajor,
  type KcueSchoolMajor,
} from "./parsers/kcue-xml";

/* ═══════════════════════════════════════════════════════════════════════
   설정 / CLI 파싱
   ═══════════════════════════════════════════════════════════════════════ */

interface CliOpts {
  phase: "all" | "universities" | "departments" | "indicators";
  startSchlId: number;
  endSchlId: number;
  surveyYear: number;
  dryRun: boolean;
  /** 빈 응답이 연속 이만큼 나오면 universities phase 조기종료 */
  emptyStreakStop: number;
}

function parseCli(): CliOpts {
  const arg = (k: string, dflt?: string): string | undefined => {
    const m = process.argv.find((a) => a.startsWith(`--${k}=`));
    return m ? m.slice(k.length + 3) : dflt;
  };
  return {
    phase: (arg("phase", "universities") as CliOpts["phase"]) ?? "universities",
    startSchlId: parseInt(arg("start", "1") ?? "1", 10),
    endSchlId: parseInt(arg("limit", "1000") ?? "1000", 10),
    surveyYear: parseInt(arg("year", "2023") ?? "2023", 10),
    dryRun: process.argv.includes("--dry-run"),
    emptyStreakStop: parseInt(arg("empty-stop", "60") ?? "60", 10),
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   환경 로드
   ═══════════════════════════════════════════════════════════════════════ */

function readEnv(key: string): string {
  if (process.env[key]) return process.env[key]!;
  const dotenvPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(dotenvPath)) {
    throw new Error(`${key} 미설정 — .env.local 없음`);
  }
  const c = fs.readFileSync(dotenvPath, "utf8");
  const m = c.match(new RegExp(`^${key}=(.+)$`, "m"));
  if (!m) throw new Error(`${key} 미설정`);
  return m[1].trim().replace(/^"(.*)"$/, "$1");
}

/* ═══════════════════════════════════════════════════════════════════════
   카테고리 매핑 — KCUE 분류 → 우리 universities.category enum
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * KCUE 의 (schlDivNm, schlEstbNm) 조합을 안전한 default 로 categorize.
 * 정확한 categorization (seoul_top/seoul/national_flag 등) 은 admin 이 후처리.
 */
function mapCategory(schlDivNm: string, schlEstbNm: string): string {
  // 'special' enum 의도: 과학기술원·연구중심 (KAIST/POSTECH/UNIST/GIST/DGIST).
  // 전문대학·대학원은 본 schema 에 별도 enum 이 없어 설립유형 default 로 fallback.
  if (schlEstbNm === "국립" || schlEstbNm === "공립" || schlEstbNm === "국립대법인")
    return "national_local";
  return "private_local";
}

/** "전문대학" 등은 트리거에서 별도 처리 가능. */
function makeUniversitySlug(schlId: string): string {
  return `kcue_${schlId}`;
}

/**
 * 학과 ID — kediMjrId + 학위과정 + 주야간 조합.
 *
 * KCUE 학과정보 API 는 같은 kediMjrId 를 여러 학위과정(학사·석사·박사) /
 * 주야간 행으로 반복 반환한다. (학과별 + 학위과정별 + 주야간별 정원·재학생을
 * 따로 집계하기 때문). 멱등 upsert 를 위해 식별자에 학위·주야 까지 포함.
 */
function makeDepartmentId(kediMjrId: string, degreeCourse: string, daytime: string): string {
  const deg = degreeCodeShort(degreeCourse);
  const day = daytimeCodeShort(daytime);
  return `${kediMjrId.toLowerCase()}-${deg}-${day}`;
}

function degreeCodeShort(s: string): string {
  if (!s) return "x";
  if (s.includes("전문학사")) return "ass";
  if (s.includes("학사")) return "ba";
  if (s.includes("석사")) return "ma";
  if (s.includes("박사")) return "phd";
  return "x";
}

function daytimeCodeShort(s: string): string {
  if (s.includes("야")) return "n";
  if (s.includes("주")) return "d";
  return "x";
}

/* ═══════════════════════════════════════════════════════════════════════
   Phase 1 — universities iterate + upsert
   ═══════════════════════════════════════════════════════════════════════ */

interface SyncedUniversity {
  schlId: string;
  slug: string;
  name: string;
  category: string;
}

async function syncUniversities(
  client: KcueClient,
  sb: SupabaseClient,
  opts: CliOpts,
): Promise<SyncedUniversity[]> {
  console.log(`\n📡 [phase=universities] schlId ${opts.startSchlId}..${opts.endSchlId} (year=${opts.surveyYear})`);
  const synced: SyncedUniversity[] = [];
  let emptyStreak = 0;
  let invalidCount = 0;

  for (let n = opts.startSchlId; n <= opts.endSchlId; n += 1) {
    const schlId = String(n).padStart(7, "0");
    let pageOk = true;
    let firstItem: { schlKrnNm: string; schlDivNm: string; schlEstbNm: string } | undefined;
    try {
      const res = await client.fetchIndicator({
        service: "StudentService",
        operation: "getComparisonFreshmanChanceBalanceSelectionRatio",
        schlId,
        surveyYear: opts.surveyYear,
      });
      invalidCount += res.invalidCount;
      if (res.items.length === 0) {
        pageOk = false;
      } else {
        const it = res.items[0];
        firstItem = {
          schlKrnNm: it.schlKrnNm,
          schlDivNm: it.schlDivNm,
          schlEstbNm: it.schlEstbNm,
        };
      }
    } catch (e) {
      if (e instanceof KcueServiceError && e.resultCode === "03") {
        // NODATA — 빈 schlId
        pageOk = false;
      } else if (e instanceof KcueRateLimitExceededError) {
        console.error(`\n🛑 rate limit 도달 — sync 중단`);
        throw e;
      } else {
        console.warn(`  ⚠️  ${schlId} fetch 실패: ${e instanceof Error ? e.message : e}`);
        pageOk = false;
      }
    }

    if (!pageOk || !firstItem) {
      emptyStreak += 1;
      if (emptyStreak >= opts.emptyStreakStop) {
        console.log(
          `  ⏹  emptyStreak ${opts.emptyStreakStop} 도달 (schlId=${schlId}) — 조기종료`,
        );
        break;
      }
      continue;
    }
    emptyStreak = 0;

    const slug = makeUniversitySlug(schlId);
    const category = mapCategory(firstItem.schlDivNm, firstItem.schlEstbNm);
    const row = {
      id: slug,
      n: firstItem.schlKrnNm,
      category,
      campuses: [],
      kcue_code: schlId,
      kcue_synced_at: new Date().toISOString(),
      active: true,
    };

    if (!opts.dryRun) {
      // PK (id) 기반 upsert — slug `kcue_<schlId>` 가 schlId 와 1:1 결정적이라
      // 멱등성 보장됨. partial unique index (kcue_code) 는 별도 무결성 가드.
      const { error } = await sb.from("universities").upsert(row);
      if (error) {
        console.warn(`  ⚠️  upsert 실패 ${schlId} ${firstItem.schlKrnNm}: ${error.message}`);
        continue;
      }
    }
    synced.push({ schlId, slug, name: firstItem.schlKrnNm, category });
    if (synced.length % 25 === 0) {
      const rl = client.getRateLimitState();
      console.log(`  · ${synced.length} 대학 시드, ${rl.callsToday}/${rl.dailyLimit} 호출`);
    }
  }

  console.log(
    `\n✅ universities phase: ${synced.length} 시드 / invalidItems=${invalidCount} ` +
      `/ 호출 ${client.getRateLimitState().callsToday}`,
  );
  return synced;
}

/* ═══════════════════════════════════════════════════════════════════════
   Phase 2 — departments (학교별 SchoolMajorInfo 호출)
   ═══════════════════════════════════════════════════════════════════════ */

async function syncDepartments(
  client: KcueClient,
  sb: SupabaseClient,
  universities: SyncedUniversity[],
  opts: CliOpts,
): Promise<{ totalUniversities: number; totalDepartments: number }> {
  console.log(`\n📡 [phase=departments] ${universities.length} 대학 처리 (year=${opts.surveyYear})`);
  let totalDepartments = 0;

  // legacy 매핑 보호 — id 가 `*-ba-d` 패턴이 아닌데 kedi_mjr_id 보유한 row 는 legacy.
  // 같은 (univ, kediMjrId) 의 학사·주간 row 를 신규 upsert 하면 중복. Set 으로 차단.
  const legacyMapped = new Set<string>();
  const { data: legacyRows } = await sb
    .from("departments")
    .select("university_id, kedi_mjr_id, id")
    .not("kedi_mjr_id", "is", null)
    .not("id", "like", "%-ba-d")
    .not("id", "like", "%-ma-d")
    .not("id", "like", "%-phd-d")
    .not("id", "like", "%-ass-d");
  legacyRows?.forEach((r) => {
    if (r.kedi_mjr_id) legacyMapped.add(`${r.university_id}/${r.kedi_mjr_id}`);
  });
  console.log(`  · legacy 매핑 보호: ${legacyMapped.size} 학과 (재생성 차단)`);

  for (let i = 0; i < universities.length; i += 1) {
    const u = universities[i];
    let majors: KcueSchoolMajor[] = [];
    try {
      const res = await client.fetchSchoolMajors({
        schoolKoreanName: u.name,
        surveyYear: opts.surveyYear,
        numOfRows: 200,
        fetchAllPages: true,
      });
      // schlKrnNm 은 substring 매칭이라 "서울대학교" 호출이 "남서울대학교" 까지 가져옴.
      // 응답 schlNm 이 정확히 학교명과 일치하는 row 만 채택.
      majors = res.items.filter((m) => m.schlNm === u.name);
    } catch (e) {
      if (e instanceof KcueRateLimitExceededError) {
        console.error(`\n🛑 rate limit 도달 — sync 중단`);
        throw e;
      }
      console.warn(`  ⚠️  ${u.name} 학과 fetch 실패: ${e instanceof Error ? e.message : e}`);
      continue;
    }

    if (majors.length === 0) {
      console.log(`  · ${i + 1}/${universities.length} ${u.name} → 학과 0개 (스킵)`);
      continue;
    }

    // dedup by id — KCUE 가 같은 (kediMjrId, deg, day) 를 여러 행으로 반복하는 경우 보호
    const byId = new Map<string, ReturnType<typeof toRow>>();
    function toRow(m: KcueSchoolMajor) {
      const d = normalizeDepartmentFromMajor(m);
      return {
        id: makeDepartmentId(d.kediMjrId, d.degreeCourse, d.daytime),
        university_id: u.slug,
        campus_id: "main", // KCUE 응답엔 캠퍼스 분리 정보 없음 — 기본 main, admin 분리
        name: d.name,
        track: classifyTrack(d.fieldCategory),
        total_quota: d.freshmanCount,
        unit_type: d.name.includes("학부") ? "division" : "department",
        active: d.active,
        kedi_mjr_id: d.kediMjrId,
        std_clft_mjr_id: d.stdClftMjrId || null,
        kcue_synced_at: new Date().toISOString(),
      };
    }
    for (const m of majors) {
      const row = toRow(m);
      // 학사·주간 + legacy 매핑 존재 시 row 생성 X (legacy 가 정본)
      const isUndergradDay = row.id.endsWith("-ba-d");
      if (isUndergradDay && legacyMapped.has(`${row.university_id}/${row.kedi_mjr_id}`)) {
        continue;
      }
      byId.set(row.id, row); // 마지막 wins — KCUE 가 같은 학과를 여러 행으로 줘도 안전
    }
    const rows = [...byId.values()];

    if (!opts.dryRun) {
      // 복합 PK (university_id, id) 기반 — id 가 (kediMjrId, deg, day) 조합으로 결정적.
      const { error } = await sb.from("departments").upsert(rows);
      if (error) {
        console.warn(`  ⚠️  ${u.name} departments upsert 실패: ${error.message}`);
        continue;
      }
    }
    totalDepartments += rows.length;
    console.log(`  · ${i + 1}/${universities.length} ${u.name} → ${rows.length} 학과`);
  }

  console.log(`\n✅ departments phase: ${totalDepartments} 학과 시드`);
  return { totalUniversities: universities.length, totalDepartments };
}

/** KCUE 학문계열 → 우리 departments.track enum */
function classifyTrack(fieldCategory: string): string {
  if (fieldCategory.includes("공학")) return "engineering";
  if (fieldCategory.includes("자연")) return "natural";
  if (fieldCategory.includes("의약") || fieldCategory.includes("의학")) return "medical";
  if (fieldCategory.includes("교육")) return "interdisciplinary";
  if (fieldCategory.includes("예체") || fieldCategory.includes("예술") || fieldCategory.includes("체육"))
    return "arts";
  if (fieldCategory.includes("사회")) return "social";
  if (fieldCategory.includes("인문")) return "humanities";
  return "interdisciplinary"; // 보수적 default
}

/* ═══════════════════════════════════════════════════════════════════════
   Phase 3 — indicators (선택)
   ═══════════════════════════════════════════════════════════════════════ */

async function syncIndicators(
  client: KcueClient,
  universities: SyncedUniversity[],
  opts: CliOpts,
): Promise<void> {
  console.log(`\n📡 [phase=indicators] ${universities.length} 대학 × 3 service`);
  const operations = [
    { service: "FinancesService" as const, op: "getComparisonTuitionCrntSt", label: "등록금" },
    { service: "EducationResearchService" as const, op: "getComparisonGypsyScholarFacultyLectureChargeRatio", label: "전임강의비율" },
    { service: "StudentService" as const, op: "getComparisonFreshmanChanceBalanceSelectionRatio", label: "기회균형비율" },
  ];

  for (const u of universities) {
    for (const item of operations) {
      try {
        const res = await client.fetchIndicator({
          service: item.service,
          operation: item.op,
          schlId: u.schlId,
          surveyYear: opts.surveyYear,
        });
        const val = res.items[0]?.indctVal1 ?? "(no data)";
        console.log(`  · ${u.name.padEnd(20)} ${item.label}: ${val}`);
      } catch (e) {
        if (e instanceof KcueRateLimitExceededError) throw e;
        console.warn(`    ⚠️  ${u.name} ${item.label} 실패: ${e instanceof Error ? e.message : e}`);
      }
    }
  }
  // 본 phase 는 진단·확장 시뮬용 — 실제 DB 컬럼 매핑은 indicator type 결정 후 별도 마이그레이션.
  console.log(`\n💡 indicators phase 는 진단/preview 모드 — DB 매핑은 별도 마이그레이션 필요.`);
}

/* ═══════════════════════════════════════════════════════════════════════
   메인
   ═══════════════════════════════════════════════════════════════════════ */

async function main(): Promise<void> {
  const opts = parseCli();
  console.log(`🚀 KCUE baseline sync — phase=${opts.phase} dry=${opts.dryRun}`);

  const sb: SupabaseClient = createClient(
    readEnv("NEXT_PUBLIC_SUPABASE_URL"),
    readEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // KCUE_API_KEY check — resolveKey 가 client 내부에서 호출되지만 사전 검증
  readEnv("KCUE_API_KEY");

  const client = new KcueClient({
    onCall: process.env.DEBUG_KCUE
      ? (info) => console.log(`    HTTP ${info.status} ${info.elapsedMs}ms ${info.url}`)
      : undefined,
  });

  let universities: SyncedUniversity[] = [];
  if (opts.phase === "universities" || opts.phase === "all") {
    universities = await syncUniversities(client, sb, opts);
  } else {
    // departments/indicators phase 단독 호출 시 — 이미 시드된 대학을 DB 에서 로드
    const { data, error } = await sb
      .from("universities")
      .select("id, n, kcue_code, category")
      .not("kcue_code", "is", null)
      .order("kcue_code");
    if (error) throw new Error(`기존 universities 로드 실패: ${error.message}`);
    universities = (data ?? []).map((r) => ({
      schlId: r.kcue_code as string,
      slug: r.id as string,
      name: r.n as string,
      category: r.category as string,
    }));
    console.log(`  · DB 에서 ${universities.length} 대학 로드`);
  }

  if (opts.phase === "departments" || opts.phase === "all") {
    await syncDepartments(client, sb, universities, opts);
  }

  if (opts.phase === "indicators" || opts.phase === "all") {
    await syncIndicators(client, universities, opts);
  }

  const rl = client.getRateLimitState();
  console.log(`\n📊 총 ${rl.callsToday}/${rl.dailyLimit} 호출 사용. sync 완료.`);
}

main().catch((e) => {
  console.error("\n❌ sync 실패:", e instanceof Error ? e.stack : e);
  process.exit(1);
});
