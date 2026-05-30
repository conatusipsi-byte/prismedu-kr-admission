#!/usr/bin/env node
/**
 * 범용 대학 모집요강 PDF 처리기 (2026-05-30).
 *
 *   npx tsx scripts/etl/pdf-vision/process-university.ts \
 *     --pdf=<path> --university-id=<slug> [--chunk-size=15] [--max-tokens=16000]
 *
 * 흐름:
 *   1. PDF 메타 확인 (페이지·크기)
 *   2. chunk-size 페이지 단위로 블라인드 분할 (pdftk)
 *   3. 각 청크 Claude Vision 분석
 *   4. 학과·전형 단위 머저 (snu-full 패턴)
 *   5. 출력: scripts/etl/pdf-vision/output/{universityId}-full.json
 *
 * 정직성:
 *   - 청크 경계가 표를 자르면 warnings 누적
 *   - broadcast 는 후속 단계 (broadcast.ts 별도 실행)
 *   - 충돌 시 첫 청크 값 우선, sourcePages 누적
 */

import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import Anthropic from "@anthropic-ai/sdk";
import { config as loadDotenv } from "dotenv";

import {
  PdfAnalysisResultSchema,
  type RawDepartment,
  type PdfAnalysisResult,
} from "./types";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt";

loadDotenv({ path: path.resolve(process.cwd(), ".env.local") });

const MODEL = "claude-sonnet-4-6";

interface CliOpts {
  pdfPath: string;
  universityId: string;
  chunkSize: number;
  maxTokens: number;
  outDir: string;
}

function parseCli(): CliOpts {
  const arg = (k: string): string | undefined => {
    const m = process.argv.find((a) => a.startsWith(`--${k}=`));
    return m?.slice(k.length + 3);
  };
  const pdfPath = arg("pdf");
  const universityId = arg("university-id");
  if (!pdfPath || !universityId) {
    console.error("필수: --pdf=<path> --university-id=<slug>");
    process.exit(1);
  }
  return {
    pdfPath: path.resolve(pdfPath),
    universityId,
    chunkSize: parseInt(arg("chunk-size") ?? "15", 10),
    maxTokens: parseInt(arg("max-tokens") ?? "16000", 10),
    outDir: path.resolve(arg("out-dir") ?? "scripts/etl/pdf-vision/output"),
  };
}

interface ChunkInfo {
  index: number;
  startPage: number;
  endPage: number;
  pdfPath: string;
}

function getPageCount(pdfPath: string): number {
  const out = execFileSync("pdfinfo", [pdfPath], { encoding: "utf8" });
  const m = out.match(/Pages:\s+(\d+)/);
  if (!m) throw new Error("페이지 추출 실패");
  return parseInt(m[1], 10);
}

function extractChunks(opts: CliOpts, totalPages: number): ChunkInfo[] {
  const chunks: ChunkInfo[] = [];
  let start = 1;
  let idx = 1;
  const chunkDir = path.join(opts.outDir, `${opts.universityId}-chunks`);
  execFileSync("mkdir", ["-p", chunkDir]);
  while (start <= totalPages) {
    const end = Math.min(start + opts.chunkSize - 1, totalPages);
    const outPath = path.join(chunkDir, `${opts.universityId}-${String(idx).padStart(2, "0")}.pdf`);
    execFileSync("pdftk", [opts.pdfPath, "cat", `${start}-${end}`, "output", outPath]);
    chunks.push({ index: idx, startPage: start, endPage: end, pdfPath: outPath });
    start = end + 1;
    idx += 1;
  }
  return chunks;
}

interface ChunkResult {
  index: number;
  startPage: number;
  endPage: number;
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

async function analyzeChunk(
  client: Anthropic,
  chunk: ChunkInfo,
  opts: CliOpts,
): Promise<ChunkResult> {
  const pdfBytes = await fs.readFile(chunk.pdfPath);
  const pdfBase64 = pdfBytes.toString("base64");
  const userPrompt = buildUserPrompt(chunk.startPage, chunk.endPage - chunk.startPage + 1);

  const startedAt = Date.now();
  console.log(`▶ chunk ${chunk.index}: p${chunk.startPage}-${chunk.endPage} (${chunk.endPage - chunk.startPage + 1}p)`);

  let response: Anthropic.Messages.Message;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: opts.maxTokens,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
            { type: "text", text: userPrompt },
          ],
        },
      ],
    });
  } catch (e) {
    const err = e as Error;
    console.error(`  ❌ ${err.message.slice(0, 200)}`);
    return {
      index: chunk.index, startPage: chunk.startPage, endPage: chunk.endPage,
      elapsedSec: 0, inputTokens: 0, outputTokens: 0, cost: 0,
      stopReason: "error", zodValid: false, result: null, raw: null,
      error: err.message,
    };
  }

  const elapsedSec = +((Date.now() - startedAt) / 1000).toFixed(1);
  const cost = (response.usage.input_tokens * 3 + response.usage.output_tokens * 15) / 1_000_000;
  console.log(`  ✅ ${elapsedSec}s in=${response.usage.input_tokens} out=${response.usage.output_tokens} stop=${response.stop_reason} $${cost.toFixed(3)}`);

  const tb = response.content.find((b) => b.type === "text");
  if (!tb || tb.type !== "text") {
    return {
      index: chunk.index, startPage: chunk.startPage, endPage: chunk.endPage,
      elapsedSec, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens,
      cost, stopReason: response.stop_reason ?? "", zodValid: false, result: null, raw: null,
      error: "no_text_block",
    };
  }

  let txt = tb.text.trim();
  if (txt.startsWith("```")) txt = txt.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(txt);
  } catch (e) {
    return {
      index: chunk.index, startPage: chunk.startPage, endPage: chunk.endPage,
      elapsedSec, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens,
      cost, stopReason: response.stop_reason ?? "", zodValid: false, result: null,
      raw: txt.slice(0, 2000), error: `json_parse: ${(e as Error).message}`,
    };
  }
  const validated = PdfAnalysisResultSchema.safeParse(parsed);

  if (validated.success) {
    const r = validated.data;
    const ttot = r.departments.reduce((s, d) => s + d.tracks.length, 0);
    console.log(`  📊 학과=${r.departments.length} 전형=${ttot} warnings=${r.warnings.length}`);
  } else {
    console.warn(`  ⚠️  Zod fail: ${JSON.stringify(validated.error.issues[0]).slice(0, 150)}`);
  }

  return {
    index: chunk.index, startPage: chunk.startPage, endPage: chunk.endPage,
    elapsedSec, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens,
    cost, stopReason: response.stop_reason ?? "",
    zodValid: validated.success,
    result: validated.success ? validated.data : null,
    raw: validated.success ? null : parsed,
  };
}

/* ─────────────────────────────────────────────────────────────────────
   머저 (snu-full 머저 로직 재사용)
   ───────────────────────────────────────────────────────────────────── */
function mergeChunks(results: ChunkResult[]): {
  universityName: string;
  year: number;
  recruitmentSeason: string;
  departments: RawDepartment[];
  warnings: string[];
} {
  const deptMap = new Map<string, RawDepartment>();
  const allWarnings: string[] = [];
  let universityName = "";
  let year = 2027;
  let recruitmentSeason = "susi";

  for (const cr of results) {
    if (!cr.result) continue;
    universityName = cr.result.universityName || universityName;
    year = cr.result.year || year;
    recruitmentSeason = cr.result.recruitmentSeason || recruitmentSeason;
    allWarnings.push(...cr.result.warnings.map((w) => `[c${cr.index}:p${cr.startPage}-${cr.endPage}] ${w}`));

    for (const dept of cr.result.departments) {
      const existing = deptMap.get(dept.departmentName);
      if (!existing) {
        deptMap.set(dept.departmentName, structuredClone(dept));
        continue;
      }
      existing.campus ??= dept.campus;
      existing.trackHint ??= dept.trackHint;
      existing.totalQuotaHint ??= dept.totalQuotaHint;
      for (const incoming of dept.tracks) {
        const dup = existing.tracks.find((t) => t.trackName === incoming.trackName);
        if (!dup) {
          existing.tracks.push(structuredClone(incoming));
          continue;
        }
        if (dup.quotaInitial == null && incoming.quotaInitial != null) dup.quotaInitial = incoming.quotaInitial;
        if ((dup.reflectionStages == null || dup.reflectionStages.length === 0) && incoming.reflectionStages != null && incoming.reflectionStages.length > 0) {
          dup.reflectionStages = incoming.reflectionStages;
        }
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
        const pages = new Set([...dup.sourcePages, ...incoming.sourcePages]);
        dup.sourcePages = Array.from(pages).sort((a, b) => a - b);
      }
    }
  }

  return {
    universityName,
    year,
    recruitmentSeason,
    departments: Array.from(deptMap.values()),
    warnings: allWarnings,
  };
}

async function main(): Promise<void> {
  const opts = parseCli();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.startsWith("your_")) {
    console.error("❌ ANTHROPIC_API_KEY 미설정");
    process.exit(1);
  }
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 600_000 });

  const totalPages = getPageCount(opts.pdfPath);
  console.log(`== ${opts.universityId} PDF 처리 ==`);
  console.log(`PDF: ${opts.pdfPath} (${totalPages}p)`);
  console.log(`chunk size: ${opts.chunkSize}p`);

  const chunks = extractChunks(opts, totalPages);
  console.log(`청크 수: ${chunks.length}`);

  await fs.mkdir(opts.outDir, { recursive: true });
  const results: ChunkResult[] = [];
  for (const chunk of chunks) {
    const r = await analyzeChunk(client, chunk, opts);
    results.push(r);
    // 개별 청크 JSON 저장 (디버깅용)
    await fs.writeFile(
      path.join(opts.outDir, `${opts.universityId}-chunk-${String(chunk.index).padStart(2, "0")}.json`),
      JSON.stringify({ meta: { index: r.index, startPage: r.startPage, endPage: r.endPage, elapsedSec: r.elapsedSec, cost: r.cost, stopReason: r.stopReason, zodValid: r.zodValid, error: r.error }, result: r.result, raw: r.raw }, null, 2),
    );
  }

  const merged = mergeChunks(results);
  const totalCost = results.reduce((s, r) => s + r.cost, 0);
  const totalTime = results.reduce((s, r) => s + r.elapsedSec, 0);
  const ttot = merged.departments.reduce((s, d) => s + d.tracks.length, 0);

  const fullOut = {
    meta: {
      universityId: opts.universityId,
      universityName: merged.universityName,
      year: merged.year,
      recruitmentSeason: merged.recruitmentSeason,
      processedAt: new Date().toISOString(),
      totalCost: +totalCost.toFixed(4),
      totalElapsedSec: +totalTime.toFixed(1),
      totalPages,
      chunks: results.map((r) => ({ index: r.index, startPage: r.startPage, endPage: r.endPage, zodValid: r.zodValid, stopReason: r.stopReason, error: r.error })),
      model: MODEL,
    },
    result: { departments: merged.departments, warnings: merged.warnings },
  };
  const outPath = path.join(opts.outDir, `${opts.universityId}-full.json`);
  await fs.writeFile(outPath, JSON.stringify(fullOut, null, 2));

  console.log(`\n${"=".repeat(60)}`);
  console.log(`== ${opts.universityId} 머저 완료 ==`);
  console.log(`대학: ${merged.universityName}`);
  console.log(`학과: ${merged.departments.length}`);
  console.log(`전형 총: ${ttot}`);
  console.log(`총 비용: $${totalCost.toFixed(4)}`);
  console.log(`총 시간: ${totalTime.toFixed(1)}s`);
  console.log(`warnings: ${merged.warnings.length}`);
  console.log(`출력: ${outPath}`);
}

void main();
