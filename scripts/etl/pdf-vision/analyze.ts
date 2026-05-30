#!/usr/bin/env node
/**
 * PDF Vision 분석 스크립트 — 한국 대학 모집요강 PDF → 구조화 JSON (2026-05-30).
 *
 *   npx tsx scripts/etl/pdf-vision/analyze.ts --pdf=univ/SNU_2027_susi.pdf \
 *                                              --out=scripts/etl/pdf-vision/output/snu-susi.json \
 *                                              [--model=sonnet|opus] [--dry-run]
 *
 * 흐름:
 *   1. PDF 바이트 로드 → base64 인코딩
 *   2. Claude API 호출 (document content block, native PDF support)
 *   3. JSON 응답 파싱 + Zod 검증
 *   4. 결과 + 메타(비용·페이지수·model) 를 output JSON 으로 저장
 *
 * DB 적재 X — 검증 단계. 사용자 확인 후 별도 적재 스크립트 (load.ts) 작성.
 *
 * 정직성 (P-005):
 *   - PDF 미기재 항목은 null 그대로 보존 (가짜 기본값 X).
 *   - Zod 검증 실패한 응답은 raw 보존 + warnings 누적.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import Anthropic from "@anthropic-ai/sdk";
import { config as loadDotenv } from "dotenv";

import {
  PdfAnalysisResultSchema,
  type PdfAnalysisResult,
} from "./types";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt";

loadDotenv({ path: path.resolve(process.cwd(), ".env.local") });

/* ═══════════════════════════════════════════════════════════════════════
   CLI
   ═══════════════════════════════════════════════════════════════════════ */

interface CliOpts {
  pdfPath: string;
  outPath: string;
  model: "sonnet" | "opus";
  dryRun: boolean;
  /** 청크 PDF 의 원본 PDF 기준 시작 페이지 (1-indexed). 기본 1. */
  originalStartPage: number;
  /** max_tokens — tier upgrade 후 더 큰 값 권장. 기본 16000. */
  maxTokens: number;
}

function parseCli(): CliOpts {
  const arg = (k: string): string | undefined => {
    const m = process.argv.find((a) => a.startsWith(`--${k}=`));
    return m?.slice(k.length + 3);
  };
  const pdfPath = arg("pdf");
  const outPath = arg("out");
  if (!pdfPath || !outPath) {
    console.error("필수: --pdf=<path> --out=<path> [--start-page=N] [--max-tokens=N]");
    process.exit(1);
  }
  const modelArg = arg("model") ?? "sonnet";
  if (modelArg !== "sonnet" && modelArg !== "opus") {
    console.error("--model 은 sonnet 또는 opus");
    process.exit(1);
  }
  return {
    pdfPath: path.resolve(pdfPath),
    outPath: path.resolve(outPath),
    model: modelArg,
    dryRun: process.argv.includes("--dry-run"),
    originalStartPage: parseInt(arg("start-page") ?? "1", 10),
    maxTokens: parseInt(arg("max-tokens") ?? "16000", 10),
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   PDF 메타 (pdfinfo) — 페이지수·크기 검증
   ═══════════════════════════════════════════════════════════════════════ */

interface PdfMeta {
  pageCount: number;
  sizeMb: number;
}

function getPdfMeta(pdfPath: string): PdfMeta {
  const sizeMb = +(require("node:fs").statSync(pdfPath).size / 1024 / 1024).toFixed(2);
  const info = execFileSync("pdfinfo", [pdfPath], { encoding: "utf8" });
  const m = info.match(/Pages:\s+(\d+)/);
  if (!m) throw new Error("pdfinfo 출력에서 Pages 추출 실패");
  return { pageCount: parseInt(m[1], 10), sizeMb };
}

/* ═══════════════════════════════════════════════════════════════════════
   모델 매핑
   ═══════════════════════════════════════════════════════════════════════ */

const MODELS = {
  sonnet: "claude-sonnet-4-6",
  opus: "claude-opus-4-7",
} as const;

/* ═══════════════════════════════════════════════════════════════════════
   메인
   ═══════════════════════════════════════════════════════════════════════ */

async function main(): Promise<void> {
  const opts = parseCli();
  console.log(`== PDF Vision 분석 ==`);
  console.log(`PDF: ${opts.pdfPath}`);
  console.log(`Out: ${opts.outPath}`);
  console.log(`Model: ${opts.model} (${MODELS[opts.model]})`);
  console.log();

  // 1. PDF 메타
  const meta = getPdfMeta(opts.pdfPath);
  console.log(`📄 PDF 페이지: ${meta.pageCount}, 크기: ${meta.sizeMb}MB`);
  if (meta.pageCount > 100) {
    console.error(`❌ Claude 단일 호출 100 페이지 한도 초과 — chunking 필요 (별도 작업)`);
    process.exit(1);
  }
  if (meta.sizeMb > 32) {
    console.error(`❌ Claude 단일 PDF 32MB 한도 초과`);
    process.exit(1);
  }

  if (opts.dryRun) {
    console.log("--dry-run — API 호출 skip");
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.startsWith("your_")) {
    console.error("❌ ANTHROPIC_API_KEY 미설정");
    process.exit(1);
  }

  // 2. PDF base64 인코딩
  const pdfBytes = await fs.readFile(opts.pdfPath);
  const pdfBase64 = pdfBytes.toString("base64");

  // 3. Claude API 호출
  // 76 페이지 PDF + 64k 출력 = 8~12분 소요 가능. 안전 마진 15분.
  const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 900_000 });
  const startedAt = Date.now();

  console.log(`\n🚀 Claude API 호출 중... (timeout 15분)`);
  // 매 30s 마다 경과 시간 표시 (장기 호출 시각화)
  const progressTimer = setInterval(() => {
    const sec = ((Date.now() - startedAt) / 1000).toFixed(0);
    console.log(`   ⏱  ${sec}s 경과...`);
  }, 30_000);
  process.on("exit", () => clearInterval(progressTimer));

  // max_tokens 와 page offset 은 CLI 로 받음 — tier 업 후 자유롭게 조정.
  const userPrompt = buildUserPrompt(opts.originalStartPage, meta.pageCount);
  const response = await client.messages.create({
    model: MODELS[opts.model],
    max_tokens: opts.maxTokens,
    temperature: 0,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: pdfBase64,
            },
          },
          {
            type: "text",
            text: userPrompt,
          },
        ],
      },
    ],
  });

  clearInterval(progressTimer);
  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`✅ 응답 (${elapsedSec}s)`);
  console.log(`   input_tokens: ${response.usage.input_tokens}`);
  console.log(`   output_tokens: ${response.usage.output_tokens}`);
  console.log(`   stop_reason: ${response.stop_reason}`);

  // 4. 비용 추정
  const cost = estimateCost(opts.model, response.usage.input_tokens, response.usage.output_tokens);
  console.log(`   💰 추정 비용: $${cost.toFixed(4)}`);

  if (response.stop_reason === "max_tokens") {
    console.warn("⚠️  max_tokens 도달 — 응답 잘렸을 수 있음");
  }

  // 5. JSON 파싱
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("응답에 text 블록 없음");
  }
  const rawText = textBlock.text.trim();

  // JSON only — 혹시 ```json 펜스 있으면 제거
  let jsonText = rawText;
  if (jsonText.startsWith("```")) {
    jsonText = jsonText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  let parsed: unknown = null;
  let parseError: string | null = null;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    parseError = (e as Error).message;
    console.error("❌ JSON 파싱 실패:");
    console.error(`  reason: ${parseError}`);
    console.error(`  head: ${rawText.slice(0, 300)}`);
    console.error(`  tail: ${rawText.slice(-300)}`);
    // 실패해도 raw 보존하기 위해 throw 안 함 — 아래에서 저장
  }

  // 6. Zod 검증 (파싱 성공 시만)
  const validated = parsed !== null
    ? PdfAnalysisResultSchema.safeParse(parsed)
    : { success: false as const, error: { issues: [{ message: `JSON parse failed: ${parseError}` }] } };

  // 7. 결과 + 메타 저장
  await fs.mkdir(path.dirname(opts.outPath), { recursive: true });

  const output = {
    meta: {
      pdfPath: path.relative(process.cwd(), opts.pdfPath),
      pdfPages: meta.pageCount,
      pdfSizeMb: meta.sizeMb,
      model: MODELS[opts.model],
      modelLabel: opts.model,
      elapsedSec: +elapsedSec,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      estimatedCostUsd: +cost.toFixed(4),
      stopReason: response.stop_reason,
      analyzedAt: new Date().toISOString(),
      zodValid: validated.success,
      zodErrors: validated.success ? null : (validated as { error: { issues: unknown[] } }).error.issues.slice(0, 10),
      jsonParseError: parseError,
    },
    result: validated.success ? validated.data : null,
    rawIfInvalid: validated.success ? null : parsed,
    rawTextHeadIfInvalid: validated.success ? null : rawText.slice(0, 2000),
    rawTextTailIfInvalid: validated.success ? null : rawText.slice(-2000),
  };

  await fs.writeFile(opts.outPath, JSON.stringify(output, null, 2));
  console.log(`\n💾 ${opts.outPath} 저장 (${(JSON.stringify(output).length / 1024).toFixed(1)} KB)`);

  if (!validated.success) {
    console.warn(`⚠️  Zod 검증 실패 — rawIfInvalid 보존, 호출 측 수동 검수 필요`);
    console.warn(`   첫 에러: ${JSON.stringify(validated.error.issues[0])}`);
  } else {
    const r: PdfAnalysisResult = validated.data;
    console.log(`\n📊 추출 요약:`);
    console.log(`   대학: ${r.universityName} (${r.year})`);
    console.log(`   학과: ${r.departments.length}`);
    const totalTracks = r.departments.reduce((sum, d) => sum + d.tracks.length, 0);
    console.log(`   전형(track) 총: ${totalTracks}`);
    const specialTypes = new Set<string>();
    for (const d of r.departments) {
      for (const t of d.tracks) {
        if (t.specialTypeKeyword) specialTypes.add(t.specialTypeKeyword);
      }
    }
    console.log(`   특별전형 종류: ${[...specialTypes].join(", ") || "(없음)"}`);
    console.log(`   warnings: ${r.warnings.length}`);
    if (r.warnings.length > 0) {
      r.warnings.slice(0, 5).forEach((w) => console.log(`     · ${w}`));
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   비용 추정 — Anthropic 가격표 기준 (2026-05 기준 추정치)
   ═══════════════════════════════════════════════════════════════════════ */

function estimateCost(model: "sonnet" | "opus", inputTokens: number, outputTokens: number): number {
  // Sonnet 4.6: input $3/M, output $15/M
  // Opus 4.7:   input $15/M, output $75/M
  const rates = {
    sonnet: { input: 3, output: 15 },
    opus: { input: 15, output: 75 },
  } as const;
  const r = rates[model];
  return (inputTokens * r.input + outputTokens * r.output) / 1_000_000;
}

main().catch((e) => {
  console.error("❌ 실패:", e);
  process.exit(1);
});
