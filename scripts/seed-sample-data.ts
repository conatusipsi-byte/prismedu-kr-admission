#!/usr/bin/env node
/**
 * Supabase 샘플 데이터 시드 — 한국 대표 대학 10개 + 학과 30+ + 2027학년도 admissions.
 *
 * 클라이언트가 실 데이터(공공 API 또는 직접 제공) 결정 전 e2e 테스트·시연용.
 * idempotent — upsert 사용해 여러 번 실행해도 안전.
 *
 *   npx tsx scripts/seed-sample-data.ts
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

const YEAR = 2027;

interface Univ {
  id: string;
  n: string;
  shortName: string;
  category: "seoul_top" | "seoul" | "national_flag" | "national_local" | "private_local" | "special";
  rankOrder: number;
  region: string;
  depts: Array<{
    id: string;
    name: string;
    track: "humanities" | "social" | "natural" | "engineering" | "medical" | "arts" | "interdisciplinary";
    totalQuota: number;
    tracks: Array<{
      kind: "susi_subject" | "susi_comprehensive" | "susi_essay" | "jeongsi_ga" | "jeongsi_na" | "jeongsi_da";
      name: string;
      quotaInitial: number;
      csatMin?: { requiredCount: number; sumGradeMax: number };
    }>;
    /** 표본 충분 학과만 true (insufficient 케이스 데모용으로 일부는 false) */
    hasSamples: boolean;
  }>;
}

const UNIVERSITIES: Univ[] = [
  {
    id: "snu", n: "서울대학교", shortName: "서울대", category: "seoul_top", rankOrder: 1, region: "seoul",
    depts: [
      { id: "computer-science", name: "컴퓨터공학부", track: "engineering", totalQuota: 55,
        tracks: [
          { kind: "susi_comprehensive", name: "지역균형전형", quotaInitial: 15, csatMin: { requiredCount: 3, sumGradeMax: 7 } },
          { kind: "jeongsi_na", name: "일반전형", quotaInitial: 40 },
        ], hasSamples: true },
      { id: "medicine", name: "의예과", track: "medical", totalQuota: 40,
        tracks: [
          { kind: "susi_comprehensive", name: "지역균형전형", quotaInitial: 16, csatMin: { requiredCount: 4, sumGradeMax: 5 } },
          { kind: "jeongsi_na", name: "일반전형", quotaInitial: 24 },
        ], hasSamples: false /* 표본 부족 데모 */ },
      { id: "business", name: "경영학과", track: "social", totalQuota: 60,
        tracks: [{ kind: "jeongsi_na", name: "일반전형", quotaInitial: 60 }], hasSamples: true },
    ],
  },
  {
    id: "yonsei", n: "연세대학교", shortName: "연세대", category: "seoul_top", rankOrder: 2, region: "seoul",
    depts: [
      { id: "computer-science", name: "컴퓨터과학과", track: "engineering", totalQuota: 60,
        tracks: [
          { kind: "susi_comprehensive", name: "활동우수형", quotaInitial: 20, csatMin: { requiredCount: 2, sumGradeMax: 5 } },
          { kind: "jeongsi_na", name: "일반전형", quotaInitial: 40 },
        ], hasSamples: true },
      { id: "business", name: "경영학과", track: "social", totalQuota: 80,
        tracks: [
          { kind: "susi_essay", name: "논술전형", quotaInitial: 30 },
          { kind: "jeongsi_na", name: "일반전형", quotaInitial: 50 },
        ], hasSamples: true },
    ],
  },
  {
    id: "korea", n: "고려대학교", shortName: "고려대", category: "seoul_top", rankOrder: 3, region: "seoul",
    depts: [
      { id: "computer-science", name: "컴퓨터학과", track: "engineering", totalQuota: 55,
        tracks: [
          { kind: "susi_subject", name: "학교추천전형", quotaInitial: 20, csatMin: { requiredCount: 3, sumGradeMax: 7 } },
          { kind: "susi_comprehensive", name: "학업우수전형", quotaInitial: 15, csatMin: { requiredCount: 4, sumGradeMax: 8 } },
          { kind: "jeongsi_ga", name: "일반전형", quotaInitial: 20 },
        ], hasSamples: true },
      { id: "media", name: "미디어학부", track: "social", totalQuota: 50,
        tracks: [{ kind: "susi_comprehensive", name: "학업우수전형", quotaInitial: 25 }], hasSamples: true },
      { id: "design-art", name: "디자인조형학부", track: "arts", totalQuota: 30,
        tracks: [{ kind: "susi_essay", name: "논술전형", quotaInitial: 15 }], hasSamples: false },
    ],
  },
  {
    id: "hanyang", n: "한양대학교", shortName: "한양대", category: "seoul_top", rankOrder: 5, region: "seoul",
    depts: [
      { id: "mechanical", name: "기계공학부", track: "engineering", totalQuota: 70,
        tracks: [
          { kind: "susi_subject", name: "학생부교과", quotaInitial: 25, csatMin: { requiredCount: 3, sumGradeMax: 8 } },
          { kind: "jeongsi_na", name: "일반전형", quotaInitial: 45 },
        ], hasSamples: true },
    ],
  },
  {
    id: "sungkyunkwan", n: "성균관대학교", shortName: "성균관대", category: "seoul_top", rankOrder: 4, region: "seoul",
    depts: [
      { id: "software", name: "소프트웨어학과", track: "engineering", totalQuota: 65,
        tracks: [
          { kind: "susi_comprehensive", name: "학과모집", quotaInitial: 30, csatMin: { requiredCount: 2, sumGradeMax: 5 } },
          { kind: "jeongsi_na", name: "일반전형", quotaInitial: 35 },
        ], hasSamples: true },
      { id: "global-economics", name: "글로벌경제학과", track: "social", totalQuota: 40,
        tracks: [{ kind: "susi_comprehensive", name: "학과모집", quotaInitial: 20 }], hasSamples: false },
    ],
  },
  {
    id: "sogang", n: "서강대학교", shortName: "서강대", category: "seoul_top", rankOrder: 6, region: "seoul",
    depts: [
      { id: "computer-science", name: "컴퓨터공학과", track: "engineering", totalQuota: 50,
        tracks: [{ kind: "susi_essay", name: "논술전형", quotaInitial: 25 }], hasSamples: true },
    ],
  },
  {
    id: "hkuk", n: "한국외국어대학교", shortName: "한외대", category: "seoul", rankOrder: 8, region: "seoul",
    depts: [
      { id: "english-literature", name: "영어대학[통합]", track: "humanities", totalQuota: 90,
        tracks: [
          { kind: "susi_comprehensive", name: "학종일반", quotaInitial: 30, csatMin: { requiredCount: 2, sumGradeMax: 4 } },
          { kind: "jeongsi_na", name: "일반전형", quotaInitial: 60 },
        ], hasSamples: true },
    ],
  },
  {
    id: "kaist", n: "한국과학기술원", shortName: "KAIST", category: "special", rankOrder: 2, region: "daejeon",
    depts: [
      { id: "ee", name: "전기및전자공학부", track: "engineering", totalQuota: 130,
        tracks: [{ kind: "susi_comprehensive", name: "일반전형", quotaInitial: 130 }], hasSamples: true },
    ],
  },
  {
    id: "postech", n: "포항공과대학교", shortName: "POSTECH", category: "special", rankOrder: 3, region: "gyeongbuk",
    depts: [
      { id: "cs", name: "컴퓨터공학과", track: "engineering", totalQuota: 30,
        tracks: [{ kind: "susi_comprehensive", name: "일반전형", quotaInitial: 30 }], hasSamples: false },
    ],
  },
  {
    id: "pusan", n: "부산대학교", shortName: "부산대", category: "national_flag", rankOrder: 10, region: "busan",
    depts: [
      { id: "info-comp", name: "정보컴퓨터공학부", track: "engineering", totalQuota: 100,
        tracks: [
          { kind: "susi_subject", name: "학생부교과", quotaInitial: 40, csatMin: { requiredCount: 3, sumGradeMax: 9 } },
          { kind: "jeongsi_ga", name: "일반전형", quotaInitial: 60 },
        ], hasSamples: true },
    ],
  },
];

interface Counts {
  universities: number;
  departments: number;
  admissions: number;
  sampleStats: number;
}

async function seed(): Promise<Counts> {
  const counts: Counts = { universities: 0, departments: 0, admissions: 0, sampleStats: 0 };

  for (const u of UNIVERSITIES) {
    // universities upsert
    const { error: univErr } = await sb.from("universities").upsert({
      id: u.id, n: u.n, short_name: u.shortName, category: u.category,
      campuses: [{ id: "main", name: "본교", address: "", region: u.region, isMain: true }],
      rank_order: u.rankOrder,
      active: true,
    });
    if (univErr) { console.error(`❌ univ ${u.id}:`, univErr.message); continue; }
    counts.universities++;

    for (const d of u.depts) {
      const { error: depErr } = await sb.from("departments").upsert({
        id: d.id, university_id: u.id, campus_id: "main",
        name: d.name, unit_type: "department", track: d.track,
        total_quota: d.totalQuota, active: true,
      });
      if (depErr) { console.error(`❌ dept ${u.id}/${d.id}:`, depErr.message); continue; }
      counts.departments++;

      // department_admissions
      const tracksJson: Record<string, Array<Record<string, unknown>>> = {};
      const availableKinds: string[] = [];
      for (const t of d.tracks) {
        if (!tracksJson[t.kind]) tracksJson[t.kind] = [];
        if (!availableKinds.includes(t.kind)) availableKinds.push(t.kind);
        tracksJson[t.kind].push({
          name: t.name,
          kind: t.kind,
          specialType: "general",
          quotaInitial: t.quotaInitial,
          stages: [{ step: 1, components: t.kind.startsWith("jeongsi") ? { csat: 100 } : { document: 100 } }],
          csatMinimum: t.csatMin ? {
            candidateAreas: ["korean", "math", "english", "investigation"],
            requiredCount: t.csatMin.requiredCount,
            sumGradeMax: t.csatMin.sumGradeMax,
            complexity: "simple_sum",
            autoEvaluable: true,
            originalText: `국어, 수학, 영어, 탐구 4개 영역 중 ${t.csatMin.requiredCount}개 영역 등급의 합이 ${t.csatMin.sumGradeMax} 이내`,
          } : null,
        });
      }

      const admId = `${u.id}_${d.id}_${YEAR}`;
      const { error: admErr } = await sb.from("department_admissions").upsert({
        id: admId,
        university_id: u.id,
        department_id: d.id,
        year: YEAR,
        tracks: tracksJson,
        available_track_kinds: availableKinds,
        prev_year_result: {
          competitionRate: 12 + Math.random() * 20,
          gradeCutoff70: 1.2 + Math.random() * 1.0,
        },
        source: {
          parsedAt: new Date().toISOString(),
          parserVersion: "seed-v1",
        },
      });
      if (admErr) { console.error(`❌ adm ${admId}:`, admErr.message); continue; }
      counts.admissions++;

      // admission_sample_stats — hasSamples=true 인 경우만
      if (d.hasSamples) {
        for (const t of d.tracks) {
          const statsId = `${u.id}_${d.id}_${YEAR}_${t.kind}`;
          const verifiedCount = 12 + Math.floor(Math.random() * 30);
          const acceptedCount = Math.floor(verifiedCount * (0.5 + Math.random() * 0.3));
          const { error: statsErr } = await sb.from("admission_sample_stats").upsert({
            id: statsId,
            university_id: u.id,
            department_id: d.id,
            year: YEAR,
            track_kind: t.kind,
            verified_count: verifiedCount,
            weighted_count: verifiedCount * 0.8,
            accepted_count: acceptedCount,
            stage1_passed_count: t.kind === "susi_comprehensive" ? Math.floor(verifiedCount * 1.2) : null,
            stage2_accepted_count: t.kind === "susi_comprehensive" ? acceptedCount : null,
          });
          if (statsErr) { console.error(`❌ stats ${statsId}:`, statsErr.message); continue; }
          counts.sampleStats++;
        }
      }
    }
  }

  return counts;
}

(async () => {
  console.log(`🌱 한국 대표 대학 10개 시드 시작 (학년도 ${YEAR})`);
  const start = Date.now();
  const c = await seed();
  console.log(`\n✅ 완료 (${Date.now() - start}ms):`);
  console.log(`   universities:           ${c.universities}`);
  console.log(`   departments:            ${c.departments}`);
  console.log(`   department_admissions:  ${c.admissions}`);
  console.log(`   admission_sample_stats: ${c.sampleStats}`);
})().catch((e) => { console.error("❌ 실패:", e); process.exit(1); });
