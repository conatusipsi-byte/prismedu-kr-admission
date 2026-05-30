#!/usr/bin/env node
/**
 * SNU PDF 전체 chunked 처리 (2026-05-30).
 *
 *   npx tsx scripts/etl/pdf-vision/process-snu.ts
 *
 * 흐름:
 *   1. 정의된 SNU_CHUNKS 각각을 pdftk 로 추출
 *   2. analyze.ts 동일 로직 (인라인) 으로 Vision 분석
 *   3. 결과 JSON 들을 학과·전형 단위로 머지
 *   4. snu-full.json 생성 + 검증 리포트 출력
 *
 * 정직성 (P-002):
 *   - 청크별 결과를 각각 보존 (snu-chunk-{label}.json) → 사용자 대조용
 *   - 머저는 단순 union (학과명 + 전형명 키) — 중복 시 sourcePages 합치고 채워진 필드 우선
 *   - 충돌 (예: 같은 전형의 다른 반영비율) 발생 시 warnings 누적
 */

import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import Anthropic from "@anthropic-ai/sdk";
import { config as loadDotenv } from "dotenv";

import {
  PdfAnalysisResultSchema,
  type PdfAnalysisResult,
  type RawDepartment,
  type RawTrack,
} from "./types";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt";

loadDotenv({ path: path.resolve(process.cwd(), ".env.local") });

const SNU_PDF = path.resolve("univ/SNU_2027_susi.pdf");
const OUT_DIR = path.resolve("scripts/etl/pdf-vision/output");
const MODEL = "claude-sonnet-4-6";

/**
 * SNU 76 페이지 chunk 정의 — 핵심 데이터가 있는 페이지만 선별.
 * label 은 출력 파일명 + 머저 리포트에서 식별용.
 */
interface ChunkDef {
  label: string;
  pages: string; // pdftk cat range
  startPage: number; // 1-indexed original PDF page
  pageCount: number;
  purpose: string;
}

const SNU_CHUNKS: ChunkDef[] = [
  { label: "01-quota",        pages: "11-12", startPage: 11, pageCount: 2, purpose: "세부 모집인원 표" },
  { label: "02-jiyok",        pages: "18-21", startPage: 18, pageCount: 4, purpose: "지역균형 전형방법 + 응시영역 (이전 검증 통과)" },
  { label: "03-ilban",        pages: "24-27", startPage: 24, pageCount: 4, purpose: "일반전형 (음대 제외) 전형방법" },
  { label: "04-music",        pages: "32-36", startPage: 32, pageCount: 5, purpose: "음대 실기위주/학종 전형방법" },
  { label: "05-equity",       pages: "40-44", startPage: 40, pageCount: 5, purpose: "기회균형(사회통합) 전형방법" },
  { label: "06-csat-min",     pages: "54-55", startPage: 54, pageCount: 2, purpose: "붙임 1: 수능 응시영역 + 최저학력기준 종합" },
];

/* ───────────────────────────────────────────────────────────────────── */

interface ChunkResult {
  label: string;
  startPage: number;
  pageCount: number;
  purpose: string;
  elapsedSec: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  stopReason: string;
  zodValid: boolean;
  result: PdfAnalysisResult | null;
  raw: unknown;
  error?: string;
}

async function extractChunk(chunk: ChunkDef): Promise<string> {
  const outPath = path.join(OUT_DIR, `snu-chunk-${chunk.label}.pdf`);
  execFileSync("pdftk", [SNU_PDF, "cat", chunk.pages, "output", outPath]);
  return outPath;
}

async function analyzeChunk(
  client: Anthropic,
  chunk: ChunkDef,
  pdfPath: string,
): Promise<ChunkResult> {
  const pdfBytes = await fs.readFile(pdfPath);
  const pdfBase64 = pdfBytes.toString("base64");

  console.log(`\n▶ [${chunk.label}] p${chunk.startPage}~p${chunk.startPage + chunk.pageCount - 1} (${chunk.purpose})`);
  const startedAt = Date.now();
  const userPrompt = buildUserPrompt(chunk.startPage, chunk.pageCount);

  let response: Anthropic.Messages.Message;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
            },
            { type: "text", text: userPrompt },
          ],
        },
      ],
    });
  } catch (e) {
    const err = e as Error;
    console.error(`  ❌ API 실패: ${err.message}`);
    return {
      label: chunk.label,
      startPage: chunk.startPage,
      pageCount: chunk.pageCount,
      purpose: chunk.purpose,
      elapsedSec: 0,
      inputTokens: 0,
      outputTokens: 0,
      cost: 0,
      stopReason: "error",
      zodValid: false,
      result: null,
      raw: null,
      error: err.message,
    };
  }

  const elapsedSec = +((Date.now() - startedAt) / 1000).toFixed(1);
  const cost = (response.usage.input_tokens * 3 + response.usage.output_tokens * 15) / 1_000_000;
  console.log(`  ✅ ${elapsedSec}s, in=${response.usage.input_tokens} out=${response.usage.output_tokens} stop=${response.stop_reason} $${cost.toFixed(4)}`);

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    return {
      label: chunk.label,
      startPage: chunk.startPage,
      pageCount: chunk.pageCount,
      purpose: chunk.purpose,
      elapsedSec,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cost,
      stopReason: response.stop_reason ?? "",
      zodValid: false,
      result: null,
      raw: null,
      error: "no_text_block",
    };
  }

  let jsonText = textBlock.text.trim();
  if (jsonText.startsWith("```")) {
    jsonText = jsonText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    console.error(`  ❌ JSON parse: ${(e as Error).message}`);
    return {
      label: chunk.label,
      startPage: chunk.startPage,
      pageCount: chunk.pageCount,
      purpose: chunk.purpose,
      elapsedSec,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cost,
      stopReason: response.stop_reason ?? "",
      zodValid: false,
      result: null,
      raw: jsonText.slice(0, 2000),
      error: `json_parse: ${(e as Error).message}`,
    };
  }

  const validated = PdfAnalysisResultSchema.safeParse(parsed);
  if (!validated.success) {
    console.warn(`  ⚠️  Zod fail: ${JSON.stringify(validated.error.issues[0]).slice(0, 200)}`);
  } else {
    const r = validated.data;
    const totalTracks = r.departments.reduce((s, d) => s + d.tracks.length, 0);
    console.log(`  📊 학과=${r.departments.length} 전형=${totalTracks} warnings=${r.warnings.length}`);
  }

  // 청크별 출력 저장
  const chunkOutPath = path.join(OUT_DIR, `snu-chunk-${chunk.label}.json`);
  await fs.writeFile(
    chunkOutPath,
    JSON.stringify(
      { meta: { chunk, elapsedSec, cost, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens, zodValid: validated.success, stopReason: response.stop_reason }, result: validated.success ? validated.data : null, raw: validated.success ? null : parsed },
      null,
      2,
    ),
  );

  return {
    label: chunk.label,
    startPage: chunk.startPage,
    pageCount: chunk.pageCount,
    purpose: chunk.purpose,
    elapsedSec,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cost,
    stopReason: response.stop_reason ?? "",
    zodValid: validated.success,
    result: validated.success ? validated.data : null,
    raw: validated.success ? null : parsed,
  };
}

/* ───────────────────────────────────────────────────────────────────────
   머저 — 학과 + 전형 단위 union, 채워진 필드 우선, sourcePages 누적
   ─────────────────────────────────────────────────────────────────────── */

function mergeChunks(results: ChunkResult[]): {
  merged: { universityName: string; year: number; recruitmentSeason: string; departments: RawDepartment[]; warnings: string[]; chunkSummaries: Array<{ label: string; purpose: string; startPage: number; pageCount: number; tracksFound: number; cost: number; elapsedSec: number; warnings: string[] }> };
} {
  const deptMap = new Map<string, RawDepartment>();
  const allWarnings: string[] = [];
  const chunkSummaries: Array<{ label: string; purpose: string; startPage: number; pageCount: number; tracksFound: number; cost: number; elapsedSec: number; warnings: string[] }> = [];
  let universityName = "서울대학교";
  let year = 2027;
  let recruitmentSeason = "susi";

  for (const cr of results) {
    chunkSummaries.push({
      label: cr.label,
      purpose: cr.purpose,
      startPage: cr.startPage,
      pageCount: cr.pageCount,
      tracksFound: cr.result?.departments.reduce((s, d) => s + d.tracks.length, 0) ?? 0,
      cost: cr.cost,
      elapsedSec: cr.elapsedSec,
      warnings: cr.result?.warnings ?? (cr.error ? [`error: ${cr.error}`] : []),
    });
    if (!cr.result) continue;
    universityName = cr.result.universityName;
    year = cr.result.year;
    recruitmentSeason = cr.result.recruitmentSeason;
    allWarnings.push(...cr.result.warnings.map((w) => `[${cr.label}] ${w}`));

    for (const dept of cr.result.departments) {
      const key = dept.departmentName;
      const existing = deptMap.get(key);
      if (!existing) {
        deptMap.set(key, structuredClone(dept));
        continue;
      }
      // 학과 메타: 비어있던 필드 채움
      existing.campus ??= dept.campus;
      existing.trackHint ??= dept.trackHint;
      existing.totalQuotaHint ??= dept.totalQuotaHint;
      // 전형 union — 같은 trackName 발견 시 머저
      for (const incoming of dept.tracks) {
        const dup = existing.tracks.find((t) => t.trackName === incoming.trackName);
        if (!dup) {
          existing.tracks.push(structuredClone(incoming));
          continue;
        }
        // 머저 규칙: 비어있던 필드를 incoming 으로 채움, sourcePages 누적
        if (dup.quotaInitial == null && incoming.quotaInitial != null) dup.quotaInitial = incoming.quotaInitial;
        if (dup.reflectionStages == null && incoming.reflectionStages != null) dup.reflectionStages = incoming.reflectionStages;
        if (dup.csatMinimumRawText == null && incoming.csatMinimumRawText != null) {
          dup.csatMinimumRawText = incoming.csatMinimumRawText;
          dup.csatMinimumExempt = incoming.csatMinimumExempt;
        } else if (dup.csatMinimumExempt == null && incoming.csatMinimumExempt != null) {
          dup.csatMinimumExempt = incoming.csatMinimumExempt;
        }
        if (dup.csatRequiredAreasRawText == null && incoming.csatRequiredAreasRawText != null) dup.csatRequiredAreasRawText = incoming.csatRequiredAreasRawText;
        if (dup.specialTypeKeyword == null && incoming.specialTypeKeyword != null) dup.specialTypeKeyword = incoming.specialTypeKeyword;
        if (dup.applicationQualification == null && incoming.applicationQualification != null) dup.applicationQualification = incoming.applicationQualification;
        if (dup.prevYearResult == null && incoming.prevYearResult != null) dup.prevYearResult = incoming.prevYearResult;
        // sourcePages 누적 + 정렬
        const pages = new Set([...dup.sourcePages, ...incoming.sourcePages]);
        dup.sourcePages = Array.from(pages).sort((a, b) => a - b);
      }
    }
  }

  return {
    merged: {
      universityName,
      year,
      recruitmentSeason,
      departments: Array.from(deptMap.values()),
      warnings: allWarnings,
      chunkSummaries,
    },
  };
}

/* ───────────────────────────────────────────────────────────────────── */

async function main(): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.startsWith("your_")) {
    console.error("❌ ANTHROPIC_API_KEY 미설정");
    process.exit(1);
  }
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 600_000 });

  console.log(`== SNU PDF 전체 chunked 처리 ==`);
  console.log(`청크 수: ${SNU_CHUNKS.length}`);

  await fs.mkdir(OUT_DIR, { recursive: true });

  const results: ChunkResult[] = [];
  for (const chunk of SNU_CHUNKS) {
    try {
      const pdfPath = await extractChunk(chunk);
      const result = await analyzeChunk(client, chunk, pdfPath);
      results.push(result);
    } catch (e) {
      console.error(`[${chunk.label}] 예외:`, e);
      results.push({
        label: chunk.label,
        startPage: chunk.startPage,
        pageCount: chunk.pageCount,
        purpose: chunk.purpose,
        elapsedSec: 0,
        inputTokens: 0,
        outputTokens: 0,
        cost: 0,
        stopReason: "exception",
        zodValid: false,
        result: null,
        raw: null,
        error: (e as Error).message,
      });
    }
  }

  // 머저
  const { merged } = mergeChunks(results);
  const totalCost = results.reduce((s, r) => s + r.cost, 0);
  const totalTime = results.reduce((s, r) => s + r.elapsedSec, 0);

  const fullOut = {
    meta: {
      universityName: merged.universityName,
      year: merged.year,
      recruitmentSeason: merged.recruitmentSeason,
      processedAt: new Date().toISOString(),
      totalCost: +totalCost.toFixed(4),
      totalElapsedSec: +totalTime.toFixed(1),
      chunks: merged.chunkSummaries,
      model: MODEL,
    },
    result: {
      departments: merged.departments,
      warnings: merged.warnings,
    },
  };

  const outPath = path.join(OUT_DIR, "snu-full.json");
  await fs.writeFile(outPath, JSON.stringify(fullOut, null, 2));

  console.log(`\n${"=".repeat(60)}`);
  console.log(`== 머저 완료 ==`);
  console.log(`학과: ${merged.departments.length}`);
  console.log(`전형 총: ${merged.departments.reduce((s, d) => s + d.tracks.length, 0)}`);
  console.log(`총 비용: $${totalCost.toFixed(4)}`);
  console.log(`총 시간: ${totalTime.toFixed(1)}s`);
  console.log(`warnings: ${merged.warnings.length}`);
  console.log(`출력: ${outPath}`);
  console.log(`청크별 요약:`);
  for (const cs of merged.chunkSummaries) {
    console.log(`  [${cs.label}] p${cs.startPage}-${cs.startPage + cs.pageCount - 1} ${cs.purpose}`);
    console.log(`    transforms=${cs.tracksFound} $${cs.cost.toFixed(4)} ${cs.elapsedSec}s warnings=${cs.warnings.length}`);
  }
}

void main();
