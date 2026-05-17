#!/usr/bin/env node
/**
 * university/*.pdf 6개 → data/parsed-admissions/{slug}.json 드라이런
 *
 * 모집요강 PDF 파싱 파이프라인 (pdftotext + normalizer)의 1차 진입점.
 * 옵션 A(클라이언트 직접 데이터 제공) / B·C(공공API) 어느 쪽이든 보유한 PDF에서
 * 추출 가능한 정보 (학과명 / 트랙 / 수능최저 / 반영비율)를 미리 뽑아 검증·보강용으로 사용.
 *
 * Firestore 미적재 — admissions-sync.ts 와 달리 본 스크립트는 파싱 결과를 로컬
 * JSON 으로만 떨군다. 검수 후 admissionsStaging 으로 옮기는 단계는 별도.
 *
 *   npx tsx scripts/etl/parse-pdfs.ts
 *
 * 외부 의존: poppler-utils 의 pdftotext 바이너리 (apt-get install poppler-utils).
 */
import fs from "node:fs";
import path from "node:path";
import { extractTextFromPdf, PdfExtractionError } from "./parsers/pdf-text";
import { normalizeAdmissionText } from "./parsers/normalizer";

const ROOT = process.cwd();
const PDF_DIR = path.resolve(ROOT, "university");
const OUT_DIR = path.resolve(ROOT, "data/parsed-admissions");
/** JSON 산출물에 raw text 도 일부 보존 — 운영자 시각 검수용. 전체는 너무 큼. */
const RAW_TEXT_PREVIEW_CHARS = 8000;

interface SummaryRow {
  file: string;
  ok: boolean;
  trustLevel?: string;
  tool?: string;
  textLength?: number;
  deptCount?: number;
  trackKindMatches?: number;
  csatMin?: boolean;
  reflectionRatio?: boolean;
  unparsedSections?: number;
  elapsedMs: number;
  error?: string;
}

async function main(): Promise<void> {
  if (!fs.existsSync(PDF_DIR)) {
    console.error(`❌ PDF 디렉토리 없음: ${PDF_DIR}`);
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const pdfs = fs
    .readdirSync(PDF_DIR)
    .filter((f) => f.toLowerCase().endsWith(".pdf"));
  if (pdfs.length === 0) {
    console.error(`❌ ${PDF_DIR} 에 PDF 없음`);
    process.exit(1);
  }

  console.log(`📂 ${pdfs.length}개 PDF 파싱 시작 → ${OUT_DIR}`);
  const summary: SummaryRow[] = [];

  for (const pdf of pdfs) {
    const pdfPath = path.join(PDF_DIR, pdf);
    const slug = slugify(pdf);
    const sizeMb = (fs.statSync(pdfPath).size / 1024 / 1024).toFixed(1);
    const start = Date.now();
    console.log(`\n→ ${pdf} (${sizeMb}MB)`);

    try {
      const extraction = await extractTextFromPdf(pdfPath);
      const normalized = normalizeAdmissionText(extraction.text, {
        inputTrustLevel: extraction.trustLevel,
      });
      const elapsed = Date.now() - start;

      const outPath = path.join(OUT_DIR, `${slug}.json`);
      fs.writeFileSync(
        outPath,
        JSON.stringify(
          {
            source: { file: pdf, slug, sizeMb: Number(sizeMb) },
            extraction: {
              trustLevel: extraction.trustLevel,
              tool: extraction.tool,
              textLength: extraction.text.length,
              attempts: extraction.attempts,
              preview: extraction.text.slice(0, RAW_TEXT_PREVIEW_CHARS),
              truncated: extraction.text.length > RAW_TEXT_PREVIEW_CHARS,
            },
            normalized,
          },
          null,
          2,
        ),
      );

      console.log(
        `  ✅ trust=${extraction.trustLevel} text=${extraction.text.length}c depts=${normalized.departmentNameCandidates.length} tracks=${normalized.trackKindCandidates.length} unparsed=${normalized.unparsedSections.length} (${elapsed}ms)`,
      );

      summary.push({
        file: pdf,
        ok: true,
        trustLevel: extraction.trustLevel,
        tool: extraction.tool,
        textLength: extraction.text.length,
        deptCount: normalized.departmentNameCandidates.length,
        trackKindMatches: normalized.trackKindCandidates.length,
        csatMin: !!normalized.csatMinimumPartial,
        reflectionRatio: !!normalized.reflectionRatioPartial,
        unparsedSections: normalized.unparsedSections.length,
        elapsedMs: elapsed,
      });
    } catch (e) {
      const elapsed = Date.now() - start;
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`  ❌ ${msg}`);
      if (e instanceof PdfExtractionError) {
        console.error(`     attempts: ${JSON.stringify(e.attempts)}`);
      }
      summary.push({ file: pdf, ok: false, error: msg.slice(0, 200), elapsedMs: elapsed });
    }
  }

  const summaryPath = path.join(OUT_DIR, "_summary.json");
  fs.writeFileSync(
    summaryPath,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), pdfDir: PDF_DIR, summary },
      null,
      2,
    ),
  );

  console.log("\n📊 요약:");
  console.table(summary);
  console.log(`\n전체 요약 저장: ${summaryPath}`);
}

/** 한글 + 영문 + 숫자만 남기고 - 로 연결 — 파일명 안전화 */
function slugify(filename: string): string {
  return filename
    .replace(/\.pdf$/i, "")
    .replace(/[^a-zA-Z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

main().catch((e) => {
  console.error("❌ 전체 실패:", e);
  process.exit(1);
});
