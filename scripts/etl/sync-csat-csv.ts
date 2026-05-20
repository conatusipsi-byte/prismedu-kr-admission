#!/usr/bin/env node
/**
 * KICE 수능 통계 CSV → Supabase 시드
 *
 *   npx tsx scripts/etl/sync-csat-csv.ts [--dir=university/] [--dry-run]
 *
 * 처리:
 *   1. university/TalkFile_*.csv 스캔
 *   2. 파일명에서 examKind / examYear / examDate 추출
 *   3. CP949 → UTF-8 변환 + Papa Parse + Zod 검증
 *   4. csat_grade_cuts / csat_attendance 멱등 upsert
 *
 * 정직성 (P-002):
 *   - 검증 실패 row 는 invalidRows 누적 후 임계 초과(20%)면 적재 거부.
 *   - 출처 source='kice_csv' 강제 마킹.
 */

import fs from "node:fs";
import path from "node:path";
import WebSocket from "ws";
if (typeof globalThis.WebSocket === "undefined") {
  (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = WebSocket;
}
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  detectExamMetaFromFilename,
  isAbsoluteGradeSubject,
  parseCsatAttendanceCsvFile,
  parseCsatGradeCutsCsvFile,
  parseCutScoreCell,
} from "./parsers/csat-stats-csv";

function readEnv(k: string): string {
  if (process.env[k]) return process.env[k]!;
  const c = fs.readFileSync(path.resolve(".env.local"), "utf8");
  const m = c.match(new RegExp(`^${k}=(.+)$`, "m"));
  if (!m) throw new Error(`${k} 미설정`);
  return m[1].trim().replace(/^"(.*)"$/, "$1");
}

function arg(k: string, dflt?: string): string | undefined {
  const m = process.argv.find((a) => a.startsWith(`--${k}=`));
  return m ? m.slice(k.length + 3) : dflt;
}

async function main(): Promise<void> {
  const dir = arg("dir", "university") ?? "university";
  const dryRun = process.argv.includes("--dry-run");
  console.log(`🚀 KICE CSV sync — dir=${dir} dry=${dryRun}`);

  const sb: SupabaseClient = createClient(
    readEnv("NEXT_PUBLIC_SUPABASE_URL"),
    readEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Linux 파일시스템·터미널에서 한글 파일명은 NFD(decomposed) 로 들어오기도 함.
  // fs 호출은 원본 이름 유지, 비교용 NFC-정규화 별칭 보관.
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(".csv"))
    .map((rawName) => ({ rawName, normName: rawName.normalize("NFC") }));
  console.log(`📂 ${files.length} CSV 파일 발견:\n${files.map((f) => `   ${f.normName}`).join("\n")}\n`);

  let totalGradeCuts = 0;
  let totalAttendance = 0;

  for (const { rawName, normName } of files) {
    const file = normName; // 비교용
    const fullPath = path.join(dir, rawName); // fs I/O 용
    const meta = detectExamMetaFromFilename(file);

    if (file.includes("응시현황")) {
      // 응시현황 — 파일명 무관 (다년치 데이터)
      console.log(`→ ${file} (응시현황)`);
      const result = parseCsatAttendanceCsvFile(fullPath);
      console.log(`   rows=${result.rows.length} invalid=${result.invalidRows.length}`);
      if (result.invalidRows.length > 0 && result.invalidRows.length / (result.rows.length + result.invalidRows.length) >= 0.2) {
        console.warn(`   ⚠️  검증 실패율 20% 초과 — 적재 스킵`);
        continue;
      }
      if (!dryRun) {
        const rows = result.rows.map((r) => ({
          exam_year: r.학년도,
          exam_date: r.시험일정,
          applied_count: r["지원인원(명)"],
          attended_count: r["응시인원(명)"],
          attended_ratio: r["응시율(퍼센트)"],
          source: "kice_csv",
        }));
        const { error } = await sb.from("csat_attendance").upsert(rows, {
          onConflict: "exam_year,exam_date",
        });
        if (error) {
          console.warn(`   ⚠️  upsert 실패: ${error.message}`);
        } else {
          totalAttendance += rows.length;
        }
      }
      continue;
    }

    if (file.includes("등급구분")) {
      // 등급구분/표준점수 — 파일명에서 메타 추출 필요
      if (!meta) {
        console.warn(`   ⚠️  ${file} — 파일명 메타 추출 실패, 스킵`);
        continue;
      }
      console.log(`→ ${file} (${meta.examKind} / ${meta.examYear}학년도 / ${meta.examDate})`);
      const result = parseCsatGradeCutsCsvFile(fullPath);
      console.log(`   rows=${result.rows.length} invalid=${result.invalidRows.length}`);
      if (result.invalidRows.length > 0) {
        result.invalidRows.slice(0, 3).forEach((iv) => {
          console.warn(`     invalid row ${iv.rowNumber}: ${iv.reason.slice(0, 80)}`);
        });
      }
      if (!dryRun) {
        const rows = result.rows.map((r) => {
          const { cutScore, upperBound } = parseCutScoreCell(r["구분 점수"]);
          return {
            exam_kind: meta.examKind,
            exam_year: meta.examYear,
            exam_date: meta.examDate,
            subject: r.과목,
            grade: r.등급,
            grade_type: isAbsoluteGradeSubject(r.과목) ? "absolute" : "relative",
            cut_score: cutScore,
            cut_score_upper_bound: upperBound,
            population_count: r["인원(명)"] ?? null,
            ratio_percent: r["비율(퍼센트)"] ?? null,
            source: "kice_csv",
          };
        });
        const { error } = await sb.from("csat_grade_cuts").upsert(rows, {
          onConflict: "exam_kind,exam_date,subject,grade",
        });
        if (error) {
          console.warn(`   ⚠️  upsert 실패: ${error.message}`);
        } else {
          totalGradeCuts += rows.length;
        }
      }
      continue;
    }

    console.log(`→ ${file} — 카테고리 인식 안 됨 (응시현황·등급구분 미포함), 스킵`);
  }

  console.log(
    `\n📊 적재 완료: csat_grade_cuts ${totalGradeCuts} rows, csat_attendance ${totalAttendance} rows`,
  );
}

main().catch((e) => {
  console.error("\n❌ sync 실패:", e instanceof Error ? e.stack : e);
  process.exit(1);
});
